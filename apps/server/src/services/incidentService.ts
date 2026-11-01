import { createHash } from 'node:crypto';
import {
  type ConflictDetails,
  type CreateIncidentBody,
  type DeleteIncidentResponse,
  type Incident,
  type IncidentResponse,
  type ServerEvent,
  type UpdateIncidentBody,
  pickIncidentFields,
} from '@airgap/shared';
import type { Database, Sql } from '../database/db';
import type { Repository } from '../database/repository';
import { ApiError } from '../utils/errors';
import type { EventBus } from './eventBus';

export type MutationKind = 'CREATE_INCIDENT' | 'UPDATE_INCIDENT' | 'DELETE_INCIDENT';

export interface MutationResult<T> {
  statusCode: number;
  body: T;
  /** True when this response was served from the idempotency store. */
  replayed: boolean;
}

interface Applied<T> {
  statusCode: number;
  body: T;
  events: ServerEvent[];
}

const EVENTS_RETAINED_PER_SESSION = 5000;

function hashRequest(kind: MutationKind, entityId: string, payload: unknown): string {
  return createHash('sha256')
    .update(`${kind}\n${entityId}\n${JSON.stringify(payload)}`)
    .digest('hex');
}

/**
 * Applies client mutations with two guarantees:
 *
 * 1. Idempotency — every write carries a client-generated Idempotency-Key. The
 *    write and the stored response are committed in the same transaction, so a
 *    retried request (e.g. after a lost response) replays the original result
 *    instead of applying the change twice.
 * 2. Optimistic concurrency — updates and deletes must name the version they
 *    were based on. The version check is part of the UPDATE's WHERE clause, so
 *    check-and-write is atomic.
 *
 * Each write transaction first row-locks its demo session, so concurrent
 * requests for one session (two tabs, a retry racing the original) are
 * serialized and cannot both pass the idempotency check.
 *
 * Failed attempts (conflicts, validation errors) are NOT recorded as processed:
 * they change nothing, and the client resolves them with a brand-new mutation.
 */
export class IncidentService {
  constructor(
    private readonly db: Database,
    private readonly repo: Repository,
    private readonly bus: EventBus,
    private readonly maxIncidentsPerSession: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(
    sessionId: string,
    mutationId: string,
    body: CreateIncidentBody,
  ): Promise<MutationResult<IncidentResponse>> {
    return this.runIdempotent(
      sessionId,
      mutationId,
      'CREATE_INCIDENT',
      body.id,
      body,
      async (tx) => {
        if (await this.repo.getIncident(tx, sessionId, body.id)) {
          throw new ApiError(409, 'ALREADY_EXISTS', 'An incident with this id already exists', {
            incidentId: body.id,
          });
        }
        if ((await this.repo.countLiveIncidents(tx, sessionId)) >= this.maxIncidentsPerSession) {
          throw new ApiError(
            422,
            'LIMIT_REACHED',
            'This demo session has reached its incident limit',
          );
        }
        const now = this.now().toISOString();
        const createdAt = body.createdAt && body.createdAt <= now ? body.createdAt : now;
        const incident: Incident = {
          ...pickIncidentFields(body),
          id: body.id,
          createdAt: new Date(createdAt).toISOString(),
          updatedAt: now,
          version: 1,
        };
        await this.repo.insertIncidents(tx, sessionId, [incident]);
        await this.repo.insertIncidentVersions(tx, sessionId, [
          { incident, mutationId, deleted: false },
        ]);
        const event = await this.recordEvent(
          tx,
          sessionId,
          'incident.created',
          incident,
          incident.id,
          mutationId,
          'client',
        );
        return { statusCode: 201, body: { incident }, events: [event] };
      },
    );
  }

  update(
    sessionId: string,
    mutationId: string,
    incidentId: string,
    body: UpdateIncidentBody,
  ): Promise<MutationResult<IncidentResponse>> {
    return this.runIdempotent(
      sessionId,
      mutationId,
      'UPDATE_INCIDENT',
      incidentId,
      body,
      async (tx) => {
        const current = await this.requireLive(tx, sessionId, incidentId, body.baseVersion);
        if (current.version !== body.baseVersion) throw this.conflict(current, body.baseVersion);
        const next: Incident = {
          ...current,
          ...body.changes,
          assignedTo:
            body.changes.assignedTo === undefined ? current.assignedTo : body.changes.assignedTo,
          updatedAt: this.now().toISOString(),
          version: current.version + 1,
        };
        if (!(await this.repo.updateIncidentIfVersion(tx, sessionId, next, body.baseVersion))) {
          // Unreachable while the session lock is held, kept as a defensive CAS check.
          const latest = await this.repo.getIncident(tx, sessionId, incidentId);
          throw this.conflict(latest!.incident, body.baseVersion);
        }
        await this.repo.insertIncidentVersions(tx, sessionId, [
          { incident: next, mutationId, deleted: false },
        ]);
        const event = await this.recordEvent(
          tx,
          sessionId,
          'incident.updated',
          next,
          next.id,
          mutationId,
          'client',
        );
        return { statusCode: 200, body: { incident: next }, events: [event] };
      },
    );
  }

  delete(
    sessionId: string,
    mutationId: string,
    incidentId: string,
    baseVersion: number,
  ): Promise<MutationResult<DeleteIncidentResponse>> {
    return this.runIdempotent(
      sessionId,
      mutationId,
      'DELETE_INCIDENT',
      incidentId,
      { baseVersion },
      async (tx) => {
        const stored = await this.repo.getIncident(tx, sessionId, incidentId);
        if (!stored) throw new ApiError(404, 'NOT_FOUND', 'Incident not found');
        if (stored.deletedAt) {
          // Deleting something already deleted is a no-op success: the intent holds.
          return {
            statusCode: 200,
            body: { id: incidentId, deleted: true as const, version: stored.incident.version },
            events: [],
          };
        }
        if (stored.incident.version !== baseVersion) {
          throw this.conflict(stored.incident, baseVersion);
        }
        const now = this.now().toISOString();
        if (
          !(await this.repo.tombstoneIncidentIfVersion(tx, sessionId, incidentId, baseVersion, now))
        ) {
          const latest = await this.repo.getIncident(tx, sessionId, incidentId);
          throw this.conflict(latest!.incident, baseVersion);
        }
        const tombstone = { ...stored.incident, updatedAt: now, version: baseVersion + 1 };
        await this.repo.insertIncidentVersions(tx, sessionId, [
          { incident: tombstone, mutationId, deleted: true },
        ]);
        const event = await this.recordEvent(
          tx,
          sessionId,
          'incident.deleted',
          tombstone,
          incidentId,
          mutationId,
          'client',
        );
        return {
          statusCode: 200,
          body: { id: incidentId, deleted: true as const, version: tombstone.version },
          events: [event],
        };
      },
    );
  }

  /** Demo-only: a "colleague" edits an incident directly on the server. */
  async remoteEdit(
    sessionId: string,
    incidentId?: string,
  ): Promise<{ incident: Incident; changedFields: string[] }> {
    const { result, events } = await this.db.transaction(async (tx) => {
      await this.repo.lockSession(tx, sessionId);
      let target: Incident | undefined;
      if (incidentId) {
        const stored = await this.repo.getIncident(tx, sessionId, incidentId);
        if (!stored || stored.deletedAt) {
          throw new ApiError(404, 'NOT_FOUND', 'Incident not found');
        }
        target = stored.incident;
      } else {
        const live = await this.repo.listIncidents(tx, sessionId);
        target = live.find((incident) => incident.status !== 'resolved') ?? live[0];
        if (!target) throw new ApiError(404, 'NOT_FOUND', 'No incidents available to edit');
      }
      const nextStatus = target.status === 'investigating' ? 'open' : 'investigating';
      const operators = ['Remote Ops — K. Okafor', 'Remote Ops — S. Lindqvist'];
      const nextAssignee = target.assignedTo === operators[0] ? operators[1]! : operators[0]!;
      const stamp = this.now().toISOString().slice(11, 19);
      const next: Incident = {
        ...target,
        status: nextStatus,
        assignedTo: nextAssignee,
        description:
          `${target.description}\n[Remote update ${stamp} UTC] Field team escalated after on-site inspection.`.slice(
            0,
            2000,
          ),
        updatedAt: this.now().toISOString(),
        version: target.version + 1,
      };
      await this.repo.updateIncidentIfVersion(tx, sessionId, next, target.version);
      await this.repo.insertIncidentVersions(tx, sessionId, [
        { incident: next, mutationId: null, deleted: false },
      ]);
      const event = await this.recordEvent(
        tx,
        sessionId,
        'incident.updated',
        next,
        next.id,
        null,
        'remote-demo',
      );
      return {
        result: { incident: next, changedFields: ['status', 'assignedTo', 'description'] },
        events: [event],
      };
    });
    for (const event of events) this.bus.publish(sessionId, event);
    return result;
  }

  private async requireLive(
    tx: Sql,
    sessionId: string,
    incidentId: string,
    baseVersion: number,
  ): Promise<Incident> {
    const stored = await this.repo.getIncident(tx, sessionId, incidentId);
    if (!stored) throw new ApiError(404, 'NOT_FOUND', 'Incident not found');
    if (stored.deletedAt) {
      const details: ConflictDetails = {
        incidentId,
        expectedVersion: baseVersion,
        actualVersion: stored.incident.version,
        serverIncident: null,
        deleted: true,
      };
      throw new ApiError(410, 'INCIDENT_DELETED', 'Incident was deleted on the server', details);
    }
    return stored.incident;
  }

  private conflict(current: Incident, expectedVersion: number): ApiError {
    const details: ConflictDetails = {
      incidentId: current.id,
      expectedVersion,
      actualVersion: current.version,
      serverIncident: current,
      deleted: false,
    };
    return new ApiError(
      409,
      'VERSION_CONFLICT',
      `Version conflict: expected v${expectedVersion}, server is at v${current.version}`,
      details,
    );
  }

  private async recordEvent(
    tx: Sql,
    sessionId: string,
    type: ServerEvent['type'],
    incident: Incident | null,
    incidentId: string | null,
    mutationId: string | null,
    source: ServerEvent['source'],
  ): Promise<ServerEvent> {
    const event = await this.repo.insertEvent(
      tx,
      sessionId,
      type,
      incident,
      incidentId,
      mutationId,
      source,
      this.now().toISOString(),
    );
    if (event.seq % 250 === 0) {
      await this.repo.pruneEvents(tx, sessionId, EVENTS_RETAINED_PER_SESSION);
    }
    return event;
  }

  private async runIdempotent<T>(
    sessionId: string,
    mutationId: string,
    kind: MutationKind,
    entityId: string,
    payload: unknown,
    apply: (tx: Sql) => Promise<Applied<T>>,
  ): Promise<MutationResult<T>> {
    const requestHash = hashRequest(kind, entityId, payload);
    const outcome = await this.db.transaction(async (tx) => {
      if (!(await this.repo.lockSession(tx, sessionId))) {
        throw new ApiError(401, 'SESSION_NOT_FOUND', 'Unknown or expired demo session');
      }
      const processed = await this.repo.getProcessedMutation(tx, sessionId, mutationId);
      if (processed) {
        if (processed.request_hash !== requestHash) {
          throw new ApiError(
            422,
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used for a different request',
          );
        }
        return {
          statusCode: processed.status_code,
          body: JSON.parse(processed.response) as T,
          replayed: true,
          events: [] as ServerEvent[],
        };
      }
      const applied = await apply(tx);
      await this.repo.insertProcessedMutation(
        tx,
        sessionId,
        mutationId,
        kind,
        entityId,
        requestHash,
        applied.statusCode,
        applied.body,
        this.now().toISOString(),
      );
      return { ...applied, replayed: false };
    });
    // Publish only after COMMIT so subscribers never observe rolled-back state.
    for (const event of outcome.events) this.bus.publish(sessionId, event);
    return { statusCode: outcome.statusCode, body: outcome.body, replayed: outcome.replayed };
  }
}

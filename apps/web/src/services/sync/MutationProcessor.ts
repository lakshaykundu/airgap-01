import {
  conflictDetailsSchema,
  incidentCode,
  type ConflictDetails,
  type CreateIncidentBody,
  type Incident,
  type IncidentChanges,
} from '@airgap/shared';
import { logActivity } from '../../database/activity';
import type { AirgapDatabase, QueuedMutation } from '../../database/db';
import { refreshSyncStatus } from '../../database/incidentStore';
import type { ApiClient } from '../api/client';
import { HttpError, NetworkError } from '../api/transport';
import { mutationPayloadSchemas } from './mutationSchemas';
import { classifyError, computeRetryDelay, RETRY_POLICY } from './RetryManager';

export type MutationOutcome =
  | {
      kind: 'acked';
      incident: Incident | null;
      version: number;
      replayed: boolean;
      durationMs: number;
    }
  | { kind: 'conflict'; details: ConflictDetails; message: string }
  | { kind: 'retry'; message: string; code: string }
  | { kind: 'failed'; message: string; code: string }
  | { kind: 'session-expired'; message: string };

/** Sends one mutation and translates the result into an outcome. Never throws. */
export async function sendMutation(
  api: ApiClient,
  mutation: QueuedMutation,
): Promise<MutationOutcome> {
  const parsed = mutationPayloadSchemas[mutation.type].safeParse(mutation.payload);
  if (!parsed.success) {
    return { kind: 'failed', code: 'INVALID_PAYLOAD', message: 'Queued payload failed validation' };
  }
  try {
    switch (mutation.type) {
      case 'CREATE_INCIDENT': {
        const res = await api.createIncident(mutation.id, parsed.data as CreateIncidentBody);
        return {
          kind: 'acked',
          incident: res.data.incident,
          version: res.data.incident.version,
          replayed: res.replayed,
          durationMs: res.durationMs,
        };
      }
      case 'UPDATE_INCIDENT': {
        if (!mutation.baseVersion) {
          // Its CREATE has not been acknowledged yet; the engine should never get here.
          return {
            kind: 'retry',
            code: 'DEPENDENCY_PENDING',
            message: 'Waiting for the create to be acknowledged',
          };
        }
        const { changes } = parsed.data as { changes: IncidentChanges };
        const res = await api.updateIncident(
          mutation.id,
          mutation.entityId,
          mutation.baseVersion,
          changes,
        );
        return {
          kind: 'acked',
          incident: res.data.incident,
          version: res.data.incident.version,
          replayed: res.replayed,
          durationMs: res.durationMs,
        };
      }
      case 'DELETE_INCIDENT': {
        if (!mutation.baseVersion) {
          return {
            kind: 'retry',
            code: 'DEPENDENCY_PENDING',
            message: 'Waiting for the create to be acknowledged',
          };
        }
        const res = await api.deleteIncident(mutation.id, mutation.entityId, mutation.baseVersion);
        return {
          kind: 'acked',
          incident: null,
          version: res.data.version,
          replayed: res.replayed,
          durationMs: res.durationMs,
        };
      }
    }
  } catch (error) {
    const kind = classifyError(error);
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof HttpError
        ? error.code
        : error instanceof NetworkError
          ? error.kind
          : 'UNKNOWN';
    if (kind === 'conflict' && error instanceof HttpError) {
      const details = conflictDetailsSchema.safeParse(error.details);
      if (details.success) return { kind: 'conflict', details: details.data, message };
      return { kind: 'failed', code, message };
    }
    if (kind === 'session-expired') return { kind: 'session-expired', message };
    if (kind === 'retryable') return { kind: 'retry', code, message };
    return { kind: 'failed', code, message };
  }
}

export interface ApplyDeps {
  now?: () => Date;
  random?: () => number;
}

/**
 * Persists the result of one attempt. Everything for a single outcome happens
 * in one IndexedDB transaction: the mutation is removed only together with the
 * local record update that reflects the server's acknowledgement.
 */
export async function applyOutcome(
  db: AirgapDatabase,
  mutation: QueuedMutation,
  outcome: MutationOutcome,
  deps: ApplyDeps = {},
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const code = incidentCode(mutation.entityId);
  await db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    const stored = await db.mutationQueue.get(mutation.seq!);
    if (!stored || stored.id !== mutation.id) return; // resolved or reset meanwhile

    switch (outcome.kind) {
      case 'acked': {
        await db.mutationQueue.delete(mutation.seq!);
        const remaining = await db.mutationQueue
          .where('entityId')
          .equals(mutation.entityId)
          .sortBy('seq');
        // Every later mutation for this entity was made on top of this one, so
        // its base becomes the version the server just assigned.
        for (const later of remaining) {
          if (later.type !== 'CREATE_INCIDENT') {
            await db.mutationQueue.update(later.seq!, { baseVersion: outcome.version });
          }
        }
        const local = await db.incidents.get(mutation.entityId);
        if (mutation.type === 'DELETE_INCIDENT') {
          if (remaining.length === 0) await db.incidents.delete(mutation.entityId);
        } else if (local) {
          if (remaining.length === 0 && outcome.incident) {
            // Nothing else pending: adopt the authoritative server state.
            await db.incidents.put({
              ...outcome.incident,
              syncStatus: 'synced',
              deleted: local.deleted,
            });
          } else {
            await db.incidents.update(mutation.entityId, { version: outcome.version });
            await refreshSyncStatus(db, mutation.entityId);
          }
        }
        await logActivity(db, {
          type: 'MUTATION_ACKNOWLEDGED',
          category: 'sync',
          level: 'success',
          message: outcome.replayed
            ? `${mutation.type} ${code} — server replayed the stored result (already applied, no duplicate write)`
            : `${mutation.type} ${code} acknowledged — server v${outcome.version} (${outcome.durationMs} ms)`,
          entityId: mutation.entityId,
          mutationId: mutation.id,
          meta: {
            replayed: outcome.replayed,
            version: outcome.version,
            durationMs: outcome.durationMs,
            mutationType: mutation.type,
          },
        });
        if (outcome.replayed) {
          await logActivity(db, {
            type: 'IDEMPOTENT_REPLAY',
            category: 'server',
            level: 'warning',
            message: `Idempotency key ${mutation.id.slice(0, 8)} matched a processed mutation — duplicate prevented`,
            entityId: mutation.entityId,
            mutationId: mutation.id,
          });
        }
        return;
      }
      case 'conflict': {
        await db.mutationQueue.update(mutation.seq!, {
          status: 'conflict',
          conflict: outcome.details,
          lastError: outcome.message,
          lastErrorCode: outcome.details.deleted ? 'INCIDENT_DELETED' : 'VERSION_CONFLICT',
          nextRetryAt: undefined,
        });
        await refreshSyncStatus(db, mutation.entityId);
        await logActivity(db, {
          type: 'CONFLICT_DETECTED',
          category: 'sync',
          level: 'error',
          message: outcome.details.deleted
            ? `${code}: incident was deleted on the server while you edited it`
            : `${code}: based on v${outcome.details.expectedVersion}, server is at v${outcome.details.actualVersion}`,
          entityId: mutation.entityId,
          mutationId: mutation.id,
        });
        return;
      }
      case 'retry': {
        const retryCount = stored.retryCount + 1;
        if (retryCount > RETRY_POLICY.maxAutoRetries) {
          await db.mutationQueue.update(mutation.seq!, {
            status: 'failed',
            retryCount,
            lastError: `${outcome.message} — gave up after ${RETRY_POLICY.maxAutoRetries} automatic retries`,
            lastErrorCode: outcome.code,
            nextRetryAt: undefined,
          });
          await refreshSyncStatus(db, mutation.entityId);
          await logActivity(db, {
            type: 'MUTATION_FAILED',
            category: 'sync',
            level: 'error',
            message: `${mutation.type} ${code} parked after ${retryCount - 1} retries — retry manually`,
            entityId: mutation.entityId,
            mutationId: mutation.id,
          });
          return;
        }
        const delay = computeRetryDelay(retryCount, deps.random);
        const nextRetryAt = new Date(now.getTime() + delay).toISOString();
        await db.mutationQueue.update(mutation.seq!, {
          status: 'queued',
          retryCount,
          nextRetryAt,
          lastError: outcome.message,
          lastErrorCode: outcome.code,
        });
        await refreshSyncStatus(db, mutation.entityId);
        await logActivity(db, {
          type: outcome.code === 'response-lost' ? 'RESPONSE_LOST' : 'MUTATION_RETRY_SCHEDULED',
          category: 'sync',
          level: 'warning',
          message:
            outcome.code === 'response-lost'
              ? `${mutation.type} ${code}: server applied it but the response was lost — will retry with the same idempotency key in ${(delay / 1000).toFixed(1)} s`
              : `${mutation.type} ${code} failed (${outcome.message}) — retry #${retryCount} in ${(delay / 1000).toFixed(1)} s`,
          entityId: mutation.entityId,
          mutationId: mutation.id,
          meta: { retryCount, delayMs: delay },
        });
        return;
      }
      case 'failed': {
        await db.mutationQueue.update(mutation.seq!, {
          status: 'failed',
          lastError: outcome.message,
          lastErrorCode: outcome.code,
          nextRetryAt: undefined,
        });
        await refreshSyncStatus(db, mutation.entityId);
        await logActivity(db, {
          type: 'MUTATION_FAILED',
          category: 'sync',
          level: 'error',
          message: `${mutation.type} ${code} rejected: ${outcome.message} (not retried automatically)`,
          entityId: mutation.entityId,
          mutationId: mutation.id,
        });
        return;
      }
      case 'session-expired': {
        await db.mutationQueue.update(mutation.seq!, { status: 'queued' });
        await refreshSyncStatus(db, mutation.entityId);
        return;
      }
    }
  });
}

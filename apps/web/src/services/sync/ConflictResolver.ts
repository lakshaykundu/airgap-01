import {
  diffIncidentFields,
  incidentCode,
  incidentFieldsSchema,
  pickIncidentFields,
  type ConflictDetails,
  type IncidentFields,
} from '@airgap/shared';
import { logActivity } from '../../database/activity';
import type { AirgapDatabase, LocalIncident, QueuedMutation } from '../../database/db';
import { describeChanges, pendingMutationsFor } from '../../database/incidentStore';

export interface ConflictView {
  entityId: string;
  mutation: QueuedMutation;
  details: ConflictDetails;
  local: LocalIncident;
  /** Fields where the local version and the server version disagree. */
  differingFields: (keyof IncidentFields)[];
}

export async function loadConflict(
  db: AirgapDatabase,
  entityId: string,
): Promise<ConflictView | null> {
  const pending = await pendingMutationsFor(db, entityId);
  const mutation = pending.find((m) => m.status === 'conflict' && m.conflict);
  const local = await db.incidents.get(entityId);
  if (!mutation?.conflict || !local) return null;
  const server = mutation.conflict.serverIncident;
  return {
    entityId,
    mutation,
    details: mutation.conflict,
    local,
    differingFields: server
      ? diffIncidentFields(pickIncidentFields(local), pickIncidentFields(server))
      : [],
  };
}

interface ResolveDeps {
  uuid?: () => string;
  now?: () => Date;
}

/**
 * Replaces every outstanding mutation for the entity with ONE new mutation
 * (fresh idempotency key) based on the server's current version. It keeps the
 * queue position of the conflicting mutation so ordering is preserved.
 */
async function replacePending(
  db: AirgapDatabase,
  pending: QueuedMutation[],
  replacement: Omit<
    QueuedMutation,
    'seq' | 'status' | 'retryCount' | 'attempts' | 'createdAt' | 'id'
  > | null,
  deps: ResolveDeps,
): Promise<QueuedMutation | null> {
  const position = Math.min(...pending.map((m) => m.seq!));
  await db.mutationQueue.bulkDelete(pending.map((m) => m.seq!));
  if (!replacement) return null;
  const mutation: QueuedMutation = {
    ...replacement,
    seq: position,
    id: (deps.uuid ?? (() => crypto.randomUUID()))(),
    status: 'queued',
    attempts: 0,
    retryCount: 0,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  await db.mutationQueue.put(mutation);
  return mutation;
}

/**
 * Resolve by writing `finalFields` on top of the server's current version.
 * Used by both KEEP MY CHANGES (finalFields = local) and REVIEW & MERGE.
 */
async function resolveWith(
  db: AirgapDatabase,
  entityId: string,
  finalFields: IncidentFields | 'delete',
  strategy: 'keep-local' | 'merge',
  deps: ResolveDeps,
): Promise<void> {
  await db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    const view = await loadConflict(db, entityId);
    if (!view) throw new Error('No conflict to resolve for this incident');
    const pending = await pendingMutationsFor(db, entityId);
    const { details, local } = view;
    const code = incidentCode(entityId);

    if (details.deleted || !details.serverIncident) {
      // The server copy is gone. Keeping local work means re-creating it under a new id.
      await replacePending(db, pending, null, deps);
      await db.incidents.delete(entityId);
      if (finalFields !== 'delete') {
        const newId = (deps.uuid ?? (() => crypto.randomUUID()))();
        const now = (deps.now?.() ?? new Date()).toISOString();
        await db.incidents.add({
          ...finalFields,
          id: newId,
          createdAt: now,
          updatedAt: now,
          version: 0,
          syncStatus: 'pending',
          deleted: 0,
        });
        await db.mutationQueue.add({
          id: (deps.uuid ?? (() => crypto.randomUUID()))(),
          type: 'CREATE_INCIDENT',
          entityId: newId,
          payload: { ...finalFields, id: newId, createdAt: now },
          status: 'queued',
          attempts: 0,
          retryCount: 0,
          createdAt: now,
          label: `Re-create “${finalFields.title}”`,
        });
        await logActivity(db, {
          type: 'CONFLICT_RESOLVED',
          category: 'sync',
          level: 'success',
          message: `${code} was deleted remotely — your version was re-created as ${incidentCode(newId)}`,
          entityId: newId,
        });
      }
      return;
    }

    const server = details.serverIncident;
    if (finalFields === 'delete') {
      await replacePending(
        db,
        pending,
        {
          type: 'DELETE_INCIDENT',
          entityId,
          payload: {},
          baseVersion: server.version,
          label: `Delete “${server.title}”`,
        },
        deps,
      );
      await db.incidents.put({ ...server, syncStatus: 'pending', deleted: 1 });
    } else {
      const fields = incidentFieldsSchema.parse(finalFields);
      const changedKeys = diffIncidentFields(pickIncidentFields(server), fields);
      if (changedKeys.length === 0) {
        await replacePending(db, pending, null, deps);
        await db.incidents.put({ ...server, syncStatus: 'synced', deleted: 0 });
      } else {
        const changes = Object.fromEntries(changedKeys.map((key) => [key, fields[key]]));
        await replacePending(
          db,
          pending,
          {
            type: 'UPDATE_INCIDENT',
            entityId,
            payload: { changes },
            baseVersion: server.version,
            label: describeChanges(changes),
          },
          deps,
        );
        await db.incidents.put({
          ...server,
          ...fields,
          updatedAt: (deps.now?.() ?? new Date()).toISOString(),
          // The local copy is now based on the server version we just saw.
          version: server.version,
          syncStatus: 'pending',
          deleted: 0,
        });
      }
    }
    await logActivity(db, {
      type: 'CONFLICT_RESOLVED',
      category: 'sync',
      level: 'success',
      message:
        strategy === 'merge'
          ? `${code}: merged version queued on top of server v${server.version}`
          : `${code}: kept local changes, re-queued on top of server v${server.version}`,
      entityId,
      meta: { strategy, serverVersion: server.version, localWasDeleted: local.deleted === 1 },
    });
  });
}

export async function keepLocalChanges(
  db: AirgapDatabase,
  entityId: string,
  deps: ResolveDeps = {},
): Promise<void> {
  const view = await loadConflict(db, entityId);
  if (!view) throw new Error('No conflict to resolve for this incident');
  await resolveWith(
    db,
    entityId,
    view.local.deleted ? 'delete' : pickIncidentFields(view.local),
    'keep-local',
    deps,
  );
}

export async function mergeChanges(
  db: AirgapDatabase,
  entityId: string,
  merged: IncidentFields,
  deps: ResolveDeps = {},
): Promise<void> {
  await resolveWith(db, entityId, merged, 'merge', deps);
}

/** Discards every local mutation for the entity and adopts the server's copy. */
export async function acceptServerVersion(db: AirgapDatabase, entityId: string): Promise<void> {
  await db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    const view = await loadConflict(db, entityId);
    if (!view) throw new Error('No conflict to resolve for this incident');
    const pending = await pendingMutationsFor(db, entityId);
    await db.mutationQueue.bulkDelete(pending.map((m) => m.seq!));
    if (view.details.serverIncident && !view.details.deleted) {
      await db.incidents.put({ ...view.details.serverIncident, syncStatus: 'synced', deleted: 0 });
    } else {
      await db.incidents.delete(entityId);
    }
    await logActivity(db, {
      type: 'CONFLICT_RESOLVED',
      category: 'sync',
      level: 'success',
      message: `${incidentCode(entityId)}: accepted server version — ${pending.length} local mutation(s) discarded`,
      entityId,
      meta: { strategy: 'accept-server' },
    });
  });
}

/** Requeues permanently failed mutations (user-initiated RETRY FAILED). */
export async function retryFailedMutations(db: AirgapDatabase, entityId?: string): Promise<number> {
  return db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    const failed = await db.mutationQueue.where('status').equals('failed').toArray();
    const targets = entityId ? failed.filter((m) => m.entityId === entityId) : failed;
    for (const m of targets) {
      await db.mutationQueue.update(m.seq!, {
        status: 'queued',
        retryCount: 0,
        nextRetryAt: undefined,
      });
      await db.incidents.update(m.entityId, { syncStatus: 'pending' });
    }
    if (targets.length > 0) {
      await logActivity(db, {
        type: 'MUTATION_REQUEUED',
        category: 'sync',
        level: 'info',
        message: `${targets.length} failed mutation(s) re-queued by the operator`,
      });
    }
    return targets.length;
  });
}

/** Drops a failed mutation and every later one for the same entity, restoring the server copy on next refresh. */
export async function discardMutationsFor(db: AirgapDatabase, entityId: string): Promise<void> {
  await db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    const pending = await pendingMutationsFor(db, entityId);
    await db.mutationQueue.bulkDelete(pending.map((m) => m.seq!));
    const local = await db.incidents.get(entityId);
    if (local && local.version === 0) await db.incidents.delete(entityId);
    else if (local) await db.incidents.update(entityId, { syncStatus: 'synced', deleted: 0 });
    await logActivity(db, {
      type: 'MUTATION_DISCARDED',
      category: 'sync',
      level: 'warning',
      message: `${incidentCode(entityId)}: ${pending.length} local mutation(s) discarded by the operator — server copy will be restored on next refresh`,
      entityId,
    });
  });
}

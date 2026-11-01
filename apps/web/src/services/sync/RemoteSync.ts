import { incidentCode, type Incident, type ServerEvent } from '@airgap/shared';
import { logActivity } from '../../database/activity';
import { META_KEYS, getMeta, setMeta, type AirgapDatabase } from '../../database/db';
import type { ApiClient } from '../api/client';

/**
 * Pulling server state into IndexedDB. The rule everywhere: a server change is
 * applied to a local record ONLY when that record has no outstanding local
 * mutations. Pending local work is never silently overwritten — if the server
 * moved on, the pending mutation will hit a 409 and the user decides.
 */

export type ApplyResult = 'applied' | 'skipped-pending' | 'stale';

async function hasPending(db: AirgapDatabase, entityId: string): Promise<boolean> {
  return (await db.mutationQueue.where('entityId').equals(entityId).count()) > 0;
}

export async function applyServerIncident(
  db: AirgapDatabase,
  incident: Incident,
  options: { force?: boolean } = {},
): Promise<ApplyResult> {
  return db.transaction('rw', db.incidents, db.mutationQueue, async () => {
    if (await hasPending(db, incident.id)) return 'skipped-pending';
    const local = await db.incidents.get(incident.id);
    if (local && !options.force && local.version >= incident.version) return 'stale';
    await db.incidents.put({ ...incident, syncStatus: 'synced', deleted: 0 });
    return 'applied';
  });
}

export async function applyServerDeletion(db: AirgapDatabase, id: string): Promise<ApplyResult> {
  return db.transaction('rw', db.incidents, db.mutationQueue, async () => {
    if (await hasPending(db, id)) return 'skipped-pending';
    if (!(await db.incidents.get(id))) return 'stale';
    await db.incidents.delete(id);
    return 'applied';
  });
}

/** Replaces all non-pending local records with the server's list. */
export async function fullRefresh(
  db: AirgapDatabase,
  api: ApiClient,
): Promise<{ applied: number; removed: number }> {
  const { data } = await api.listIncidents();
  let applied = 0;
  let removed = 0;
  await db.transaction('rw', db.incidents, db.mutationQueue, db.syncMetadata, async () => {
    const serverIds = new Set(data.incidents.map((i) => i.id));
    for (const incident of data.incidents) {
      if ((await applyServerIncident(db, incident, { force: true })) === 'applied') applied++;
    }
    // Synced local records that the server no longer has were deleted remotely.
    const locals = await db.incidents.toArray();
    for (const local of locals) {
      if (!serverIds.has(local.id) && local.version > 0 && !(await hasPending(db, local.id))) {
        await db.incidents.delete(local.id);
        removed++;
      }
    }
    await setMeta(db, META_KEYS.eventCursor, data.cursor);
    await setMeta(db, META_KEYS.lastFullRefreshAt, new Date().toISOString());
  });
  return { applied, removed };
}

/** Applies one change-feed event (from SSE or polling) and advances the cursor. */
export async function applyServerEvent(
  db: AirgapDatabase,
  api: ApiClient,
  event: ServerEvent,
): Promise<void> {
  const cursor = (await getMeta<number>(db, META_KEYS.eventCursor)) ?? 0;
  if (event.seq <= cursor) return;

  if (event.type === 'session.reset') {
    await fullRefresh(db, api);
    await logActivity(db, {
      type: 'REMOTE_RESET',
      category: 'server',
      level: 'warning',
      message: 'Server session was reset — local cache refreshed from the server',
    });
  } else if (event.type === 'incident.deleted' && event.incidentId) {
    const result = await applyServerDeletion(db, event.incidentId);
    if (result === 'applied' && event.source !== 'client') {
      await logActivity(db, {
        type: 'REMOTE_CHANGE_APPLIED',
        category: 'server',
        level: 'info',
        message: `${incidentCode(event.incidentId)} was deleted on the server`,
        entityId: event.incidentId,
      });
    }
  } else if (event.incident) {
    const result = await applyServerIncident(db, event.incident);
    if (event.source === 'remote-demo') {
      await logActivity(db, {
        type: 'REMOTE_CHANGE_DETECTED',
        category: 'server',
        level: result === 'skipped-pending' ? 'warning' : 'info',
        message:
          result === 'skipped-pending'
            ? `Remote edit to ${incidentCode(event.incident.id)} (v${event.incident.version}) — you have unsynced local changes, a conflict is expected`
            : `Remote edit to ${incidentCode(event.incident.id)} applied (server v${event.incident.version})`,
        entityId: event.incident.id,
        meta: { source: event.source, version: event.incident.version },
      });
    }
  }
  const latest = (await getMeta<number>(db, META_KEYS.eventCursor)) ?? 0;
  if (event.seq > latest) await setMeta(db, META_KEYS.eventCursor, event.seq);
}

/** Catches up on missed server events from the persisted cursor. */
export async function pullEvents(db: AirgapDatabase, api: ApiClient): Promise<number> {
  let processed = 0;
  for (let page = 0; page < 20; page++) {
    const cursor = (await getMeta<number>(db, META_KEYS.eventCursor)) ?? 0;
    const { data } = await api.events(cursor);
    if (data.resetRequired) {
      await fullRefresh(db, api);
      return processed;
    }
    for (const event of data.events) {
      await applyServerEvent(db, api, event);
      processed++;
    }
    if (data.events.length < 200) break;
  }
  return processed;
}

/** Creates the visitor's demo session on first online start and seeds IndexedDB. */
export async function createSession(db: AirgapDatabase, api: ApiClient): Promise<string> {
  const { data } = await api.createSession();
  await db.transaction(
    'rw',
    db.incidents,
    db.mutationQueue,
    db.syncMetadata,
    db.activityEvents,
    async () => {
      await setMeta(db, META_KEYS.sessionId, data.sessionId);
      await setMeta(db, META_KEYS.eventCursor, data.cursor);
      // Records from a previous (expired) session that are fully synced belong to that session.
      const locals = await db.incidents.toArray();
      for (const local of locals) {
        if (local.version > 0 && !(await hasPending(db, local.id)))
          await db.incidents.delete(local.id);
      }
      for (const incident of data.incidents) {
        await db.incidents.put({ ...incident, syncStatus: 'synced', deleted: 0 });
      }
      await logActivity(db, {
        type: 'SESSION_CREATED',
        category: 'server',
        level: 'success',
        message: `Demo session ${data.sessionId.slice(0, 8)} created with ${data.incidents.length} seeded incidents`,
      });
    },
  );
  return data.sessionId;
}

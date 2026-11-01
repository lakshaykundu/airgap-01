import {
  diffIncidentFields,
  incidentCode,
  incidentFieldsSchema,
  pickIncidentFields,
  type IncidentFields,
  type SyncStatus,
} from '@airgap/shared';
import { logActivity } from './activity';
import type { AirgapDatabase, LocalIncident, QueuedMutation } from './db';
import { mutationPayloadSchemas } from '../services/sync/mutationSchemas';

export interface StoreDeps {
  now?: () => Date;
  uuid?: () => string;
}

const defaultUuid = () => crypto.randomUUID();

/** Sync status of an entity is derived from its outstanding mutations. */
export function deriveSyncStatus(mutations: Pick<QueuedMutation, 'status'>[]): SyncStatus {
  if (mutations.length === 0) return 'synced';
  if (mutations.some((m) => m.status === 'conflict')) return 'conflict';
  if (mutations.some((m) => m.status === 'failed')) return 'failed';
  if (mutations.some((m) => m.status === 'syncing')) return 'syncing';
  return 'pending';
}

/** Recomputes and stores an incident's syncStatus. Call inside a transaction that includes both tables. */
export async function refreshSyncStatus(db: AirgapDatabase, entityId: string): Promise<void> {
  const mutations = await db.mutationQueue.where('entityId').equals(entityId).toArray();
  const status = deriveSyncStatus(mutations);
  await db.incidents.update(entityId, { syncStatus: status });
}

export function pendingMutationsFor(
  db: AirgapDatabase,
  entityId: string,
): Promise<QueuedMutation[]> {
  return db.mutationQueue.where('entityId').equals(entityId).sortBy('seq');
}

function newMutation(
  deps: StoreDeps,
  fields: Omit<QueuedMutation, 'id' | 'status' | 'retryCount' | 'attempts' | 'createdAt'>,
): QueuedMutation {
  mutationPayloadSchemas[fields.type].parse(fields.payload);
  return {
    ...fields,
    id: (deps.uuid ?? defaultUuid)(),
    status: 'queued',
    attempts: 0,
    retryCount: 0,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}

/**
 * Local-first create: validates, writes the incident and its CREATE mutation in
 * ONE IndexedDB transaction, so the UI and the queue can never disagree.
 * Works identically online and offline — the sync engine picks it up later.
 */
export async function createIncidentLocally(
  db: AirgapDatabase,
  input: IncidentFields,
  deps: StoreDeps = {},
): Promise<LocalIncident> {
  const fields = incidentFieldsSchema.parse(input);
  const id = (deps.uuid ?? defaultUuid)();
  const now = (deps.now?.() ?? new Date()).toISOString();
  const incident: LocalIncident = {
    ...fields,
    id,
    createdAt: now,
    updatedAt: now,
    version: 0,
    syncStatus: 'pending',
    deleted: 0,
  };
  const mutation = newMutation(deps, {
    type: 'CREATE_INCIDENT',
    entityId: id,
    payload: { ...fields, id, createdAt: now },
    label: `Create “${fields.title}”`,
  });

  await db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    await db.incidents.add(incident);
    await db.mutationQueue.add(mutation);
    await logActivity(db, {
      type: 'INCIDENT_CREATED',
      category: 'user',
      level: 'info',
      message: `${incidentCode(id)} created — ${fields.title}`,
      entityId: id,
    });
    await logActivity(db, {
      type: 'DB_WRITE_SUCCESS',
      category: 'system',
      level: 'success',
      message: `Incident ${incidentCode(id)} stored in IndexedDB`,
      entityId: id,
    });
    await logActivity(db, {
      type: 'MUTATION_QUEUED',
      category: 'sync',
      level: 'info',
      message: `CREATE_INCIDENT queued for ${incidentCode(id)}`,
      entityId: id,
      mutationId: mutation.id,
    });
  });
  return incident;
}

/**
 * Local-first update. The mutation records the last server-acknowledged
 * version as its base; if earlier mutations for this entity are still queued,
 * the base is rebased automatically when they are acknowledged.
 */
export async function updateIncidentLocally(
  db: AirgapDatabase,
  id: string,
  input: Partial<IncidentFields>,
  deps: StoreDeps = {},
): Promise<LocalIncident> {
  return db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    const current = await db.incidents.get(id);
    if (!current || current.deleted) throw new Error('Incident not found locally');
    const next = incidentFieldsSchema.parse({ ...pickIncidentFields(current), ...input });
    const changedKeys = diffIncidentFields(pickIncidentFields(current), next);
    if (changedKeys.length === 0) return current;

    const changes = Object.fromEntries(changedKeys.map((key) => [key, next[key]]));
    const mutation = newMutation(deps, {
      type: 'UPDATE_INCIDENT',
      entityId: id,
      payload: { changes },
      baseVersion: current.version,
      label: describeChanges(changes),
    });
    const now = (deps.now?.() ?? new Date()).toISOString();
    await db.mutationQueue.add(mutation);
    const updated: LocalIncident = { ...current, ...next, updatedAt: now };
    await db.incidents.put(updated);
    await refreshSyncStatus(db, id);
    await logActivity(db, {
      type:
        next.status === 'resolved' && current.status !== 'resolved'
          ? 'INCIDENT_RESOLVED'
          : 'INCIDENT_UPDATED',
      category: 'user',
      level: 'info',
      message: `${incidentCode(id)} — ${describeChanges(changes)}`,
      entityId: id,
    });
    await logActivity(db, {
      type: 'MUTATION_QUEUED',
      category: 'sync',
      level: 'info',
      message: `UPDATE_INCIDENT queued for ${incidentCode(id)} (base v${current.version})`,
      entityId: id,
      mutationId: mutation.id,
    });
    return (await db.incidents.get(id))!;
  });
}

/**
 * Local-first delete. If the incident was created offline and its CREATE has
 * never been sent, both cancel out locally and nothing reaches the server.
 * Otherwise the row becomes a local tombstone (hidden from the UI) until the
 * server acknowledges the DELETE — so it can't "reappear" on a refresh.
 */
export async function deleteIncidentLocally(
  db: AirgapDatabase,
  id: string,
  deps: StoreDeps = {},
): Promise<'cancelled-locally' | 'queued'> {
  return db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
    const current = await db.incidents.get(id);
    if (!current || current.deleted) throw new Error('Incident not found locally');
    const pending = await pendingMutationsFor(db, id);
    const create = pending.find((m) => m.type === 'CREATE_INCIDENT');

    if (create && create.attempts === 0 && create.status === 'queued') {
      await db.mutationQueue.bulkDelete(pending.map((m) => m.seq!));
      await db.incidents.delete(id);
      await logActivity(db, {
        type: 'MUTATION_CANCELLED',
        category: 'sync',
        level: 'info',
        message: `${incidentCode(id)} was created and deleted offline — ${pending.length} queued mutation(s) cancelled, nothing to send`,
        entityId: id,
      });
      return 'cancelled-locally';
    }

    const mutation = newMutation(deps, {
      type: 'DELETE_INCIDENT',
      entityId: id,
      payload: {},
      baseVersion: current.version,
      label: `Delete “${current.title}”`,
    });
    await db.mutationQueue.add(mutation);
    await db.incidents.update(id, { deleted: 1 });
    await refreshSyncStatus(db, id);
    await logActivity(db, {
      type: 'INCIDENT_DELETED',
      category: 'user',
      level: 'info',
      message: `${incidentCode(id)} deleted locally (tombstone kept until the server confirms)`,
      entityId: id,
    });
    await logActivity(db, {
      type: 'MUTATION_QUEUED',
      category: 'sync',
      level: 'info',
      message: `DELETE_INCIDENT queued for ${incidentCode(id)}`,
      entityId: id,
      mutationId: mutation.id,
    });
    return 'queued';
  });
}

export function describeChanges(changes: Partial<IncidentFields>): string {
  const parts = Object.entries(changes).map(([key, value]) => {
    if (key === 'description') return 'description edited';
    if (key === 'title') return `title → “${String(value)}”`;
    if (key === 'assignedTo') return value ? `assigned → ${String(value)}` : 'unassigned';
    if (key === 'sectorId') return `sector → ${String(value).toUpperCase()}`;
    return `${key} → ${String(value)}`;
  });
  return parts.join(', ');
}

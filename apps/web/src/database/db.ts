import Dexie, { type Table } from 'dexie';
import type {
  ConflictDetails,
  IncidentFields,
  IncidentSeverity,
  IncidentStatus,
  SyncStatus,
} from '@airgap/shared';

/**
 * Local copy of an incident.
 *
 * Server-owned fields mirror `Incident`. `version` is ONLY ever a version the
 * server acknowledged (0 = not yet created on the server); offline edits never
 * invent versions. Sync metadata (`syncStatus`, `deleted`) is local-only.
 */
export interface LocalIncident extends IncidentFields {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: SyncStatus;
  /** 1 = deleted locally, waiting for the server to acknowledge (tombstone). */
  deleted: 0 | 1;
}

export type MutationType = 'CREATE_INCIDENT' | 'UPDATE_INCIDENT' | 'DELETE_INCIDENT';
export type MutationStatus = 'queued' | 'syncing' | 'conflict' | 'failed';

export interface QueuedMutation {
  /** Auto-incremented; defines processing order. */
  seq?: number;
  /** Stable UUID, sent as the Idempotency-Key. Never changes across retries. */
  id: string;
  type: MutationType;
  entityId: string;
  payload: unknown;
  /** Server version this change was based on. Rebased when an earlier mutation on the same entity is acknowledged. */
  baseVersion?: number;
  status: MutationStatus;
  /** Times this mutation has been sent. >0 means the server MAY already have applied it. */
  attempts: number;
  /** Failed attempts since the last success, drives exponential backoff. */
  retryCount: number;
  createdAt: string;
  nextRetryAt?: string;
  lastError?: string;
  lastErrorCode?: string;
  conflict?: ConflictDetails;
  /** Human-readable summary for the queue UI. */
  label: string;
}

export interface SyncMetaRow {
  key: string;
  value: unknown;
}

export type ActivityCategory = 'user' | 'sync' | 'network' | 'server' | 'system' | 'simulator';
export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEvent {
  id?: number;
  ts: string;
  /** Machine-readable event name, e.g. MUTATION_ACKNOWLEDGED. */
  type: string;
  category: ActivityCategory;
  level: ActivityLevel;
  message: string;
  entityId?: string;
  mutationId?: string;
  /** Which browser tab recorded it. */
  tabId: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface StressRecord {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  sectorId: string;
  nodeId: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  /** Lower-cased search haystack, precomputed once at generation time. */
  search: string;
}

export class AirgapDatabase extends Dexie {
  incidents!: Table<LocalIncident, string>;
  mutationQueue!: Table<QueuedMutation, number>;
  syncMetadata!: Table<SyncMetaRow, string>;
  activityEvents!: Table<ActivityEvent, number>;
  stressTestRecords!: Table<StressRecord, string>;

  constructor(name = 'airgap-01') {
    super(name);
    this.version(1).stores({
      incidents: 'id, status, severity, sectorId, updatedAt, syncStatus, deleted',
      mutationQueue: '++seq, &id, entityId, status, createdAt, nextRetryAt',
      syncMetadata: 'key',
      activityEvents: '++id, ts, type, category',
      stressTestRecords: 'id, status, severity, sectorId, updatedAt, nodeId',
    });
  }
}

export const META_KEYS = {
  sessionId: 'sessionId',
  eventCursor: 'eventCursor',
  lastSyncAt: 'lastSyncAt',
  lastSyncDurationMs: 'lastSyncDurationMs',
  lastFullRefreshAt: 'lastFullRefreshAt',
} as const;

export async function getMeta<T>(db: AirgapDatabase, key: string): Promise<T | undefined> {
  const row = await db.syncMetadata.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(db: AirgapDatabase, key: string, value: unknown): Promise<void> {
  await db.syncMetadata.put({ key, value });
}

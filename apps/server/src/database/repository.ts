import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  SectorId,
  ServerEvent,
  ServerEventSource,
  ServerEventType,
} from '@airgap/shared';
import type { Database } from './db';

interface IncidentRow {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  sector_id: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

interface EventRow {
  seq: number;
  type: string;
  incident_id: string | null;
  version: number | null;
  snapshot: string | null;
  mutation_id: string | null;
  source: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string;
  history_floor: number;
}

export interface ProcessedMutationRow {
  mutation_type: string;
  entity_id: string;
  request_hash: string;
  status_code: number;
  response: string;
}

export interface StoredIncident {
  incident: Incident;
  deletedAt: string | null;
}

function toIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    sectorId: row.sector_id as SectorId,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toEvent(row: EventRow): ServerEvent {
  return {
    seq: row.seq,
    type: row.type as ServerEventType,
    incidentId: row.incident_id,
    version: row.version,
    incident: row.snapshot ? (JSON.parse(row.snapshot) as Incident) : null,
    mutationId: row.mutation_id,
    source: row.source as ServerEventSource,
    createdAt: row.created_at,
  };
}

/** Thin data-access layer: prepared statements only, no business rules. */
export class Repository {
  constructor(readonly db: Database) {}

  // ── sessions ────────────────────────────────────────────────────────────
  insertSession(id: string, now: string): void {
    this.db
      .prepare('INSERT INTO sessions (id, created_at, last_seen_at) VALUES (?, ?, ?)')
      .run(id, now, now);
  }

  getSession(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  }

  touchSession(id: string, now: string): void {
    this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, id);
  }

  setHistoryFloor(id: string, floor: number): void {
    this.db.prepare('UPDATE sessions SET history_floor = ? WHERE id = ?').run(floor, id);
  }

  deleteSessionsSeenBefore(cutoff: string): number {
    const result = this.db.prepare('DELETE FROM sessions WHERE last_seen_at < ?').run(cutoff);
    return Number(result.changes);
  }

  clearSessionData(id: string): void {
    for (const table of ['incidents', 'incident_versions', 'processed_mutations', 'events']) {
      this.db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(id);
    }
  }

  // ── incidents ───────────────────────────────────────────────────────────
  getIncident(sessionId: string, id: string): StoredIncident | undefined {
    const row = this.db
      .prepare('SELECT * FROM incidents WHERE session_id = ? AND id = ?')
      .get(sessionId, id) as IncidentRow | undefined;
    return row ? { incident: toIncident(row), deletedAt: row.deleted_at } : undefined;
  }

  listIncidents(sessionId: string): Incident[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM incidents WHERE session_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
      )
      .all(sessionId) as unknown as IncidentRow[];
    return rows.map(toIncident);
  }

  countLiveIncidents(sessionId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM incidents WHERE session_id = ? AND deleted_at IS NULL')
      .get(sessionId) as { n: number };
    return row.n;
  }

  insertIncident(sessionId: string, incident: Incident): void {
    this.db
      .prepare(
        `INSERT INTO incidents
          (session_id, id, title, description, severity, status, sector_id, assigned_to, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        incident.id,
        incident.title,
        incident.description,
        incident.severity,
        incident.status,
        incident.sectorId,
        incident.assignedTo,
        incident.createdAt,
        incident.updatedAt,
        incident.version,
      );
  }

  /**
   * Compare-and-swap update: only succeeds when the stored version still equals
   * `expectedVersion`. Returns false if another writer got there first.
   */
  updateIncidentIfVersion(sessionId: string, next: Incident, expectedVersion: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE incidents SET title = ?, description = ?, severity = ?, status = ?, sector_id = ?,
           assigned_to = ?, updated_at = ?, version = ?
         WHERE session_id = ? AND id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .run(
        next.title,
        next.description,
        next.severity,
        next.status,
        next.sectorId,
        next.assignedTo,
        next.updatedAt,
        next.version,
        sessionId,
        next.id,
        expectedVersion,
      );
    return Number(result.changes) === 1;
  }

  /** Tombstones rather than deletes, so a stale client cannot resurrect the row. */
  tombstoneIncidentIfVersion(
    sessionId: string,
    id: string,
    expectedVersion: number,
    now: string,
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE incidents SET deleted_at = ?, updated_at = ?, version = version + 1
         WHERE session_id = ? AND id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .run(now, now, sessionId, id, expectedVersion);
    return Number(result.changes) === 1;
  }

  insertIncidentVersion(
    sessionId: string,
    incident: Incident,
    mutationId: string | null,
    deleted: boolean,
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO incident_versions (session_id, incident_id, version, snapshot, mutation_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        incident.id,
        incident.version,
        JSON.stringify({ ...incident, deleted }),
        mutationId,
        incident.updatedAt,
      );
  }

  countIncidentVersions(sessionId: string, incidentId: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM incident_versions WHERE session_id = ? AND incident_id = ?',
      )
      .get(sessionId, incidentId) as { n: number };
    return row.n;
  }

  // ── idempotency ─────────────────────────────────────────────────────────
  getProcessedMutation(sessionId: string, mutationId: string): ProcessedMutationRow | undefined {
    return this.db
      .prepare(
        `SELECT mutation_type, entity_id, request_hash, status_code, response
         FROM processed_mutations WHERE session_id = ? AND mutation_id = ?`,
      )
      .get(sessionId, mutationId) as ProcessedMutationRow | undefined;
  }

  insertProcessedMutation(
    sessionId: string,
    mutationId: string,
    type: string,
    entityId: string,
    requestHash: string,
    statusCode: number,
    response: unknown,
    now: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO processed_mutations
          (session_id, mutation_id, mutation_type, entity_id, request_hash, status_code, response, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        mutationId,
        type,
        entityId,
        requestHash,
        statusCode,
        JSON.stringify(response),
        now,
      );
  }

  // ── events ──────────────────────────────────────────────────────────────
  insertEvent(
    sessionId: string,
    type: ServerEventType,
    incident: Incident | null,
    incidentId: string | null,
    mutationId: string | null,
    source: ServerEventSource,
    now: string,
  ): ServerEvent {
    const result = this.db
      .prepare(
        `INSERT INTO events (session_id, type, incident_id, version, snapshot, mutation_id, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        type,
        incidentId,
        incident?.version ?? null,
        type === 'incident.deleted' || !incident ? null : JSON.stringify(incident),
        mutationId,
        source,
        now,
      );
    return {
      seq: Number(result.lastInsertRowid),
      type,
      incidentId,
      version: incident?.version ?? null,
      incident: type === 'incident.deleted' ? null : incident,
      mutationId,
      source,
      createdAt: now,
    };
  }

  listEventsAfter(sessionId: string, after: number, limit: number): ServerEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?')
      .all(sessionId, after, limit) as unknown as EventRow[];
    return rows.map(toEvent);
  }

  latestEventSeq(sessionId: string): number {
    const row = this.db
      .prepare('SELECT MAX(seq) AS seq FROM events WHERE session_id = ?')
      .get(sessionId) as { seq: number | null };
    return row.seq ?? 0;
  }

  pruneEvents(sessionId: string, keep: number): void {
    this.db
      .prepare(
        `DELETE FROM events WHERE session_id = ? AND seq <= (
           SELECT seq FROM events WHERE session_id = ? ORDER BY seq DESC LIMIT 1 OFFSET ?
         )`,
      )
      .run(sessionId, sessionId, keep);
  }
}

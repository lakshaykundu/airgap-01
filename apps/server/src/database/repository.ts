import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  SectorId,
  ServerEvent,
  ServerEventSource,
  ServerEventType,
} from '@airgap/shared';
import { toNumber, type Sql } from './db';

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
  seq: string | number | bigint;
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
    version: toNumber(row.version),
  };
}

function toEvent(row: EventRow): ServerEvent {
  return {
    seq: toNumber(row.seq),
    type: row.type as ServerEventType,
    incidentId: row.incident_id,
    version: row.version === null ? null : toNumber(row.version),
    incident: row.snapshot ? (JSON.parse(row.snapshot) as Incident) : null,
    mutationId: row.mutation_id,
    source: row.source as ServerEventSource,
    createdAt: row.created_at,
  };
}

const INCIDENT_COLUMNS =
  'session_id, id, title, description, severity, status, sector_id, assigned_to, created_at, updated_at, version';

function incidentValues(sessionId: string, incident: Incident): unknown[] {
  return [
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
  ];
}

/** Builds "($1,$2,…),($n,…)" for a multi-row INSERT. */
function placeholders(rows: number, columns: number): string {
  return Array.from(
    { length: rows },
    (_, r) =>
      `(${Array.from({ length: columns }, (_, c) => `$${r * columns + c + 1}`).join(', ')})`,
  ).join(', ');
}

/**
 * Thin data-access layer: SQL only, no business rules. Every method takes the
 * executor to run on, so callers decide what shares a transaction.
 */
export class Repository {
  // ── sessions ────────────────────────────────────────────────────────────
  async insertSession(sql: Sql, id: string, now: string): Promise<void> {
    await sql.query('INSERT INTO sessions (id, created_at, last_seen_at) VALUES ($1, $2, $2)', [
      id,
      now,
    ]);
  }

  async getSession(sql: Sql, id: string): Promise<SessionRow | undefined> {
    const [row] = await sql.query<SessionRow>('SELECT * FROM sessions WHERE id = $1', [id]);
    return row ? { ...row, history_floor: toNumber(row.history_floor) } : undefined;
  }

  /**
   * Row-locks the session for the rest of the transaction. Every write for a
   * session takes this lock first, so writes within one demo workspace are
   * serialized: idempotency checks, version checks and event ordering can't race.
   */
  async lockSession(sql: Sql, id: string): Promise<boolean> {
    const rows = await sql.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [id]);
    return rows.length === 1;
  }

  async touchSession(sql: Sql, id: string, now: string): Promise<void> {
    await sql.query('UPDATE sessions SET last_seen_at = $1 WHERE id = $2', [now, id]);
  }

  async setHistoryFloor(sql: Sql, id: string, floor: number): Promise<void> {
    await sql.query('UPDATE sessions SET history_floor = $1 WHERE id = $2', [floor, id]);
  }

  async deleteSessionsSeenBefore(sql: Sql, cutoff: string): Promise<number> {
    const rows = await sql.query('DELETE FROM sessions WHERE last_seen_at < $1 RETURNING id', [
      cutoff,
    ]);
    return rows.length;
  }

  async clearSessionData(sql: Sql, id: string): Promise<void> {
    for (const table of ['incidents', 'incident_versions', 'processed_mutations', 'events']) {
      await sql.query(`DELETE FROM ${table} WHERE session_id = $1`, [id]);
    }
  }

  // ── incidents ───────────────────────────────────────────────────────────
  async getIncident(sql: Sql, sessionId: string, id: string): Promise<StoredIncident | undefined> {
    const [row] = await sql.query<IncidentRow>(
      'SELECT * FROM incidents WHERE session_id = $1 AND id = $2',
      [sessionId, id],
    );
    return row ? { incident: toIncident(row), deletedAt: row.deleted_at } : undefined;
  }

  async listIncidents(sql: Sql, sessionId: string): Promise<Incident[]> {
    const rows = await sql.query<IncidentRow>(
      'SELECT * FROM incidents WHERE session_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC',
      [sessionId],
    );
    return rows.map(toIncident);
  }

  async countLiveIncidents(sql: Sql, sessionId: string): Promise<number> {
    const [row] = await sql.query<{ n: unknown }>(
      'SELECT COUNT(*) AS n FROM incidents WHERE session_id = $1 AND deleted_at IS NULL',
      [sessionId],
    );
    return toNumber(row?.n);
  }

  async insertIncidents(sql: Sql, sessionId: string, incidents: Incident[]): Promise<void> {
    if (incidents.length === 0) return;
    await sql.query(
      `INSERT INTO incidents (${INCIDENT_COLUMNS}) VALUES ${placeholders(incidents.length, 11)}`,
      incidents.flatMap((incident) => incidentValues(sessionId, incident)),
    );
  }

  /**
   * Compare-and-swap update: succeeds only while the stored version still
   * equals `expectedVersion`. The check is part of the UPDATE, so it is atomic.
   */
  async updateIncidentIfVersion(
    sql: Sql,
    sessionId: string,
    next: Incident,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await sql.query(
      `UPDATE incidents SET title = $1, description = $2, severity = $3, status = $4, sector_id = $5,
         assigned_to = $6, updated_at = $7, version = $8
       WHERE session_id = $9 AND id = $10 AND version = $11 AND deleted_at IS NULL
       RETURNING id`,
      [
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
      ],
    );
    return rows.length === 1;
  }

  /** Tombstones rather than deletes, so a stale client cannot resurrect the row. */
  async tombstoneIncidentIfVersion(
    sql: Sql,
    sessionId: string,
    id: string,
    expectedVersion: number,
    now: string,
  ): Promise<boolean> {
    const rows = await sql.query(
      `UPDATE incidents SET deleted_at = $1, updated_at = $1, version = version + 1
       WHERE session_id = $2 AND id = $3 AND version = $4 AND deleted_at IS NULL
       RETURNING id`,
      [now, sessionId, id, expectedVersion],
    );
    return rows.length === 1;
  }

  async insertIncidentVersions(
    sql: Sql,
    sessionId: string,
    entries: { incident: Incident; mutationId: string | null; deleted: boolean }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await sql.query(
      `INSERT INTO incident_versions (session_id, incident_id, version, snapshot, mutation_id, created_at)
       VALUES ${placeholders(entries.length, 6)}
       ON CONFLICT (session_id, incident_id, version) DO UPDATE
         SET snapshot = EXCLUDED.snapshot, mutation_id = EXCLUDED.mutation_id`,
      entries.flatMap(({ incident, mutationId, deleted }) => [
        sessionId,
        incident.id,
        incident.version,
        JSON.stringify({ ...incident, deleted }),
        mutationId,
        incident.updatedAt,
      ]),
    );
  }

  async countIncidentVersions(sql: Sql, sessionId: string, incidentId: string): Promise<number> {
    const [row] = await sql.query<{ n: unknown }>(
      'SELECT COUNT(*) AS n FROM incident_versions WHERE session_id = $1 AND incident_id = $2',
      [sessionId, incidentId],
    );
    return toNumber(row?.n);
  }

  // ── idempotency ─────────────────────────────────────────────────────────
  async getProcessedMutation(
    sql: Sql,
    sessionId: string,
    mutationId: string,
  ): Promise<ProcessedMutationRow | undefined> {
    const [row] = await sql.query<ProcessedMutationRow>(
      `SELECT mutation_type, entity_id, request_hash, status_code, response
       FROM processed_mutations WHERE session_id = $1 AND mutation_id = $2`,
      [sessionId, mutationId],
    );
    return row ? { ...row, status_code: toNumber(row.status_code) } : undefined;
  }

  async insertProcessedMutation(
    sql: Sql,
    sessionId: string,
    mutationId: string,
    type: string,
    entityId: string,
    requestHash: string,
    statusCode: number,
    response: unknown,
    now: string,
  ): Promise<void> {
    await sql.query(
      `INSERT INTO processed_mutations
         (session_id, mutation_id, mutation_type, entity_id, request_hash, status_code, response, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId,
        mutationId,
        type,
        entityId,
        requestHash,
        statusCode,
        JSON.stringify(response),
        now,
      ],
    );
  }

  // ── events ──────────────────────────────────────────────────────────────
  async insertEvent(
    sql: Sql,
    sessionId: string,
    type: ServerEventType,
    incident: Incident | null,
    incidentId: string | null,
    mutationId: string | null,
    source: ServerEventSource,
    now: string,
  ): Promise<ServerEvent> {
    const snapshot = type === 'incident.deleted' || !incident ? null : JSON.stringify(incident);
    const [row] = await sql.query<{ seq: unknown }>(
      `INSERT INTO events (session_id, type, incident_id, version, snapshot, mutation_id, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING seq`,
      [sessionId, type, incidentId, incident?.version ?? null, snapshot, mutationId, source, now],
    );
    return {
      seq: toNumber(row?.seq),
      type,
      incidentId,
      version: incident?.version ?? null,
      incident: type === 'incident.deleted' ? null : incident,
      mutationId,
      source,
      createdAt: now,
    };
  }

  async listEventsAfter(
    sql: Sql,
    sessionId: string,
    after: number,
    limit: number,
  ): Promise<ServerEvent[]> {
    const rows = await sql.query<EventRow>(
      'SELECT * FROM events WHERE session_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT $3',
      [sessionId, after, limit],
    );
    return rows.map(toEvent);
  }

  async latestEventSeq(sql: Sql, sessionId: string): Promise<number> {
    const [row] = await sql.query<{ seq: unknown }>(
      'SELECT MAX(seq) AS seq FROM events WHERE session_id = $1',
      [sessionId],
    );
    return toNumber(row?.seq);
  }

  async pruneEvents(sql: Sql, sessionId: string, keep: number): Promise<void> {
    await sql.query(
      `DELETE FROM events WHERE session_id = $1 AND seq <= (
         SELECT seq FROM events WHERE session_id = $1 ORDER BY seq DESC LIMIT 1 OFFSET $2
       )`,
      [sessionId, keep],
    );
  }
}

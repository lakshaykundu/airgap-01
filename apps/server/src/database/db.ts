import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite via Node's built-in `node:sqlite` driver (synchronous, like
 * better-sqlite3, but with no native build step).
 */
export type Database = DatabaseSync;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    history_floor INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_sessions_last_seen ON sessions(last_seen_at);

  CREATE TABLE incidents (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    sector_id TEXT NOT NULL,
    assigned_to TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (session_id, id)
  );
  CREATE INDEX idx_incidents_session_updated ON incidents(session_id, updated_at);

  CREATE TABLE incident_versions (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    incident_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    mutation_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, incident_id, version)
  );

  CREATE TABLE processed_mutations (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    mutation_id TEXT NOT NULL,
    mutation_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, mutation_id)
  );

  CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    incident_id TEXT,
    version INTEGER,
    snapshot TEXT,
    mutation_id TEXT,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_events_session_seq ON events(session_id, seq);
  `,
];

export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/**
 * Runs `fn` inside BEGIN IMMEDIATE … COMMIT. The write lock is taken up front so
 * the version check and the write it guards are atomic.
 */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

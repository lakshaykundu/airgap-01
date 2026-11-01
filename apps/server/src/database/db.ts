import { mkdirSync } from 'node:fs';

/**
 * Postgres everywhere, two drivers behind one tiny interface:
 * - `pg` against a real Postgres (Neon on Vercel, or any DATABASE_URL);
 * - PGlite (Postgres compiled to WASM, embedded) for local dev, tests and the
 *   single-container Docker image — so nothing external is needed to run it.
 * Same SQL dialect in both, so the code paths tested locally are the ones
 * that run in production.
 */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Multiple statements, no parameters (migrations). */
  exec(text: string): Promise<void>;
}

export interface Database extends Sql {
  readonly kind: 'pglite' | 'postgres';
  /** Runs `fn` in BEGIN … COMMIT, rolling back on any error. */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  /** Postgres connection string; when set, PGlite is not used. */
  databaseUrl?: string;
  /** PGlite data directory, or ':memory:'. */
  databasePath: string;
}

const MIGRATION_LOCK = 727_001;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    history_floor BIGINT NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at);

  CREATE TABLE IF NOT EXISTS incidents (
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
  CREATE INDEX IF NOT EXISTS idx_incidents_session_updated ON incidents(session_id, updated_at);

  CREATE TABLE IF NOT EXISTS incident_versions (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    incident_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    mutation_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, incident_id, version)
  );

  CREATE TABLE IF NOT EXISTS processed_mutations (
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

  CREATE TABLE IF NOT EXISTS events (
    seq BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    incident_id TEXT,
    version INTEGER,
    snapshot TEXT,
    mutation_id TEXT,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_session_seq ON events(session_id, seq);
`;

async function openPglite(path: string): Promise<Database> {
  // Loaded lazily so the serverless bundle never needs the WASM payload.
  const { PGlite } = await import('@electric-sql/pglite');
  if (path !== ':memory:') mkdirSync(path, { recursive: true });
  const pg = path === ':memory:' ? new PGlite() : new PGlite(path);
  await pg.waitReady;
  const wrap = (target: Pick<typeof pg, 'query' | 'exec'>): Sql => ({
    query: async <T>(text: string, params?: unknown[]) =>
      (await target.query<T>(text, params)).rows,
    exec: async (text: string) => {
      await target.exec(text);
    },
  });
  return {
    kind: 'pglite',
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

async function openPostgres(url: string): Promise<Database> {
  const { default: pg } = await import('pg');
  // Small pool: on serverless each instance holds few connections; Neon's
  // pooled endpoint multiplexes them.
  const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  return {
    kind: 'postgres',
    query: async <T>(text: string, params?: unknown[]) =>
      (await pool.query(text, params)).rows as T[],
    exec: async (text: string) => {
      await pool.query(text);
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: async <R>(text: string, params?: unknown[]) =>
            (await client.query(text, params)).rows as R[],
          exec: async (text: string) => {
            await client.query(text);
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function openDatabase(options: DatabaseOptions): Promise<Database> {
  const db = options.databaseUrl
    ? await openPostgres(options.databaseUrl)
    : await openPglite(options.databasePath);
  // Idempotent schema; the advisory lock serializes concurrent cold starts.
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await tx.exec(SCHEMA);
  });
  return db;
}

/** int8 / COUNT() come back as strings (pg) or bigint (PGlite). */
export function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

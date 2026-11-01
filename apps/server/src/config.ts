import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Postgres connection string. Vercel's Neon integration provides DATABASE_URL / POSTGRES_URL. */
  DATABASE_URL: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
  /** Embedded PGlite data directory, used when no DATABASE_URL is set. */
  DATABASE_PATH: z.string().default('./data/pgdata'),
  DEMO_SESSION_TTL_DAYS: z.coerce.number().positive().default(7),
  MUTATION_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(240),
  SESSION_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
  REALTIME_MODE: z.enum(['sse', 'poll']).default('sse'),
  WEB_DIST_PATH: z.string().optional(),
});

export type ServerConfig = {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  databaseUrl: string | undefined;
  databasePath: string;
  sessionTtlDays: number;
  mutationRateLimitPerMinute: number;
  /** New demo sessions per client IP per hour. */
  sessionRateLimitPerHour: number;
  /**
   * 'sse' streams changes from a long-lived process. 'poll' is for serverless
   * hosts, where a stream would pin a function instance: clients poll instead.
   */
  realtime: 'sse' | 'poll';
  /** When set, the server also serves the built PWA from this directory (single origin). */
  webDistPath: string | undefined;
  /** Upper bound on incidents per demo session, to keep the public demo cheap. */
  maxIncidentsPerSession: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.parse(env);
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    databaseUrl: parsed.DATABASE_URL || parsed.POSTGRES_URL || undefined,
    databasePath: parsed.DATABASE_PATH,
    sessionTtlDays: parsed.DEMO_SESSION_TTL_DAYS,
    mutationRateLimitPerMinute: parsed.MUTATION_RATE_LIMIT_PER_MINUTE,
    sessionRateLimitPerHour: parsed.SESSION_RATE_LIMIT_PER_HOUR,
    realtime: parsed.REALTIME_MODE,
    webDistPath: parsed.WEB_DIST_PATH,
    maxIncidentsPerSession: 2000,
  };
}

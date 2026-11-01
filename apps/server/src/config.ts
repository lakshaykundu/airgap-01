import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/airgap.sqlite'),
  DEMO_SESSION_TTL_DAYS: z.coerce.number().positive().default(7),
  MUTATION_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(240),
  SESSION_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
  WEB_DIST_PATH: z.string().optional(),
});

export type ServerConfig = {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  databasePath: string;
  sessionTtlDays: number;
  mutationRateLimitPerMinute: number;
  /** New demo sessions per client IP per hour. */
  sessionRateLimitPerHour: number;
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
    databasePath: parsed.DATABASE_PATH,
    sessionTtlDays: parsed.DEMO_SESSION_TTL_DAYS,
    mutationRateLimitPerMinute: parsed.MUTATION_RATE_LIMIT_PER_MINUTE,
    sessionRateLimitPerHour: parsed.SESSION_RATE_LIMIT_PER_HOUR,
    webDistPath: parsed.WEB_DIST_PATH,
    maxIncidentsPerSession: 2000,
  };
}

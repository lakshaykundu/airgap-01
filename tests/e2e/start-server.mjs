// Starts the production server on a throwaway SQLite file for E2E runs.
import { mkdirSync, rmSync } from 'node:fs';

const dir = new URL('../../.e2e/', import.meta.url).pathname;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.DATABASE_PATH = `${dir}pgdata`;
process.env.NODE_ENV = 'production';
await import('../../apps/server/dist/index.js');

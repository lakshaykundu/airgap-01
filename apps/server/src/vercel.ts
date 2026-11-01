import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp, type BuiltApp } from './app';
import { loadConfig } from './config';

/**
 * Vercel Function entry. One Fastify instance per function instance, created
 * on first request and reused while the instance is warm. Static files are
 * served by Vercel's CDN, so this only handles /api/*.
 */
process.env.NODE_ENV ??= 'production';
// A serverless instance cannot hold SSE streams open; clients poll instead.
process.env.REALTIME_MODE ??= 'poll';

let ready: Promise<BuiltApp> | null = null;

function getApp(): Promise<BuiltApp> {
  ready ??= (async () => {
    const config = loadConfig();
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL (or POSTGRES_URL) must be set: Vercel has no persistent disk');
    }
    const built = await buildApp({ ...config, webDistPath: undefined });
    await built.app.ready();
    return built;
  })().catch((error: unknown) => {
    ready = null; // retry initialization on the next request
    throw error;
  });
  return ready;
}

/**
 * The router sends /api/<path> here as /api?__path=<path> (see
 * scripts/build-vercel.mjs). Restore the original URL for Fastify's router.
 */
export function restoreOriginalUrl(rawUrl: string): string {
  const url = new URL(rawUrl, 'http://internal');
  const forwarded = url.searchParams.get('__path');
  if (forwarded === null) return rawUrl;
  url.searchParams.delete('__path');
  const path = url.pathname.startsWith('/api/') ? url.pathname : `/api/${forwarded}`;
  return `${path}${url.search}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  req.url = restoreOriginalUrl(req.url ?? '/');
  try {
    const { app } = await getApp();
    app.server.emit('request', req, res);
  } catch (error) {
    console.error('AIRGAP/01 API failed to start', error);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Service unavailable' } }));
  }
}

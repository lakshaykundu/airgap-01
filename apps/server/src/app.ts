import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config';
import { openDatabase, type Database } from './database/db';
import { Repository } from './database/repository';
import { demoRoutes } from './routes/demo';
import { eventRoutes } from './routes/events';
import { healthRoutes } from './routes/health';
import { incidentRoutes } from './routes/incidents';
import type { AppContext } from './routes/context';
import { EventBus } from './services/eventBus';
import { IncidentService } from './services/incidentService';
import { SessionService } from './services/sessionService';
import { registerErrorHandler } from './utils/errors';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  db: Database;
}

export async function buildApp(config: ServerConfig): Promise<BuiltApp> {
  const app = Fastify({
    // Health probes arrive every few seconds per client: log warnings and errors,
    // not every request.
    logger: config.env === 'test' ? false : { level: 'warn' },
    bodyLimit: 32 * 1024,
    trustProxy: true,
  });

  const db = await openDatabase(config);
  const repo = new Repository();
  const bus = new EventBus();
  const ctx: AppContext = {
    config,
    db,
    repo,
    bus,
    sessions: new SessionService(db, repo, bus, config.sessionTtlDays),
    incidents: new IncidentService(db, repo, bus, config.maxIncidentsPerSession),
    startedAt: Date.now(),
  };

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Motion writes inline style attributes for transforms.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // TLS is terminated by the platform; HSTS (below) enforces HTTPS there.
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.env === 'production',
  });
  await app.register(rateLimit, { global: false });
  registerErrorHandler(app);

  // API responses must never be cached by the browser or the service worker.
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  healthRoutes(app, ctx);
  demoRoutes(app, ctx);
  incidentRoutes(app, ctx);
  eventRoutes(app, ctx);

  const distPath = config.webDistPath ? resolve(config.webDistPath) : undefined;
  if (distPath && existsSync(join(distPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: distPath,
      wildcard: true,
      // We set Cache-Control ourselves (below); stop the plugin overriding it.
      cacheControl: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${join('assets', '')}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // index.html, sw.js and the manifest must revalidate so updates roll out.
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
    // SPA fallback for client-side routes.
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0] ?? '';
      // Client-side routes have no file extension; a missing /assets/x.js must 404, not return HTML.
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        !path.startsWith('/api/') &&
        !/\.[a-z0-9]+$/i.test(path)
      ) {
        reply.header('Cache-Control', 'no-cache');
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    });
  } else {
    app.setNotFoundHandler((_request, reply) =>
      reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
    );
  }

  app.addHook('onClose', async () => db.close());
  return { app, ctx, db };
}

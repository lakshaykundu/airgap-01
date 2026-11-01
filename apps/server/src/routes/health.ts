import type { HealthResponse } from '@airgap/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from './context';

export function healthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/health', async (): Promise<HealthResponse> => ({
    ok: true,
    time: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
    realtime: ctx.config.realtime,
  }));
}

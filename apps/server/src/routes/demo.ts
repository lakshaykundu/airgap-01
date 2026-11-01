import {
  remoteEditBodySchema,
  type CreateSessionResponse,
  type RemoteEditResponse,
} from '@airgap/shared';
import type { FastifyInstance } from 'fastify';
import { requireSession, sessionOrIpKey } from '../middleware/session';
import { parseOrThrow } from '../utils/errors';
import type { AppContext } from './context';

export function demoRoutes(app: FastifyInstance, ctx: AppContext): void {
  const withSession = requireSession(ctx.sessions);

  app.post(
    '/api/demo/sessions',
    {
      config: {
        rateLimit: {
          max: ctx.config.sessionRateLimitPerHour,
          timeWindow: '1 hour',
          keyGenerator: (r) => `ip:${r.ip}`,
        },
      },
    },
    async (_request, reply): Promise<CreateSessionResponse> => {
      reply.status(201);
      return ctx.sessions.create();
    },
  );

  app.post(
    '/api/demo/remote-edit',
    {
      preHandler: withSession,
      config: { rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: sessionOrIpKey } },
    },
    async (request): Promise<RemoteEditResponse> => {
      const body = parseOrThrow(remoteEditBodySchema, request.body ?? {});
      return ctx.incidents.remoteEdit(request.sessionId, body.incidentId);
    },
  );

  app.post(
    '/api/demo/reset',
    {
      preHandler: withSession,
      config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: sessionOrIpKey } },
    },
    async (request) => ctx.sessions.reset(request.sessionId),
  );
}

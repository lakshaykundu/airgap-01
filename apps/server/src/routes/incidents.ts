import {
  IDEMPOTENCY_HEADER,
  REPLAY_HEADER,
  createIncidentBodySchema,
  updateIncidentBodySchema,
  type IncidentResponse,
  type ListIncidentsResponse,
} from '@airgap/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireSession, sessionOrIpKey } from '../middleware/session';
import type { MutationResult } from '../services/incidentService';
import { ApiError, parseOrThrow } from '../utils/errors';
import type { AppContext } from './context';

const idParams = z.object({ id: z.uuid() });
const deleteQuery = z.object({ baseVersion: z.coerce.number().int().positive() });
const idempotencyKey = z.uuid();

function requireIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers[IDEMPOTENCY_HEADER];
  if (typeof raw !== 'string') {
    throw new ApiError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header is required for writes',
    );
  }
  const parsed = idempotencyKey.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key must be a UUID');
  }
  return parsed.data;
}

function sendMutation<T>(reply: FastifyReply, result: MutationResult<T>): FastifyReply {
  if (result.replayed) reply.header(REPLAY_HEADER, 'true');
  return reply.status(result.statusCode).send(result.body);
}

export function incidentRoutes(app: FastifyInstance, ctx: AppContext): void {
  const withSession = requireSession(ctx.sessions);
  const mutationLimit = {
    rateLimit: {
      max: ctx.config.mutationRateLimitPerMinute,
      timeWindow: '1 minute',
      keyGenerator: sessionOrIpKey,
    },
  };

  app.get(
    '/api/incidents',
    { preHandler: withSession },
    async (request): Promise<ListIncidentsResponse> => {
      // Cursor first, then rows: any change racing this read is redelivered via /api/events.
      const cursor = ctx.repo.latestEventSeq(request.sessionId);
      return { incidents: ctx.repo.listIncidents(request.sessionId), cursor };
    },
  );

  app.get(
    '/api/incidents/:id',
    { preHandler: withSession },
    async (request): Promise<IncidentResponse> => {
      const { id } = parseOrThrow(idParams, request.params);
      const stored = ctx.repo.getIncident(request.sessionId, id);
      if (!stored) throw new ApiError(404, 'NOT_FOUND', 'Incident not found');
      if (stored.deletedAt) throw new ApiError(410, 'INCIDENT_DELETED', 'Incident was deleted');
      return { incident: stored.incident };
    },
  );

  app.post(
    '/api/incidents',
    { preHandler: withSession, config: mutationLimit },
    async (request, reply) => {
      const key = requireIdempotencyKey(request);
      const body = parseOrThrow(createIncidentBodySchema, request.body);
      return sendMutation(reply, ctx.incidents.create(request.sessionId, key, body));
    },
  );

  app.patch(
    '/api/incidents/:id',
    { preHandler: withSession, config: mutationLimit },
    async (request, reply) => {
      const key = requireIdempotencyKey(request);
      const { id } = parseOrThrow(idParams, request.params);
      const body = parseOrThrow(updateIncidentBodySchema, request.body);
      return sendMutation(reply, ctx.incidents.update(request.sessionId, key, id, body));
    },
  );

  app.delete(
    '/api/incidents/:id',
    { preHandler: withSession, config: mutationLimit },
    async (request, reply) => {
      const key = requireIdempotencyKey(request);
      const { id } = parseOrThrow(idParams, request.params);
      const { baseVersion } = parseOrThrow(deleteQuery, request.query);
      return sendMutation(reply, ctx.incidents.delete(request.sessionId, key, id, baseVersion));
    },
  );
}

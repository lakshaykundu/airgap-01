import { SESSION_HEADER } from '@airgap/shared';
import type { FastifyRequest } from 'fastify';
import type { SessionService } from '../services/sessionService';

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string;
  }
}

/** preHandler factory: resolves the demo session from the request header. */
export function requireSession(sessions: SessionService) {
  return async (request: FastifyRequest): Promise<void> => {
    const header = request.headers[SESSION_HEADER];
    const query = (request.query as Record<string, unknown> | undefined)?.session;
    // EventSource cannot set headers, so the SSE route also accepts ?session=.
    const raw = typeof header === 'string' ? header : typeof query === 'string' ? query : undefined;
    request.sessionId = await sessions.require(raw);
  };
}

/** Rate-limit key: per session when present, otherwise per client IP. */
export function sessionOrIpKey(request: FastifyRequest): string {
  const header = request.headers[SESSION_HEADER];
  return typeof header === 'string' && header.length <= 64 ? `s:${header}` : `ip:${request.ip}`;
}

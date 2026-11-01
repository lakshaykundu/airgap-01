import type { EventsResponse, ServerEvent } from '@airgap/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../middleware/session';
import { parseOrThrow } from '../utils/errors';
import type { AppContext } from './context';

const eventsQuery = z.object({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const HEARTBEAT_MS = 20_000;

export function eventRoutes(app: FastifyInstance, ctx: AppContext): void {
  const withSession = requireSession(ctx.sessions);

  /** Polling fallback and catch-up after reconnection. */
  app.get('/api/events', { preHandler: withSession }, async (request): Promise<EventsResponse> => {
    const { after, limit } = parseOrThrow(eventsQuery, request.query);
    const floor = ctx.sessions.historyFloor(request.sessionId);
    const events = ctx.repo.listEventsAfter(request.sessionId, after, limit);
    return {
      events,
      cursor: events.at(-1)?.seq ?? Math.max(after, 0),
      resetRequired: after > 0 && after < floor,
    };
  });

  /**
   * Server-Sent Events. Replays everything after `after` (or Last-Event-ID),
   * then streams live events. History is persisted, so a dropped stream never
   * loses events — the client simply reconnects with its cursor.
   */
  app.get('/api/events/stream', { preHandler: withSession }, async (request, reply) => {
    const lastEventId = Number(request.headers['last-event-id']);
    const { after } = parseOrThrow(eventsQuery, request.query);
    let cursor = Number.isFinite(lastEventId) && lastEventId > after ? lastEventId : after;
    const sessionId = request.sessionId;

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: ServerEvent) => {
      if (event.seq <= cursor) return;
      cursor = event.seq;
      res.write(`id: ${event.seq}\nevent: change\ndata: ${JSON.stringify(event)}\n\n`);
    };

    if (cursor > 0 && cursor < ctx.sessions.historyFloor(sessionId)) {
      res.write(`event: reset-required\ndata: {}\n\n`);
    }
    for (const event of ctx.repo.listEventsAfter(sessionId, cursor, 500)) send(event);
    res.write(`event: ready\ndata: ${JSON.stringify({ cursor })}\n\n`);

    const unsubscribe = ctx.bus.subscribe(sessionId, send);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}

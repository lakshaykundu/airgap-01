import type { EventsResponse, ServerEvent } from '@airgap/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../middleware/session';
import { ApiError, parseOrThrow } from '../utils/errors';
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
    const floor = await ctx.sessions.historyFloor(request.sessionId);
    const events = await ctx.repo.listEventsAfter(ctx.db, request.sessionId, after, limit);
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
    if (ctx.config.realtime === 'poll') {
      // Serverless: a long-lived stream would pin a function instance. Clients
      // learn this from /api/health and poll /api/events instead.
      throw new ApiError(
        503,
        'REALTIME_UNAVAILABLE',
        'Live stream disabled on this host; poll /api/events',
      );
    }
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

    // Subscribe BEFORE replaying history and buffer live events meanwhile, so
    // an event committed during the (async) replay is neither lost nor reordered.
    let replaying = true;
    const buffered: ServerEvent[] = [];
    const unsubscribe = ctx.bus.subscribe(sessionId, (event) =>
      replaying ? buffered.push(event) : send(event),
    );
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    if (cursor > 0 && cursor < (await ctx.sessions.historyFloor(sessionId))) {
      res.write(`event: reset-required\ndata: {}\n\n`);
    }
    for (const event of await ctx.repo.listEventsAfter(ctx.db, sessionId, cursor, 500)) send(event);
    replaying = false;
    for (const event of buffered.sort((a, b) => a.seq - b.seq)) send(event);
    res.write(`event: ready\ndata: ${JSON.stringify({ cursor })}\n\n`);
  });
}

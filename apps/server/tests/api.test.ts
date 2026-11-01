import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ConflictDetails,
  CreateSessionResponse,
  EventsResponse,
  Incident,
  ListIncidentsResponse,
} from '@airgap/shared';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig } from '../src/config';
import { SEED_INCIDENT_COUNT } from '../src/services/sessionService';

let built: BuiltApp;
let app: FastifyInstance;

beforeEach(async () => {
  built = await buildApp({
    ...loadConfig({ NODE_ENV: 'test' }),
    databasePath: ':memory:',
    mutationRateLimitPerMinute: 10_000,
  });
  app = built.app;
});

afterEach(async () => {
  await app.close();
});

async function createSession(): Promise<CreateSessionResponse> {
  const res = await app.inject({ method: 'POST', url: '/api/demo/sessions' });
  expect(res.statusCode).toBe(201);
  return res.json();
}

function newIncidentBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    title: 'Relay heartbeat lost',
    description: 'Created by a test',
    severity: 'high',
    status: 'open',
    sectorId: 's07',
    assignedTo: 'A. Rao',
    ...overrides,
  };
}

function headers(sessionId: string, key: string = randomUUID()) {
  return { 'x-airgap-session': sessionId, 'idempotency-key': key };
}

async function list(sessionId: string): Promise<Incident[]> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/incidents',
    headers: { 'x-airgap-session': sessionId },
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as ListIncidentsResponse).incidents;
}

describe('sessions', () => {
  it('creates an isolated, seeded session', async () => {
    const a = await createSession();
    const b = await createSession();
    expect(a.incidents).toHaveLength(SEED_INCIDENT_COUNT);
    expect(a.sessionId).not.toBe(b.sessionId);

    const body = newIncidentBody();
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(a.sessionId),
      payload: body,
    });

    expect((await list(a.sessionId)).some((i) => i.id === body.id)).toBe(true);
    expect((await list(b.sessionId)).some((i) => i.id === body.id)).toBe(false);
  });

  it('rejects missing and unknown sessions with structured errors', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/incidents' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('SESSION_REQUIRED');

    const unknown = await app.inject({
      method: 'GET',
      url: '/api/incidents',
      headers: { 'x-airgap-session': randomUUID() },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('SESSION_NOT_FOUND');
  });

  it('reset only affects the calling session', async () => {
    const a = await createSession();
    const b = await createSession();
    const body = newIncidentBody();
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(b.sessionId),
      payload: body,
    });

    const reset = await app.inject({
      method: 'POST',
      url: '/api/demo/reset',
      headers: { 'x-airgap-session': a.sessionId },
    });
    expect(reset.statusCode).toBe(200);
    expect((await list(b.sessionId)).some((i) => i.id === body.id)).toBe(true);
    expect(await list(a.sessionId)).toHaveLength(SEED_INCIDENT_COUNT);
  });
});

describe('incident CRUD', () => {
  it('creates, reads, updates and deletes with server-assigned versions', async () => {
    const { sessionId } = await createSession();
    const body = newIncidentBody();

    const created = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId),
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().incident.version).toBe(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${body.id}`,
      headers: headers(sessionId),
      payload: { baseVersion: 1, changes: { status: 'investigating', assignedTo: null } },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().incident).toMatchObject({
      status: 'investigating',
      assignedTo: null,
      version: 2,
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/incidents/${body.id}?baseVersion=2`,
      headers: headers(sessionId),
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ id: body.id, deleted: true, version: 3 });

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/incidents/${body.id}`,
      headers: { 'x-airgap-session': sessionId },
    });
    expect(fetched.statusCode).toBe(410);
    expect((await list(sessionId)).some((i) => i.id === body.id)).toBe(false);
    expect(await built.ctx.repo.countIncidentVersions(built.db, sessionId, body.id)).toBe(3);
  });

  it('validates payloads with structured 400 errors', async () => {
    const { sessionId } = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId),
      payload: newIncidentBody({ title: 'x', severity: 'apocalyptic' }),
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['title', 'severity']),
    );
    expect(JSON.stringify(body)).not.toMatch(/stack|\.ts:\d+/);
  });

  it('requires an idempotency key for writes', async () => {
    const { sessionId } = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: { 'x-airgap-session': sessionId },
      payload: newIncidentBody(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects oversized bodies with 413', async () => {
    const { sessionId } = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: { ...headers(sessionId), 'content-type': 'application/json' },
      payload: JSON.stringify(newIncidentBody({ description: 'x'.repeat(40_000) })),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('idempotency', () => {
  it('replays a retried create instead of creating a duplicate', async () => {
    const { sessionId } = await createSession();
    const key = randomUUID();
    const body = newIncidentBody();

    const first = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId, key),
      payload: body,
    });
    // Simulates the client retrying after the first response was lost.
    const retry = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId, key),
      payload: body,
    });

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.headers['idempotent-replay']).toBe('true');
    expect(retry.json()).toEqual(first.json());
    expect((await list(sessionId)).filter((i) => i.id === body.id)).toHaveLength(1);
  });

  it('replays a retried update without bumping the version twice', async () => {
    const { sessionId, incidents } = await createSession();
    const target = incidents[0]!;
    const key = randomUUID();
    const payload = { baseVersion: target.version, changes: { severity: 'critical' } };

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${target.id}`,
      headers: headers(sessionId, key),
      payload,
    });
    const retry = await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${target.id}`,
      headers: headers(sessionId, key),
      payload,
    });

    expect(first.json().incident.version).toBe(2);
    expect(retry.json().incident.version).toBe(2);
    expect((await list(sessionId)).find((i) => i.id === target.id)?.version).toBe(2);
  });

  it('refuses to reuse a key for a different request', async () => {
    const { sessionId } = await createSession();
    const key = randomUUID();
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId, key),
      payload: newIncidentBody(),
    });
    const reused = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId, key),
      payload: newIncidentBody(),
    });
    expect(reused.statusCode).toBe(422);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('concurrency', () => {
  it('serializes simultaneous retries of one mutation: applied exactly once', async () => {
    const { sessionId } = await createSession();
    const key = randomUUID();
    const body = newIncidentBody();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/incidents',
          headers: headers(sessionId, key),
          payload: body,
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201]);
    expect(results.filter((r) => r.headers['idempotent-replay'] === 'true')).toHaveLength(4);
    expect((await list(sessionId)).filter((i) => i.id === body.id)).toHaveLength(1);
  });

  it('lets exactly one of two racing updates on the same base version win', async () => {
    const { sessionId, incidents } = await createSession();
    const target = incidents[0]!;
    const [a, b] = await Promise.all(
      ['First', 'Second'].map((title) =>
        app.inject({
          method: 'PATCH',
          url: `/api/incidents/${target.id}`,
          headers: headers(sessionId),
          payload: { baseVersion: target.version, changes: { title } },
        }),
      ),
    );
    expect([a!.statusCode, b!.statusCode].sort()).toEqual([200, 409]);
  });
});

describe('optimistic concurrency', () => {
  it('rejects a stale update with a structured 409', async () => {
    const { sessionId } = await createSession();
    const body = newIncidentBody();
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId),
      payload: body,
    });

    const remote = await app.inject({
      method: 'POST',
      url: '/api/demo/remote-edit',
      headers: { 'x-airgap-session': sessionId },
      payload: { incidentId: body.id },
    });
    expect(remote.json().incident.version).toBe(2);

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${body.id}`,
      headers: headers(sessionId),
      payload: { baseVersion: 1, changes: { title: 'Edited offline' } },
    });
    expect(stale.statusCode).toBe(409);
    const error = stale.json().error;
    expect(error.code).toBe('VERSION_CONFLICT');
    const details = error.details as ConflictDetails;
    expect(details).toMatchObject({
      incidentId: body.id,
      expectedVersion: 1,
      actualVersion: 2,
      deleted: false,
    });
    expect(details.serverIncident?.status).toBe('investigating');
  });

  it('rejects a stale delete and reports deleted incidents with 410', async () => {
    const { sessionId } = await createSession();
    const body = newIncidentBody();
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId),
      payload: body,
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${body.id}`,
      headers: headers(sessionId),
      payload: { baseVersion: 1, changes: { status: 'resolved' } },
    });

    const staleDelete = await app.inject({
      method: 'DELETE',
      url: `/api/incidents/${body.id}?baseVersion=1`,
      headers: headers(sessionId),
    });
    expect(staleDelete.statusCode).toBe(409);

    await app.inject({
      method: 'DELETE',
      url: `/api/incidents/${body.id}?baseVersion=2`,
      headers: headers(sessionId),
    });
    const updateDeleted = await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${body.id}`,
      headers: headers(sessionId),
      payload: { baseVersion: 3, changes: { title: 'Too late' } },
    });
    expect(updateDeleted.statusCode).toBe(410);
    expect(updateDeleted.json().error.details.deleted).toBe(true);
  });

  it('does not record failed attempts as processed mutations', async () => {
    const { sessionId, incidents } = await createSession();
    const target = incidents[0]!;
    const key = randomUUID();
    const stale = { baseVersion: target.version + 5, changes: { title: 'Nope' } };
    const first = await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${target.id}`,
      headers: headers(sessionId, key),
      payload: stale,
    });
    expect(first.statusCode).toBe(409);
    expect(await built.ctx.repo.getProcessedMutation(built.db, sessionId, key)).toBeUndefined();
  });
});

describe('events', () => {
  it('exposes an ordered, cursor-based change feed scoped to the session', async () => {
    const { sessionId, cursor } = await createSession();
    const other = await createSession();
    const body = newIncidentBody();
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId),
      payload: body,
    });
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(other.sessionId),
      payload: newIncidentBody(),
    });
    await app.inject({
      method: 'POST',
      url: '/api/demo/remote-edit',
      headers: { 'x-airgap-session': sessionId },
      payload: { incidentId: body.id },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events?after=${cursor}`,
      headers: { 'x-airgap-session': sessionId },
    });
    const feed = res.json() as EventsResponse;
    expect(feed.events.map((e) => [e.type, e.source])).toEqual([
      ['incident.created', 'client'],
      ['incident.updated', 'remote-demo'],
    ]);
    expect(feed.cursor).toBe(feed.events.at(-1)!.seq);
    expect(feed.resetRequired).toBe(false);
  });

  it('asks clients with a pre-reset cursor to do a full refresh', async () => {
    const { sessionId } = await createSession();
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId),
      payload: newIncidentBody(),
    });
    const before = await app.inject({
      method: 'GET',
      url: '/api/events?after=0',
      headers: { 'x-airgap-session': sessionId },
    });
    const staleCursor = (before.json() as EventsResponse).cursor;
    await app.inject({
      method: 'POST',
      url: '/api/demo/reset',
      headers: { 'x-airgap-session': sessionId },
    });
    await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: headers(sessionId),
      payload: newIncidentBody(),
    });

    const after = await app.inject({
      method: 'GET',
      url: `/api/events?after=${staleCursor}`,
      headers: { 'x-airgap-session': sessionId },
    });
    expect((after.json() as EventsResponse).resetRequired).toBe(true);
  });
});

describe('platform', () => {
  it('advertises polling and refuses the stream in serverless (poll) mode', async () => {
    await app.close();
    built = await buildApp({
      ...loadConfig({ NODE_ENV: 'test' }),
      databasePath: ':memory:',
      realtime: 'poll',
    });
    app = built.app;
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json().realtime).toBe('poll');
    const { sessionId } = await createSession();
    const stream = await app.inject({
      method: 'GET',
      url: `/api/events/stream?session=${sessionId}`,
    });
    expect(stream.statusCode).toBe(503);
    expect(stream.json().error.code).toBe('REALTIME_UNAVAILABLE');
  });

  it('serves a health check with no-store caching and security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rate-limits mutation endpoints', async () => {
    await app.close();
    built = await buildApp({
      ...loadConfig({ NODE_ENV: 'test' }),
      databasePath: ':memory:',
      mutationRateLimitPerMinute: 3,
    });
    app = built.app;
    const { sessionId } = await createSession();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/incidents',
        headers: headers(sessionId),
        payload: newIncidentBody(),
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 3)).toEqual([201, 201, 201]);
    expect(codes[4]).toBe(429);
  });
});

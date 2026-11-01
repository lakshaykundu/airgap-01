// @vitest-environment node
/**
 * Integration tests: the real SyncEngine + Dexie (fake-indexeddb) talking over
 * real HTTP to the real Fastify server with an in-memory SQLite database.
 */
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Incident, IncidentFields } from '@airgap/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type BuiltApp } from '../../../../server/src/app';
import { loadConfig } from '../../../../server/src/config';
import { AirgapDatabase } from '../../database/db';
import {
  createIncidentLocally,
  deleteIncidentLocally,
  updateIncidentLocally,
} from '../../database/incidentStore';
import { ApiClient } from '../api/client';
import { DEFAULT_SIMULATOR, Transport, type SimulatorConfig } from '../api/transport';
import {
  acceptServerVersion,
  keepLocalChanges,
  loadConflict,
  mergeChanges,
} from './ConflictResolver';
import { createSession, pullEvents } from './RemoteSync';
import { SyncCoordinator } from './SyncCoordinator';
import { SyncEngine } from './SyncEngine';

const FIELDS: IncidentFields = {
  title: 'Cooling loop pressure drop',
  description: 'Integration test incident',
  severity: 'high',
  status: 'open',
  sectorId: 's07',
  assignedTo: 'M. Chen',
};

interface Harness {
  server: BuiltApp;
  baseUrl: string;
  db: AirgapDatabase;
  sim: SimulatorConfig;
  transport: Transport;
  api: ApiClient;
  engine: SyncEngine;
  sessionId: string;
  setConnected: (value: boolean) => void;
  makeEngine: () => SyncEngine;
  serverIncidents: () => Promise<Incident[]>;
  serverEvents: () => Promise<{ type: string; incidentId: string | null }[]>;
  syncUntilSettled: (engine?: SyncEngine) => Promise<void>;
}

let h: Harness;
const engines: SyncEngine[] = [];

async function createHarness(): Promise<Harness> {
  const server = await buildApp({
    ...loadConfig({ NODE_ENV: 'test' }),
    databasePath: ':memory:',
    mutationRateLimitPerMinute: 100_000,
  });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const baseUrl = `http://127.0.0.1:${(server.app.server.address() as AddressInfo).port}`;
  const db = new AirgapDatabase(`airgap-test-${randomUUID()}`);
  const sim: SimulatorConfig = { ...DEFAULT_SIMULATOR };
  let sessionId: string | undefined;
  let connected = true;
  const transport = new Transport({
    baseUrl,
    getConfig: () => sim,
    getSessionId: () => sessionId,
    onDropConsumed: () => {
      sim.dropNextMutationResponse = false;
    },
    sleep: async () => undefined,
  });
  const api = new ApiClient(transport);
  sessionId = await createSession(db, api);
  const coordinator = new SyncCoordinator({ mechanism: 'in-memory' });

  const makeEngine = () => {
    const engine = new SyncEngine({
      db,
      api,
      coordinator,
      isConnected: () => connected && !sim.disconnected,
      getSessionId: () => sessionId,
      obtainSession: async (expiredId) => {
        if (!sessionId || sessionId === expiredId) sessionId = await createSession(db, api);
        return sessionId;
      },
      random: () => 0.5,
      pollIntervalMs: 60_000,
    });
    engines.push(engine);
    return engine;
  };
  const engine = makeEngine();

  const rawGet = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, { headers: { 'x-airgap-session': sessionId! } });
    return (await res.json()) as T;
  };

  return {
    server,
    baseUrl,
    db,
    sim,
    transport,
    api,
    engine,
    get sessionId() {
      return sessionId!;
    },
    setConnected: (value) => {
      connected = value;
    },
    makeEngine,
    serverIncidents: async () =>
      (await rawGet<{ incidents: Incident[] }>('/api/incidents')).incidents,
    serverEvents: async () =>
      (
        await rawGet<{ events: { type: string; incidentId: string | null }[] }>(
          '/api/events?after=0&limit=500',
        )
      ).events,
    syncUntilSettled: async (target = engine) => {
      for (let i = 0; i < 40; i++) {
        await target.requestSync({ reason: 'test', force: true });
        const outstanding = await db.mutationQueue
          .where('status')
          .anyOf('queued', 'syncing')
          .count();
        if (outstanding === 0) return;
      }
      throw new Error('Queue did not settle');
    },
  };
}

beforeEach(async () => {
  h = await createHarness();
});

afterEach(async () => {
  for (const engine of engines.splice(0)) engine.stop();
  h.db.close();
  await h.server.app.close();
});

describe('SyncEngine integration', () => {
  it('creates an incident online and adopts the server version', async () => {
    const local = await createIncidentLocally(h.db, FIELDS);
    expect(local.version).toBe(0);
    await h.syncUntilSettled();

    const server = (await h.serverIncidents()).find((i) => i.id === local.id);
    expect(server).toMatchObject({ title: FIELDS.title, version: 1 });
    expect(await h.db.incidents.get(local.id)).toMatchObject({ version: 1, syncStatus: 'synced' });
    expect(await h.db.mutationQueue.count()).toBe(0);
  });

  it('queues offline create + edits and replays them in order on reconnect', async () => {
    h.sim.disconnected = true;
    const local = await createIncidentLocally(h.db, FIELDS);
    await updateIncidentLocally(h.db, local.id, { status: 'investigating' });
    await updateIncidentLocally(h.db, local.id, { severity: 'critical' });
    await updateIncidentLocally(h.db, local.id, { title: 'Cooling loop failure — escalated' });

    await h.engine.requestSync({ reason: 'test' });
    expect(await h.db.mutationQueue.count()).toBe(4);
    expect((await h.db.incidents.get(local.id))?.syncStatus).toBe('pending');
    expect((await h.serverIncidents()).some((i) => i.id === local.id)).toBe(false);

    h.sim.disconnected = false;
    await h.syncUntilSettled();

    const server = (await h.serverIncidents()).filter((i) => i.id === local.id);
    expect(server).toHaveLength(1);
    expect(server[0]).toMatchObject({
      status: 'investigating',
      severity: 'critical',
      title: 'Cooling loop failure — escalated',
      version: 4,
    });
    expect(await h.db.incidents.get(local.id)).toMatchObject({ version: 4, syncStatus: 'synced' });
  });

  it('deletes offline via a tombstone and removes it after acknowledgement', async () => {
    const [target] = await h.serverIncidents();
    h.sim.disconnected = true;
    await deleteIncidentLocally(h.db, target!.id);
    expect((await h.db.incidents.get(target!.id))?.deleted).toBe(1);

    h.sim.disconnected = false;
    await h.syncUntilSettled();
    expect(await h.db.incidents.get(target!.id)).toBeUndefined();
    expect((await h.serverIncidents()).some((i) => i.id === target!.id)).toBe(false);

    // A later full pull must not resurrect it.
    await pullEvents(h.db, h.api);
    expect(await h.db.incidents.get(target!.id)).toBeUndefined();
  });

  it('cancels create+delete made offline without contacting the server', async () => {
    h.sim.disconnected = true;
    const local = await createIncidentLocally(h.db, FIELDS);
    await updateIncidentLocally(h.db, local.id, { severity: 'low' });
    expect(await deleteIncidentLocally(h.db, local.id)).toBe('cancelled-locally');
    expect(await h.db.mutationQueue.count()).toBe(0);

    h.sim.disconnected = false;
    const before = h.transport.requestLog.filter((e) => e.kind === 'mutation').length;
    await h.syncUntilSettled();
    expect(h.transport.requestLog.filter((e) => e.kind === 'mutation').length).toBe(before);
  });

  it('recovers from random request failures without duplicating writes', async () => {
    h.sim.failureRate = 0.5;
    h.sim.failureSeed = 7;
    const created: string[] = [];
    for (let i = 0; i < 6; i++) {
      created.push(
        (await createIncidentLocally(h.db, { ...FIELDS, title: `Flaky network incident ${i}` })).id,
      );
    }
    await h.syncUntilSettled();

    const failures = h.transport.requestLog.filter((e) => e.outcome === 'simulated-failure').length;
    expect(failures).toBeGreaterThan(0);
    const server = await h.serverIncidents();
    for (const id of created) expect(server.filter((i) => i.id === id)).toHaveLength(1);
    expect(await h.db.mutationQueue.count()).toBe(0);
  });

  it('retries a mutation whose response was lost and the server replays it (idempotency)', async () => {
    h.sim.dropNextMutationResponse = true;
    const local = await createIncidentLocally(h.db, FIELDS);

    await h.engine.requestSync({ reason: 'test', force: true });
    const afterFirst = await h.db.mutationQueue.toArray();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({
      lastErrorCode: 'response-lost',
      retryCount: 1,
      attempts: 1,
    });
    // The server DID apply it already.
    expect((await h.serverIncidents()).filter((i) => i.id === local.id)).toHaveLength(1);

    await h.syncUntilSettled();
    expect((await h.serverIncidents()).filter((i) => i.id === local.id)).toHaveLength(1);
    expect(h.transport.requestLog.some((e) => e.replayed)).toBe(true);
    const created = (await h.serverEvents()).filter(
      (e) => e.type === 'incident.created' && e.incidentId === local.id,
    );
    expect(created).toHaveLength(1);
    const types = (await h.db.activityEvents.toArray()).map((e) => e.type);
    expect(types).toContain('RESPONSE_LOST');
    expect(types).toContain('IDEMPOTENT_REPLAY');
  });

  it('detects a version conflict and resolves it by keeping local changes', async () => {
    const [target] = await h.serverIncidents();
    h.sim.disconnected = true;
    await updateIncidentLocally(h.db, target!.id, { title: 'Edited while offline' });
    h.sim.disconnected = false;
    await h.api.remoteEdit(target!.id); // server v2 by "a colleague"

    await h.syncUntilSettled();
    const conflict = await loadConflict(h.db, target!.id);
    expect(conflict?.details).toMatchObject({
      expectedVersion: 1,
      actualVersion: 2,
      deleted: false,
    });
    expect(conflict?.differingFields).toEqual(
      expect.arrayContaining(['title', 'status', 'assignedTo']),
    );
    expect((await h.db.incidents.get(target!.id))?.syncStatus).toBe('conflict');

    await keepLocalChanges(h.db, target!.id);
    const replacement = await h.db.mutationQueue.toArray();
    expect(replacement).toHaveLength(1);
    expect(replacement[0]).toMatchObject({ baseVersion: 2, status: 'queued' });
    expect(replacement[0]!.id).not.toBe(conflict!.mutation.id);

    await h.syncUntilSettled();
    const server = (await h.serverIncidents()).find((i) => i.id === target!.id)!;
    expect(server.title).toBe('Edited while offline');
    expect(server.version).toBe(3);
    // Local "keep mine" means all local fields win, including ones the remote edit changed.
    expect(server.status).toBe(target!.status);
  });

  it('resolves a conflict by accepting the server version', async () => {
    const [target] = await h.serverIncidents();
    h.sim.disconnected = true;
    await updateIncidentLocally(h.db, target!.id, { title: 'Doomed local edit' });
    h.sim.disconnected = false;
    const remote = await h.api.remoteEdit(target!.id);
    await h.syncUntilSettled();

    await acceptServerVersion(h.db, target!.id);
    expect(await h.db.mutationQueue.count()).toBe(0);
    expect(await h.db.incidents.get(target!.id)).toMatchObject({
      title: remote.data.incident.title,
      version: 2,
      syncStatus: 'synced',
    });
    expect((await h.serverIncidents()).find((i) => i.id === target!.id)?.version).toBe(2);
  });

  it('resolves a conflict with a field-level merge', async () => {
    const [target] = await h.serverIncidents();
    h.sim.disconnected = true;
    await updateIncidentLocally(h.db, target!.id, { title: 'Merged title', severity: 'critical' });
    h.sim.disconnected = false;
    const remote = (await h.api.remoteEdit(target!.id)).data.incident;
    await h.syncUntilSettled();

    const view = (await loadConflict(h.db, target!.id))!;
    await mergeChanges(h.db, target!.id, {
      ...remote,
      title: view.local.title,
      severity: view.local.severity,
    });
    await h.syncUntilSettled();
    const server = (await h.serverIncidents()).find((i) => i.id === target!.id)!;
    expect(server).toMatchObject({
      title: 'Merged title',
      severity: 'critical',
      status: remote.status,
      assignedTo: remote.assignedTo,
      version: 3,
    });
  });

  it('recovers mutations interrupted mid-sync without duplicating them', async () => {
    const local = await createIncidentLocally(h.db, FIELDS);
    const [mutation] = await h.db.mutationQueue.toArray();
    // Simulate a tab that sent the request and died before recording the ack.
    await h.api.createIncident(mutation!.id, mutation!.payload as never);
    await h.db.mutationQueue.update(mutation!.seq!, { status: 'syncing', attempts: 1 });

    await h.syncUntilSettled();
    expect((await h.serverIncidents()).filter((i) => i.id === local.id)).toHaveLength(1);
    expect((await h.db.activityEvents.toArray()).map((e) => e.type)).toContain(
      'SYNC_RECOVERED_INTERRUPTED',
    );
    expect(await h.db.incidents.get(local.id)).toMatchObject({ syncStatus: 'synced', version: 1 });
  });

  it('lets only one of two concurrent engines (tabs) drain the queue', async () => {
    const second = h.makeEngine();
    h.sim.latencyMs = 5;
    const local = await createIncidentLocally(h.db, FIELDS);
    await updateIncidentLocally(h.db, local.id, { status: 'resolved' });

    await Promise.all([
      h.engine.requestSync({ reason: 'tab A', force: true }),
      second.requestSync({ reason: 'tab B', force: true }),
    ]);
    expect(second.getState().lockedByOtherTab).toBe(true);
    await h.syncUntilSettled();
    await h.syncUntilSettled(second);

    const events = (await h.serverEvents()).filter((e) => e.incidentId === local.id);
    expect(events.map((e) => e.type)).toEqual(['incident.created', 'incident.updated']);
    expect((await h.serverIncidents()).find((i) => i.id === local.id)?.version).toBe(2);
    // The lock prevented any double send; idempotency was never needed here.
    expect(h.transport.requestLog.some((e) => e.replayed)).toBe(false);
  });

  it('parks permanently rejected mutations without blocking other incidents', async () => {
    const bad = await createIncidentLocally(h.db, FIELDS);
    const good = await createIncidentLocally(h.db, { ...FIELDS, title: 'Healthy incident' });
    const [badMutation] = await h.db.mutationQueue.where('entityId').equals(bad.id).toArray();
    // Corrupt the stored payload (e.g. written by an incompatible older build).
    await h.db.mutationQueue.update(badMutation!.seq!, {
      payload: { ...(badMutation!.payload as object), severity: 'apocalyptic' },
    });

    await h.syncUntilSettled();
    expect((await h.db.mutationQueue.get(badMutation!.seq!))?.status).toBe('failed');
    expect((await h.db.incidents.get(bad.id))?.syncStatus).toBe('failed');
    expect((await h.serverIncidents()).some((i) => i.id === good.id)).toBe(true);
  });

  it('pulls remote changes into records without pending work', async () => {
    const [target] = await h.serverIncidents();
    await h.api.remoteEdit(target!.id);
    await pullEvents(h.db, h.api);
    expect((await h.db.incidents.get(target!.id))?.version).toBe(2);
    expect((await h.db.activityEvents.toArray()).map((e) => e.type)).toContain(
      'REMOTE_CHANGE_DETECTED',
    );
  });

  it('holds work while disconnected and logs the skip once', async () => {
    h.setConnected(false);
    await createIncidentLocally(h.db, FIELDS);
    await h.engine.requestSync({ reason: 'test' });
    await h.engine.requestSync({ reason: 'test' });
    expect(h.engine.getState().phase).toBe('offline');
    const skips = (await h.db.activityEvents.toArray()).filter(
      (e) => e.type === 'SYNC_SKIPPED_OFFLINE',
    );
    expect(skips).toHaveLength(1);
    expect(h.transport.requestLog.filter((e) => e.kind === 'mutation')).toHaveLength(0);
  });
});

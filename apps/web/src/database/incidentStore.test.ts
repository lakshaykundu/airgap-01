import type { IncidentFields } from '@airgap/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyOutcome } from '../services/sync/MutationProcessor';
import { AirgapDatabase } from './db';
import {
  createIncidentLocally,
  deleteIncidentLocally,
  deriveSyncStatus,
  updateIncidentLocally,
} from './incidentStore';

const FIELDS: IncidentFields = {
  title: 'Substation voltage sag',
  description: 'Unit test',
  severity: 'medium',
  status: 'open',
  sectorId: 's03',
  assignedTo: null,
};

let db: AirgapDatabase;
beforeEach(() => {
  db = new AirgapDatabase(`unit-${crypto.randomUUID()}`);
});
afterEach(() => db.delete());

describe('local-first incident store', () => {
  it('writes the incident and its CREATE mutation atomically, with no invented version', async () => {
    const incident = await createIncidentLocally(db, FIELDS);
    const [mutation] = await db.mutationQueue.toArray();
    expect(incident).toMatchObject({ version: 0, syncStatus: 'pending', deleted: 0 });
    expect(mutation).toMatchObject({
      type: 'CREATE_INCIDENT',
      entityId: incident.id,
      status: 'queued',
      attempts: 0,
    });
    expect(mutation!.id).not.toBe(incident.id); // idempotency key ≠ entity id
  });

  it('rejects invalid input before anything is stored', async () => {
    await expect(createIncidentLocally(db, { ...FIELDS, title: 'x' })).rejects.toThrow();
    expect(await db.incidents.count()).toBe(0);
    expect(await db.mutationQueue.count()).toBe(0);
  });

  it('keeps mutations in creation order and only sends changed fields', async () => {
    const incident = await createIncidentLocally(db, FIELDS);
    await updateIncidentLocally(db, incident.id, { status: 'investigating' });
    await updateIncidentLocally(db, incident.id, { status: 'investigating' }); // no-op
    await updateIncidentLocally(db, incident.id, { severity: 'critical', title: 'Escalated' });
    const queue = await db.mutationQueue.orderBy('seq').toArray();
    expect(queue.map((m) => m.type)).toEqual([
      'CREATE_INCIDENT',
      'UPDATE_INCIDENT',
      'UPDATE_INCIDENT',
    ]);
    expect(queue[1]!.payload).toEqual({ changes: { status: 'investigating' } });
    expect(queue[2]!.payload).toEqual({ changes: { severity: 'critical', title: 'Escalated' } });
  });

  it('rebases later mutations onto the version the server assigns', async () => {
    const incident = await createIncidentLocally(db, FIELDS);
    await updateIncidentLocally(db, incident.id, { status: 'resolved' });
    const [create, update] = await db.mutationQueue.orderBy('seq').toArray();
    expect(update!.baseVersion).toBe(0); // its CREATE is not acknowledged yet

    await applyOutcome(db, create!, {
      kind: 'acked',
      incident: {
        ...FIELDS,
        id: incident.id,
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt,
        version: 1,
      },
      version: 1,
      replayed: false,
      durationMs: 5,
    });
    const remaining = await db.mutationQueue.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.baseVersion).toBe(1);
    // Local edit is preserved; only the acknowledged version moves.
    expect(await db.incidents.get(incident.id)).toMatchObject({
      status: 'resolved',
      version: 1,
      syncStatus: 'pending',
    });
  });

  it('cancels create+delete locally when the create was never sent', async () => {
    const incident = await createIncidentLocally(db, FIELDS);
    await updateIncidentLocally(db, incident.id, { severity: 'high' });
    expect(await deleteIncidentLocally(db, incident.id)).toBe('cancelled-locally');
    expect(await db.incidents.count()).toBe(0);
    expect(await db.mutationQueue.count()).toBe(0);
  });

  it('queues a DELETE (tombstone) once the create may have reached the server', async () => {
    const incident = await createIncidentLocally(db, FIELDS);
    const [create] = await db.mutationQueue.toArray();
    await db.mutationQueue.update(create!.seq!, { attempts: 1 }); // sent, outcome unknown
    expect(await deleteIncidentLocally(db, incident.id)).toBe('queued');
    expect(await db.incidents.get(incident.id)).toMatchObject({ deleted: 1 });
    expect((await db.mutationQueue.orderBy('seq').toArray()).map((m) => m.type)).toEqual([
      'CREATE_INCIDENT',
      'DELETE_INCIDENT',
    ]);
  });

  it('records a retry with backoff and parks the mutation after too many failures', async () => {
    await createIncidentLocally(db, FIELDS);
    let [mutation] = await db.mutationQueue.toArray();
    const now = new Date('2026-01-01T00:00:00Z');
    await applyOutcome(
      db,
      mutation!,
      { kind: 'retry', code: 'network', message: 'down' },
      { now: () => now, random: () => 0.5 },
    );
    [mutation] = await db.mutationQueue.toArray();
    expect(mutation).toMatchObject({
      status: 'queued',
      retryCount: 1,
      nextRetryAt: '2026-01-01T00:00:01.000Z',
    });

    await db.mutationQueue.update(mutation!.seq!, { retryCount: 8 });
    [mutation] = await db.mutationQueue.toArray();
    await applyOutcome(db, mutation!, { kind: 'retry', code: 'network', message: 'down' });
    expect((await db.mutationQueue.toArray())[0]!.status).toBe('failed');
  });
});

describe('deriveSyncStatus', () => {
  it('prioritises conflict > failed > syncing > pending', () => {
    expect(deriveSyncStatus([])).toBe('synced');
    expect(deriveSyncStatus([{ status: 'queued' }])).toBe('pending');
    expect(deriveSyncStatus([{ status: 'queued' }, { status: 'syncing' }])).toBe('syncing');
    expect(deriveSyncStatus([{ status: 'failed' }, { status: 'syncing' }])).toBe('failed');
    expect(deriveSyncStatus([{ status: 'failed' }, { status: 'conflict' }])).toBe('conflict');
  });
});

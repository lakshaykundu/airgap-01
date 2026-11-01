import type { Incident } from '@airgap/shared';
import type { AirgapDatabase } from '../../database/db';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithRuntime } from '../../test/renderWithRuntime';
import { uiActions } from '../../store/uiSlice';
import { ConflictDialog } from './ConflictDialog';

const ID = '7d2c0000-0000-4000-8000-000000000001';
const server: Incident = {
  id: ID,
  title: 'Server title',
  description: 'Escalated by field team',
  severity: 'high',
  status: 'investigating',
  sectorId: 's04',
  assignedTo: 'K. Okafor',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  version: 4,
};

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

async function seedConflict(db: AirgapDatabase) {
  await db.incidents.put({
    ...server,
    title: 'My offline title',
    status: 'open',
    version: 3,
    syncStatus: 'conflict',
    deleted: 0,
  });
  await db.mutationQueue.add({
    id: crypto.randomUUID(),
    type: 'UPDATE_INCIDENT',
    entityId: ID,
    payload: { changes: { title: 'My offline title', status: 'open' } },
    baseVersion: 3,
    status: 'conflict',
    attempts: 1,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    label: 'title → “My offline title”',
    conflict: {
      incidentId: ID,
      expectedVersion: 3,
      actualVersion: 4,
      serverIncident: server,
      deleted: false,
    },
  });
}

describe('ConflictDialog', () => {
  it('shows a field-level diff of local vs server', async () => {
    const { store, db, runtime } = renderWithRuntime(<ConflictDialog />);
    cleanup = () => runtime.dispose();
    await seedConflict(db);
    act(() => {
      store.dispatch(uiActions.openConflict(ID));
    });
    const dialog = await screen.findByTestId('conflict-dialog');
    expect(within(dialog).getByTestId('conflict-row-title')).toBeTruthy();
    const differing = dialog.querySelectorAll('[data-differs="true"]');
    expect([...differing].map((el) => el.getAttribute('data-testid'))).toEqual([
      'conflict-row-title',
      'conflict-row-status',
    ]);
    expect(screen.getByText(/based on v3, but the server is now at v4/)).toBeInTheDocument();
  });

  it('KEEP MY CHANGES replaces the stale mutation with one based on the server version', async () => {
    const user = userEvent.setup();
    const { store, db, runtime } = renderWithRuntime(<ConflictDialog />);
    cleanup = () => runtime.dispose();
    await seedConflict(db);
    act(() => {
      store.dispatch(uiActions.openConflict(ID));
    });
    await user.click(await screen.findByTestId('keep-local'));
    await waitFor(async () => expect((await db.mutationQueue.toArray())[0]?.status).toBe('queued'));
    const [mutation] = await db.mutationQueue.toArray();
    expect(mutation).toMatchObject({
      baseVersion: 4,
      payload: { changes: { title: 'My offline title', status: 'open' } },
    });
    expect(await db.incidents.get(ID)).toMatchObject({
      version: 4,
      title: 'My offline title',
      syncStatus: 'pending',
    });
  });

  it('ACCEPT SERVER VERSION discards local mutations and adopts the server copy', async () => {
    const user = userEvent.setup();
    const { store, db, runtime } = renderWithRuntime(<ConflictDialog />);
    cleanup = () => runtime.dispose();
    await seedConflict(db);
    act(() => {
      store.dispatch(uiActions.openConflict(ID));
    });
    await user.click(await screen.findByTestId('accept-server'));
    await waitFor(async () => expect(await db.mutationQueue.count()).toBe(0));
    expect(await db.incidents.get(ID)).toMatchObject({
      title: 'Server title',
      version: 4,
      syncStatus: 'synced',
    });
  });
});

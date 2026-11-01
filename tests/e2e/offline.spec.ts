import { expect, test } from '@playwright/test';
import {
  bootApp,
  createIncident,
  expectQueue,
  incidentRow,
  saveEditorAndCloseDrawer,
  serverIncidents,
  sessionId,
  setSimulatedDisconnect,
  waitForBoot,
  waitForServiceWorker,
} from './helpers';

test.describe('Offline-first', () => {
  test('1 — survives a REAL browser outage: create, reload, edit, reload, reconnect, sync', async ({
    page,
    context,
    request,
  }) => {
    await bootApp(page, '/incidents');
    await waitForServiceWorker(page);
    const session = await sessionId(page);

    // DevTools-style offline: the browser itself has no network (not the in-app simulator).
    await context.setOffline(true);
    await expect(page.getByTestId('connection-badge')).toHaveAttribute('data-reason', 'browser');

    await createIncident(page, 'E2E offline persistence', 'critical');
    await expect(incidentRow(page, 'E2E offline persistence')).toHaveAttribute(
      'data-sync',
      'pending',
    );
    await expectQueue(page, 1);

    // Reload with no network: the service worker serves the shell, IndexedDB the data.
    await page.reload();
    await waitForBoot(page);
    await expect(page.getByTestId('connection-badge')).toHaveAttribute('data-reason', 'browser');
    await expect(incidentRow(page, 'E2E offline persistence')).toBeVisible();
    await expectQueue(page, 1);

    // Edit while still offline.
    await incidentRow(page, 'E2E offline persistence').click();
    await page.getByTestId('edit-incident').click();
    await page
      .getByTestId('incident-form')
      .getByLabel('Incident title')
      .fill('E2E offline persistence — edited');
    await saveEditorAndCloseDrawer(page);
    await expectQueue(page, 2);

    await page.reload();
    await waitForBoot(page);
    await expect(incidentRow(page, 'E2E offline persistence — edited')).toBeVisible();
    await expectQueue(page, 2);
    expect(
      (await serverIncidents(request, session)).some((i) =>
        i.title.startsWith('E2E offline persistence'),
      ),
    ).toBe(false);

    // Reconnect: the queue drains on its own.
    await context.setOffline(false);
    await expectQueue(page, 0, 30_000);
    await expect(incidentRow(page, 'E2E offline persistence — edited')).toHaveAttribute(
      'data-sync',
      'synced',
    );
    const onServer = (await serverIncidents(request, session)).filter((i) =>
      i.title.startsWith('E2E offline persistence'),
    );
    expect(onServer).toHaveLength(1);
    expect(onServer[0]).toMatchObject({
      title: 'E2E offline persistence — edited',
      severity: 'critical',
      version: 2,
    });
  });

  test('2 — reconnection after a simulated API disconnect drains the queue', async ({
    page,
    request,
  }) => {
    await bootApp(page, '/incidents');
    const session = await sessionId(page);
    await setSimulatedDisconnect(page, true);
    await expect(page.getByTestId('connection-badge')).toHaveAttribute('data-reason', 'simulated');

    await createIncident(page, 'E2E reconnect check');
    await expectQueue(page, 1);
    expect(
      (await serverIncidents(request, session)).some((i) => i.title === 'E2E reconnect check'),
    ).toBe(false);

    await setSimulatedDisconnect(page, false);
    await expectQueue(page, 0);
    const onServer = (await serverIncidents(request, session)).filter(
      (i) => i.title === 'E2E reconnect check',
    );
    expect(onServer).toHaveLength(1);
    await expect(incidentRow(page, 'E2E reconnect check')).toHaveAttribute('data-sync', 'synced');
  });
});

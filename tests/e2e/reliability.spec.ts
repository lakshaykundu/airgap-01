import { expect, test } from '@playwright/test';
import {
  bootApp,
  createIncident,
  expectQueue,
  incidentRow,
  saveEditorAndCloseDrawer,
  localStore,
  serverEvents,
  serverIncidents,
  sessionId,
  setSimulatedDisconnect,
  waitForBoot,
} from './helpers';

test.describe('Reliability', () => {
  test('3 — a lost response is retried with the same key and applied exactly once', async ({
    page,
    request,
  }) => {
    await bootApp(page, '/lab');
    const session = await sessionId(page);
    await page.getByTestId('drop-next').click();
    await expect(page.getByTestId('lab-status')).toContainText('Drop next: armed');

    await createIncident(page, 'E2E idempotency check');
    await expectQueue(page, 0, 20_000);
    await expect(page.getByTestId('lab-status')).toContainText('Drop next: off');

    const matches = (await serverIncidents(request, session)).filter(
      (i) => i.title === 'E2E idempotency check',
    );
    expect(matches).toHaveLength(1);
    const created = (await serverEvents(request, session)).filter(
      (e) => e.type === 'incident.created' && e.incidentId === matches[0]!.id,
    );
    expect(created).toHaveLength(1);

    const activity = await localStore<{ type: string }>(page, 'activityEvents');
    expect(activity.map((e) => e.type)).toEqual(
      expect.arrayContaining(['RESPONSE_LOST', 'IDEMPOTENT_REPLAY']),
    );
    await expect(page.getByTestId('request-log')).toContainText('replay');
  });

  test('4 — a stale offline edit raises a conflict that the operator resolves', async ({
    page,
    request,
  }) => {
    await bootApp(page, '/incidents');
    const session = await sessionId(page);
    const target = (await serverIncidents(request, session))[0]!;

    await setSimulatedDisconnect(page, true);
    await incidentRow(page, target.title).first().click();
    await page.getByTestId('edit-incident').click();
    await page
      .getByTestId('incident-form')
      .getByLabel('Incident title')
      .fill('E2E conflict — my offline title');
    await saveEditorAndCloseDrawer(page);
    await expectQueue(page, 1);

    // Another client changes the same incident on the server (v1 → v2).
    const remote = await request.post('/api/demo/remote-edit', {
      headers: { 'x-airgap-session': session },
      data: { incidentId: target.id },
    });
    expect((await remote.json()).incident.version).toBe(target.version + 1);

    await setSimulatedDisconnect(page, false);
    await expect(incidentRow(page, 'E2E conflict — my offline title')).toHaveAttribute(
      'data-sync',
      'conflict',
      { timeout: 15_000 },
    );

    await page.getByTestId('queue-counter').click();
    await page.getByTestId('resolve-conflict').click();
    const dialog = page.getByTestId('conflict-dialog');
    await expect(page.getByRole('dialog')).toContainText(`based on v${target.version}`);
    await expect(dialog.getByTestId('conflict-row-title')).toHaveAttribute('data-differs', 'true');
    await dialog.getByTestId('keep-local').click();

    await expectQueue(page, 0);
    const final = (await serverIncidents(request, session)).find((i) => i.id === target.id)!;
    expect(final.title).toBe('E2E conflict — my offline title');
    expect(final.version).toBe(target.version + 2);
  });

  test('6 — two tabs share one queue; only one tab sends each mutation', async ({
    context,
    request,
  }) => {
    const tabA = await context.newPage();
    await bootApp(tabA, '/incidents');
    const tabB = await context.newPage();
    await bootApp(tabB, '/incidents');
    const session = await sessionId(tabA);

    await setSimulatedDisconnect(tabA, true);
    // The simulator state is shared through localStorage → tab B goes offline too.
    await expect(tabB.getByTestId('connection-badge')).toHaveAttribute('data-reason', 'simulated');

    await createIncident(tabA, 'E2E two tabs');
    await expectQueue(tabA, 1);
    await expectQueue(tabB, 1); // live query across tabs
    await expect(incidentRow(tabB, 'E2E two tabs')).toBeVisible();

    await setSimulatedDisconnect(tabA, false);
    await expectQueue(tabA, 0);
    await expectQueue(tabB, 0);
    await expect(incidentRow(tabB, 'E2E two tabs')).toHaveAttribute('data-sync', 'synced');

    const onServer = (await serverIncidents(request, session)).filter(
      (i) => i.title === 'E2E two tabs',
    );
    expect(onServer).toHaveLength(1);
    const created = (await serverEvents(request, session)).filter(
      (e) => e.type === 'incident.created' && e.incidentId === onServer[0]!.id,
    );
    expect(created).toHaveLength(1);
  });

  test('7 — a reload in the middle of synchronization loses and duplicates nothing', async ({
    page,
    request,
  }) => {
    await bootApp(page, '/sync');
    const session = await sessionId(page);
    await setSimulatedDisconnect(page, true);
    const titles = ['E2E interrupted A', 'E2E interrupted B', 'E2E interrupted C'];
    for (const title of titles) await createIncident(page, title);
    await expectQueue(page, 3);

    // Slow every request down so the reload lands mid-flight.
    await page.goto('/lab');
    await waitForBoot(page);
    await page.getByRole('radio', { name: /Simulated 2G/ }).click();
    await page.goto('/sync');
    await waitForBoot(page);
    await setSimulatedDisconnect(page, false);
    await expect(
      page
        .getByTestId('queue-item')
        .filter({ hasText: 'processing' })
        .or(page.locator('[data-testid=queue-item][data-status=syncing]'))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.reload(); // interrupt
    await waitForBoot(page);

    // Speed things back up and let recovery finish.
    await page.goto('/lab');
    await waitForBoot(page);
    await page.getByRole('radio', { name: 'Normal' }).click();
    await expectQueue(page, 0, 30_000);

    const server = await serverIncidents(request, session);
    for (const title of titles)
      expect(
        server.filter((i) => i.title === title),
        title,
      ).toHaveLength(1);
    const createdEvents = (await serverEvents(request, session)).filter(
      (e) => e.type === 'incident.created',
    );
    expect(new Set(createdEvents.map((e) => e.incidentId)).size).toBe(createdEvents.length);
  });
});

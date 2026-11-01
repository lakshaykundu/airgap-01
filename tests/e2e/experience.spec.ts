import { expect, test } from '@playwright/test';
import { bootApp, serverIncidents, sessionId, waitForBoot } from './helpers';

test.describe('Experience', () => {
  test('5 — LOAD TEST / 1000: generate, search, filter, sort and scroll a virtualized list', async ({
    page,
  }) => {
    await bootApp(page, '/lab');
    await page.getByTestId('generate-records').click();
    await expect(page.getByTestId('stress-result-count')).toContainText('1000 matching', {
      timeout: 20_000,
    });

    // Ground truth computed independently from IndexedDB inside the page.
    const expected = await page.evaluate(
      () =>
        new Promise<{ relay: number; relayCritical: number }>((resolve) => {
          const open = indexedDB.open('airgap-01');
          open.onsuccess = () => {
            const all = open.result
              .transaction('stressTestRecords')
              .objectStore('stressTestRecords')
              .getAll();
            all.onsuccess = () => {
              const rows = all.result as { search: string; severity: string }[];
              const relay = rows.filter((r) => r.search.includes('relay'));
              resolve({
                relay: relay.length,
                relayCritical: relay.filter((r) => r.severity === 'critical').length,
              });
            };
          };
        }),
    );
    expect(expected.relay).toBeGreaterThan(0);

    await page.getByTestId('stress-search').fill('relay');
    await expect(page.getByTestId('stress-result-count')).toContainText(
      `${expected.relay} matching`,
    );

    await page.getByTestId('stress-filters').getByRole('button', { name: 'critical' }).click();
    await expect(page.getByTestId('stress-result-count')).toContainText(
      `${expected.relayCritical} matching`,
    );
    const severities = await page
      .getByTestId('stress-row')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-severity')));
    expect(new Set(severities)).toEqual(new Set(['critical']));

    // Clear filters, scroll to the end of 1,000 rows: only a window of rows is ever mounted.
    await page.getByTestId('stress-filters').getByRole('button', { name: 'critical' }).click();
    await page.getByTestId('stress-search').fill('');
    await expect(page.getByTestId('stress-result-count')).toContainText('1000 matching');
    await page.getByTestId('stress-list').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(page.getByTestId('stress-row').last()).toBeVisible();
    const mounted = await page.getByTestId('stress-row').count();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(60); // virtualization: never ~1000 DOM rows

    // Stable perf assertion: a measured value exists and is sane (no hardware-specific target).
    const queryText = await page.getByTestId('perf-panel').textContent();
    expect(queryText).toMatch(/IndexedDB query\s*[\d.]+ ms/);
    await page.getByTestId('stress-row').last().click();
    await expect(page.getByTestId('stress-detail')).toBeVisible();
  });

  test('8 — the 60-second challenge runs on the real offline machinery', async ({
    page,
    request,
  }) => {
    await bootApp(page);
    const session = await sessionId(page);
    await page.getByTestId('start-challenge').click();
    const overlay = page.getByTestId('challenge-overlay');
    await expect(overlay).toHaveAttribute('data-step', 'disconnect');

    await page.getByTestId('challenge-disconnect').click();
    await expect(overlay).toHaveAttribute('data-step', 'create');
    await page.getByTestId('challenge-create').click();
    const form = page.getByTestId('incident-form');
    await form.getByLabel('Incident title').fill('E2E challenge incident');
    await form.getByTestId('incident-submit').click();
    await expect(page.getByTestId('challenge-pending')).toHaveText(/Pending sync: 01/i);

    await page.getByTestId('challenge-next').click();
    await expect(overlay).toHaveAttribute('data-step', 'persist');
    await page.getByTestId('challenge-test-persistence').click(); // performs a real reload
    await page.waitForLoadState('load');
    await waitForBoot(page);
    await expect(page.getByTestId('challenge-overlay')).toHaveAttribute('data-step', 'reconnect', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('challenge-overlay')).toContainText('After a full page reload');

    await page.getByTestId('challenge-restore').click();
    const complete = page.getByTestId('challenge-complete');
    await expect(complete).toBeVisible({ timeout: 30_000 });
    for (const line of [
      'Network disconnected',
      'Local changes preserved',
      'Reload survived',
      'Server synchronized',
    ]) {
      await expect(complete).toContainText(line);
    }
    await expect(complete).toContainText("THE NETWORK FAILED. YOUR WORK DIDN'T.");
    expect(
      (await serverIncidents(request, session)).filter((i) => i.title === 'E2E challenge incident'),
    ).toHaveLength(1);
  });

  test('responsive: no horizontal overflow at target viewports', async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [768, 1024],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const path of ['/', '/incidents', '/sync', '/lab', '/map']) {
        await page.goto(path);
        await waitForBoot(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} @ ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });
});

test('no console errors or page errors across every route', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await bootApp(page);
  for (const path of [
    '/',
    '/map',
    '/incidents',
    '/activity',
    '/sync',
    '/lab',
    '/architecture',
    '/about',
  ]) {
    await page.goto(path);
    await waitForBoot(page);
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

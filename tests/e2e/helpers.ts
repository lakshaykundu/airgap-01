import { expect, type APIRequestContext, type Page } from '@playwright/test';

export interface ServerIncident {
  id: string;
  title: string;
  status: string;
  severity: string;
  version: number;
}

/** Opens the console and waits until boot finished and the backend is confirmed reachable. */
export async function bootApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await waitForBoot(page);
  await expect(page.getByTestId('connection-badge')).toHaveAttribute(
    'data-state',
    /CONNECTED|SYNCHRONIZING|DEGRADED/,
    { timeout: 15_000 },
  );
}

export async function waitForBoot(page: Page): Promise<void> {
  await expect(page.getByTestId('connection-badge')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Initializing operations console')).toHaveCount(0, {
    timeout: 10_000,
  });
}

/** Waits until the service worker controls the page (app shell precached). */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(
        registration?.active?.state === 'activated' && navigator.serviceWorker.controller,
      );
    },
    undefined,
    { timeout: 20_000 },
  );
}

export async function sessionId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('airgap-01');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result
            .transaction('syncMetadata')
            .objectStore('syncMetadata')
            .get('sessionId');
          get.onsuccess = () => resolve((get.result as { value: string }).value);
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

export async function serverIncidents(
  request: APIRequestContext,
  session: string,
): Promise<ServerIncident[]> {
  const res = await request.get('/api/incidents', { headers: { 'x-airgap-session': session } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { incidents: ServerIncident[] }).incidents;
}

export async function serverEvents(
  request: APIRequestContext,
  session: string,
): Promise<{ type: string; incidentId: string | null }[]> {
  const res = await request.get('/api/events?after=0&limit=500', {
    headers: { 'x-airgap-session': session },
  });
  return ((await res.json()) as { events: { type: string; incidentId: string | null }[] }).events;
}

export async function queueCount(page: Page): Promise<number> {
  return Number(await page.getByTestId('queue-counter').getAttribute('data-count'));
}

export async function expectQueue(page: Page, count: number, timeout = 20_000): Promise<void> {
  await expect(page.getByTestId('queue-counter')).toHaveAttribute('data-count', String(count), {
    timeout,
  });
}

/** Creates an incident through the real form. Works from any page. */
export async function createIncident(
  page: Page,
  title: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'high',
): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('Type a command…').fill('Create incident');
  await page.keyboard.press('Enter');
  const form = page.getByTestId('incident-form');
  await expect(form).toBeVisible();
  await form.getByLabel('Incident title').fill(title);
  await form.getByRole('radio', { name: severity }).click();
  await form.getByTestId('incident-submit').click();
  await expect(form).toHaveCount(0);
}

export function incidentRow(page: Page, title: string) {
  return page.getByTestId('incident-row').filter({ hasText: title });
}

export async function setSimulatedDisconnect(page: Page, disconnected: boolean): Promise<void> {
  const toggle = page.getByTestId('network-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== String(disconnected)) await toggle.click();
  await expect(page.getByTestId('connection-badge')).toHaveAttribute(
    'data-state',
    disconnected ? 'OFFLINE' : /CONNECTED|SYNCHRONIZING|DEGRADED/,
    { timeout: 15_000 },
  );
}

/** Reads every row of an IndexedDB store inside the page (ground truth for local state). */
export async function localStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('airgap-01');
        open.onsuccess = () => {
          const all = open.result.transaction(name).objectStore(name).getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        };
        open.onerror = () => reject(open.error);
      }),
    store,
  ) as Promise<T[]>;
}

/** Saves the open editor form, then closes the incident detail drawer behind it. */
export async function saveEditorAndCloseDrawer(page: Page): Promise<void> {
  await page.getByTestId('incident-submit').click();
  await expect(page.getByTestId('incident-form')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

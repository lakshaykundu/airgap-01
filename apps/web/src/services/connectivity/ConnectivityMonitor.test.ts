// @vitest-environment node
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../api/client';
import { DEFAULT_SIMULATOR, Transport } from '../api/transport';
import { ConnectivityMonitor } from './ConnectivityMonitor';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createMonitor() {
  const ref: { monitor?: ConnectivityMonitor } = {};
  const transport = new Transport({
    baseUrl: 'http://api.test',
    getConfig: () => DEFAULT_SIMULATOR,
    getSessionId: () => 's',
    onOutcome: (entry, error) => ref.monitor?.reportRequest(entry, error),
  });
  const monitor = (ref.monitor = new ConnectivityMonitor({
    api: new ApiClient(transport),
    isSimulatedDisconnect: () => false,
    onlineIntervalMs: 60_000,
    offlineIntervalMs: 60_000,
  }));
  return { monitor, api: new ApiClient(transport) };
}

describe('ConnectivityMonitor (backend reachability, not navigator.onLine)', () => {
  it('is reachable only after a successful health probe', async () => {
    server.use(
      http.get('http://api.test/api/health', () =>
        HttpResponse.json({ ok: true, time: '', uptimeSeconds: 1 }),
      ),
    );
    const { monitor } = createMonitor();
    expect(monitor.getSnapshot().backendReachable).toBeNull();
    expect(await monitor.check()).toBe(true);
    expect(monitor.getSnapshot()).toMatchObject({ backendReachable: true, lastFailure: null });
    monitor.stop();
  });

  it('treats 5xx and network errors as unreachable even when the browser is online', async () => {
    server.use(
      http.get('http://api.test/api/health', () => new HttpResponse(null, { status: 503 })),
    );
    const { monitor } = createMonitor();
    expect(await monitor.check()).toBe(false);
    server.use(http.get('http://api.test/api/health', () => HttpResponse.error()));
    expect(await monitor.check()).toBe(false);
    expect(monitor.getSnapshot().backendReachable).toBe(false);
    expect(monitor.getSnapshot().browserOnline).toBe(true);
    monitor.stop();
  });

  it('re-probes when a real data request fails, and learns from successful requests', async () => {
    let healthy = true;
    server.use(
      http.get('http://api.test/api/health', () =>
        healthy ? HttpResponse.json({ ok: true }) : HttpResponse.error(),
      ),
      http.get('http://api.test/api/incidents', () =>
        healthy ? HttpResponse.json({ incidents: [], cursor: 0 }) : HttpResponse.error(),
      ),
    );
    const { monitor, api } = createMonitor();
    await monitor.check();
    healthy = false;
    await expect(api.listIncidents()).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(monitor.getSnapshot().backendReachable).toBe(false);
    healthy = true;
    await api.listIncidents();
    expect(monitor.getSnapshot().backendReachable).toBe(true);
    monitor.stop();
  });
});

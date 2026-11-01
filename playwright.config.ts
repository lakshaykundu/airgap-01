import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);

/**
 * E2E runs against the PRODUCTION build served by the real Fastify server
 * (single origin), so the service worker, IndexedDB and SSE behave exactly as
 * deployed. Each test gets a fresh browser context → fresh IndexedDB and its
 * own isolated demo session on the server.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'node tests/e2e/start-server.mjs',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      SESSION_RATE_LIMIT_PER_HOUR: '100000',
      MUTATION_RATE_LIMIT_PER_MINUTE: '100000',
    },
  },
});

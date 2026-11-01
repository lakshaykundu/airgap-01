import { fileURLToPath } from 'node:url';
import { loadConfig } from './config';
import { buildApp } from './app';

// The bundled server is the production artifact; dev.ts overrides this.
process.env.NODE_ENV ??= 'production';
const config = loadConfig();
// Single-origin deployment: serve the built PWA next to the API unless told otherwise.
config.webDistPath ??= fileURLToPath(new URL('../../web/dist', import.meta.url));
const { app, ctx } = await buildApp(config);

const cleanup = () => {
  void ctx.sessions.cleanupExpired().then((removed) => {
    if (removed > 0) app.log.info({ removed }, 'Expired demo sessions removed');
  });
};
cleanup();
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
cleanupTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });
console.log(`AIRGAP/01 server listening on http://localhost:${config.port}`);

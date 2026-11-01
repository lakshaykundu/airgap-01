// Emits a Vercel Build Output API v3 tree (.vercel/output):
//   static/            the built PWA (served by Vercel's CDN)
//   functions/api.func one Node.js function running the Fastify API
//   config.json        routing + security/cache headers
// Run after `pnpm --filter @airgap/web build` (see the `vercel-build` script).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url).pathname;
const out = `${root}.vercel/output`;
const webDist = `${root}apps/web/dist`;
if (!existsSync(`${webDist}/index.html`))
  throw new Error('Build the web app first (apps/web/dist missing)');

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/functions/api.func`, { recursive: true });
cpSync(webDist, `${out}/static`, { recursive: true });

await build({
  entryPoints: [`${root}apps/server/src/vercel.ts`],
  outfile: `${out}/functions/api.func/index.js`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  // PGlite is only for local/Docker (never loaded when DATABASE_URL is set);
  // the rest are optional native/edge variants that `pg` probes for.
  external: ['@electric-sql/pglite', 'pg-native', 'pg-cloudflare', 'cloudflare:sockets'],
  // Expose the handler itself (not { default }) to the Node launcher.
  footer: { js: 'module.exports = module.exports.default;' },
  logLevel: 'warning',
});

writeFileSync(`${out}/functions/api.func/package.json`, JSON.stringify({ type: 'commonjs' }));
writeFileSync(
  `${out}/functions/api.func/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      maxDuration: 30,
    },
    null,
    2,
  ),
);

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join(';');

const config = {
  version: 3,
  routes: [
    // Hashed build assets never change.
    {
      src: '^/assets/(.*)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    // The service worker, HTML and manifest must always revalidate.
    {
      src: '^/(sw\\.js|workbox-[^/]+\\.js|index\\.html|manifest\\.webmanifest)?$',
      headers: { 'cache-control': 'no-cache' },
      continue: true,
    },
    {
      src: '^/(.*)$',
      headers: {
        'content-security-policy': csp,
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'cross-origin-opener-policy': 'same-origin',
      },
      continue: true,
    },
    { src: '^/api/(.*)$', dest: '/api?__path=$1' },
    { handle: 'filesystem' },
    // SPA fallback for client-side routes (no file extension); missing assets stay 404.
    { src: '^/[^.]*$', dest: '/index.html' },
  ],
};
writeFileSync(`${out}/config.json`, JSON.stringify(config, null, 2));
console.log('Vercel Build Output written to .vercel/output');

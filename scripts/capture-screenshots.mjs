// Captures README screenshots from a running production server (default http://localhost:4173).
// Usage: node tests/e2e/start-server.mjs &  then  node scripts/capture-screenshots.mjs
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:4173';
const out = new URL('../docs/screenshots/', import.meta.url).pathname;
const viewports = [
  ['desktop-1440', 1440, 900],
  ['laptop-1280', 1280, 800],
  ['tablet-768', 768, 1024],
  ['mobile-390', 390, 844],
];
const pages = [
  ['overview', '/'],
  ['incidents', '/incidents'],
  ['map', '/map'],
  ['sync', '/sync'],
  ['lab', '/lab'],
  ['architecture', '/architecture'],
  ['about', '/about'],
];

const browser = await chromium.launch();
for (const [name, width, height] of viewports) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByTestId('connection-badge').waitFor();
  await page.waitForTimeout(900);
  for (const [label, path] of pages) {
    if (name !== 'desktop-1440' && !['overview', 'incidents', 'lab'].includes(label)) continue;
    await page.goto(base + path);
    await page.getByTestId('connection-badge').waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}${label}-${name}.png`, fullPage: false });
  }
  await context.close();
}
await browser.close();
console.log(`Screenshots written to ${out}`);

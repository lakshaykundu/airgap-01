// Renders the SVG logo to the PNG icons required by the web app manifest.
// Usage: node scripts/generate-icons.mjs   (uses the Playwright Chromium already installed for E2E)
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../apps/web/public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const padding = Math.round(size * 0.1);
  await page.setContent(
    `<html><body style="margin:0;background:#05070d;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${size - padding * 2}px;height:${size - padding * 2}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </body></html>`,
  );
  await page.screenshot({
    path: new URL(`../apps/web/public/icons/icon-${size}.png`, import.meta.url).pathname,
  });
  await page.close();
}
await browser.close();
console.log('Icons written to apps/web/public/icons');

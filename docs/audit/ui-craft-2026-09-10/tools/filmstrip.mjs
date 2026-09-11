// Filmstrip of a tab tap: what the user sees at t=0/300/700/1200/1800ms after tapping.
import path from 'node:path';
import os from 'node:os';
// Output root for screenshots/metrics. Override with AUDIT_OUT=/some/dir.
const OUTDIR = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'dungeon-hub-ui-audit');
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(path.resolve(import.meta.dirname, '../../../../apps/web/package.json'));
const { chromium } = require('@playwright/test');
// Override with AUDIT_BASE to measure a Vercel preview deploy instead of production.
const BASE = process.env.AUDIT_BASE ?? 'https://dungeon-hub.vercel.app';
const ROOT = OUTDIR;
const MODE = process.argv[2] ?? 'mobile';
const ctxOpts = MODE === 'mobile' ? { viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.5 };
const b = await chromium.launch();
const page = await (await b.newContext(ctxOpts)).newPage();
await page.goto(BASE + '/'); await page.getByRole('button', { name: /iniciar demo/i }).click(); await page.waitForURL('**/inicio');
await page.goto(BASE + '/inicio', { waitUntil: 'networkidle' });
const link = page.locator('nav a[href="/bitacora"]:visible').first();
const frames = []; const stamps = [0, 300, 700, 1200, 1800, 2600];
const t0 = Date.now();
await link.click({ noWaitAfter: true });
for (const s of stamps) {
  const wait = s - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
  const url = new URL(page.url()).pathname;
  frames.push({ t: Date.now() - t0, url, png: (await page.screenshot({ fullPage: false })).toString('base64') });
}
const tw = MODE === 'mobile' ? 187 : 360;
const html = `<body style="margin:0;background:#222;display:flex;gap:6px;padding:6px;width:max-content;font:11px sans-serif;color:#fff">${frames.map((f) => `<figure style="margin:0"><figcaption style="padding:2px 4px;background:#000">t=${f.t}ms · ${f.url}</figcaption><img src="data:image/png;base64,${f.png}" style="width:${tw}px;display:block"></figure>`).join('')}</body>`;
const p2 = await b.newPage({ viewport: { width: 100, height: 100 } });
await p2.setContent(html); await p2.waitForTimeout(300);
await p2.locator('body').screenshot({ path: `${ROOT}/evidence/${MODE}-filmstrip.png` });
console.log(MODE, frames.map((f) => `${f.t}ms:${f.url}`).join('  '));
await b.close();

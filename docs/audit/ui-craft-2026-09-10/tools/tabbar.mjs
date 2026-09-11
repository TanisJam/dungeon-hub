import path from 'node:path';
import os from 'node:os';
// Output root for screenshots/metrics. Override with AUDIT_OUT=/some/dir.
const OUTDIR = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'dungeon-hub-ui-audit');
import { createRequire } from 'node:module';
const require = createRequire(path.resolve(import.meta.dirname, '../../../../apps/web/package.json'));
const { chromium } = require('@playwright/test');
// Override with AUDIT_BASE to measure a Vercel preview deploy instead of production.
const BASE = process.env.AUDIT_BASE ?? 'https://dungeon-hub.vercel.app';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
await page.goto(BASE + '/'); await page.getByRole('button', { name: /iniciar demo/i }).click(); await page.waitForURL('**/inicio');
for (const r of ['/herramientas/tienda', '/personajes']) {
  await page.goto(BASE + r, { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navegación principal"]');
    const labels = [...nav.querySelectorAll('a span')].map((s) => { const r = s.getBoundingClientRect(); return { t: s.textContent, l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1), overflow: s.scrollWidth > s.clientWidth }; });
    const links = [...nav.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().height));
    return { cols: labels.length, linkH: links[0], gaps: labels.slice(1).map((x, i) => `${labels[i].t}→${x.t}: ${(x.l - labels[i].r).toFixed(1)}px`), widths: labels.map((x) => `${x.t}=${x.w}`) };
  });
  console.log(r, JSON.stringify(t));
  await page.screenshot({ path: `${OUTDIR}/shots/mobile/probe_tabbar_${t.cols}col.png`, clip: { x: 0, y: 590, width: 375, height: 77 } });
}
await b.close();

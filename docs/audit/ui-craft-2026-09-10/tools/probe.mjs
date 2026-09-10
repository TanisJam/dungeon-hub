// Targeted probes (read-only): delete-confirm modal look, long-name simulation on the
// real name nodes, tabbar label collision at 6 cols, topbar title truncation.
import path from 'node:path';
import os from 'node:os';
// Output root for screenshots/metrics. Override with AUDIT_OUT=/some/dir.
const OUTDIR = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'dungeon-hub-ui-audit');
import { createRequire } from 'node:module';
const require = createRequire(path.resolve(import.meta.dirname, '../../../../apps/web/package.json'));
const { chromium } = require('@playwright/test');
// Override with AUDIT_BASE to measure a Vercel preview deploy instead of production.
const BASE = process.env.AUDIT_BASE ?? 'https://dungeon-hub.vercel.app';
const MODE = process.argv[2] ?? 'mobile';
const OUT = `${OUTDIR}/shots/${MODE}`;
const CHAR = process.env.AUDIT_CHAR ?? '/characters/64daa269-bd30-40a3-b34e-5ec48a898caa'; // demo character; override with AUDIT_CHAR
const LONG = 'Thalindra Voss-Ravenwood de la Casa Argéntea del Norte Helado';
const ctxOpts = MODE === 'mobile'
  ? { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const browser = await chromium.launch();
const page = await (await browser.newContext(ctxOpts)).newPage();
await page.goto(BASE + '/');
await page.getByRole('button', { name: /iniciar demo/i }).click();
await page.waitForURL('**/inicio');

// 1. delete-confirm modal (cancel afterwards, never confirm)
await page.goto(BASE + CHAR, { waitUntil: 'networkidle' });
const del = page.getByRole('button', { name: /eliminar personaje/i }).first();
await del.scrollIntoViewIfNeeded();
await del.click();
await page.waitForTimeout(400);
const modal = await page.evaluate(() => {
  // Measure the real dialog panel, not "whatever box happens to be white". The original
  // white-hunting selector could not tell a fixed modal from a missing one once the fix
  // landed: both returned null.
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return { found: false };
  const panel = [...dialog.querySelectorAll('div')].find((d) => {
    const bg = getComputedStyle(d).backgroundColor;
    return bg !== 'rgba(0, 0, 0, 0)' && d.getBoundingClientRect().width > 200 && !d.hasAttribute('aria-hidden');
  }) ?? dialog;
  const h = panel.querySelector('h2,h3');
  return {
    found: true,
    bg: getComputedStyle(panel).backgroundColor,
    isWhite: getComputedStyle(panel).backgroundColor === 'rgb(255, 255, 255)',
    titleColor: h ? getComputedStyle(h).color : null,
    text: panel.textContent.trim().slice(0, 120),
  };
});
console.log('delete modal:', modal);
await page.screenshot({ path: `${OUT}/probe_delete_modal.png` });
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /cancelar/i }).first().click({ timeout: 3000 }).catch(() => {});

// 2. long-name sim on the real nodes
await page.goto(BASE + '/personajes', { waitUntil: 'networkidle' });
await page.evaluate((L) => {
  const card = document.querySelector('a[href^="/characters/"]');
  const nameEl = [...card.querySelectorAll('*')].find((e) => e.textContent.trim() === 'Kael el Centinela' && e.children.length === 0);
  if (nameEl) nameEl.textContent = L;
}, LONG);
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/probe_longname_list.png` });
await page.goto(BASE + CHAR, { waitUntil: 'networkidle' });
const heroInfo = await page.evaluate((L) => {
  const hs = [...document.querySelectorAll('h1')];
  for (const h of hs) h.textContent = L;
  return hs.map((h) => ({ fs: getComputedStyle(h).fontSize, truncated: h.scrollWidth > h.clientWidth, lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) }));
}, LONG);
console.log('hero h1s after long name:', heroInfo);
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/probe_longname_sheet.png` });

// 3. tabbar label gaps (6-col GM view) + topbar title truncation on /herramientas
await page.goto(BASE + '/herramientas/tienda', { waitUntil: 'networkidle' });
const tab = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Navegación principal"]');
  if (!nav || nav.offsetParent === null) return 'tabbar hidden (desktop)';
  const labels = [...nav.querySelectorAll('a span')].map((s) => { const r = s.getBoundingClientRect(); return { t: s.textContent, l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), fs: getComputedStyle(s).fontSize, overflow: s.scrollWidth > s.clientWidth }; });
  const gaps = labels.slice(1).map((b, i) => ({ pair: `${labels[i].t}→${b.t}`, gap: b.l - labels[i].r }));
  const h1 = document.querySelector('header h1, h1');
  return { cols: labels.length, labels, gaps, topbarTitle: { text: h1?.textContent, truncated: h1 ? h1.scrollWidth > h1.clientWidth : null, w: h1?.clientWidth } };
});
console.log('tabbar:', JSON.stringify(tab));
await page.screenshot({ path: `${OUT}/probe_tabbar6.png`, clip: MODE === 'mobile' ? { x: 0, y: 590, width: 375, height: 77 } : undefined });

// 4. topbar truncation across pages (mobile) — how many titles are cut
const cut = [];
for (const r of ['/inicio', '/bitacora', '/herramientas/npcs', '/encuentros', '/mapa', '/campanas', CHAR]) {
  await page.goto(BASE + r, { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => { const h = document.querySelector('h1'); const pill = [...document.querySelectorAll('button')].find((b) => /mundo activo/i.test(b.getAttribute('aria-label') || b.textContent)); const pt = pill?.querySelector('span'); return { title: h?.textContent, titleCut: h ? h.scrollWidth > h.clientWidth : null, pillCut: pt ? pt.scrollWidth > pt.clientWidth : null, pillH: pill ? Math.round(pill.getBoundingClientRect().height) : null }; });
  cut.push({ r, ...t });
}
console.log('topbar truncation:', JSON.stringify(cut));
await browser.close();

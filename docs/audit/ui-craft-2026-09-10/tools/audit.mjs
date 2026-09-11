// Read-only craft audit runner: logs in as the public demo account, visits
// routes, captures full-page screenshots and per-page metrics. No mutations.
import path from 'node:path';
import os from 'node:os';
// Output root for screenshots/metrics. Override with AUDIT_OUT=/some/dir.
const OUTDIR = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'dungeon-hub-ui-audit');
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(path.resolve(import.meta.dirname, '../../../../apps/web/package.json'));
const { chromium } = require('@playwright/test');

// Override with AUDIT_BASE to measure a Vercel preview deploy instead of production.
const BASE = process.env.AUDIT_BASE ?? 'https://dungeon-hub.vercel.app';
const MODE = process.argv[2] ?? 'mobile';
const OUT = `${OUTDIR}/shots/${MODE}`;
mkdirSync(OUT, { recursive: true });

const STATIC_ROUTES = [
  '/inicio', '/dashboard', '/personajes', '/campanas', '/bitacora', '/bitacora/eventos',
  '/bitacora/notas', '/compendium', '/encuentros', '/herramientas', '/herramientas/npcs',
  '/herramientas/quests', '/herramientas/facciones', '/herramientas/tienda',
  '/herramientas/contenido', '/mapa', '/mercado', '/mesa', '/tablero', '/settings',
  '/characters/new', '/characters/import', '/campanas/new', '/does-not-exist-404',
];

const INIT = () => {
  window.__cls = 0;
  window.__shifts = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime) }); }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
};

const METRICS = () => {
  const vw = window.innerWidth;
  const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  // text size histogram over leaf text elements
  const sizes = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; const seen = new Set();
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el) || !isVisible(el)) continue; seen.add(el);
    const fs = Math.round(parseFloat(getComputedStyle(el).fontSize));
    sizes[fs] = (sizes[fs] ?? 0) + 1;
  }
  // tap targets
  const targets = [...document.querySelectorAll('a,button,[role=button],input,select,textarea,[role=tab]')].filter(isVisible);
  const small = targets.map((el) => { const r = el.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), tag: el.tagName }; }).filter((t) => t.h < 44 || t.w < 44);
  // fonts in use
  const fams = {};
  for (const el of seen) { const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, ''); fams[f] = (fams[f] ?? 0) + 1; }
  // radii, shadows in use
  const radii = {}; const shadows = {};
  for (const el of document.querySelectorAll('*')) {
    if (!isVisible(el)) continue; const s = getComputedStyle(el);
    if (s.borderRadius !== '0px' && s.borderRadius) radii[s.borderRadius] = (radii[s.borderRadius] ?? 0) + 1;
    if (s.boxShadow !== 'none') shadows[s.boxShadow.slice(0, 60)] = (shadows[s.boxShadow.slice(0, 60)] ?? 0) + 1;
  }
  const h1 = [...document.querySelectorAll('h1')].map((e) => ({ t: e.textContent.trim().slice(0, 40), fs: getComputedStyle(e).fontSize }));
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map((e) => e.tagName + ':' + getComputedStyle(e).fontSize + ':' + e.textContent.trim().slice(0, 24));
  const emptyish = [...document.querySelectorAll('p,div,span')].filter(isVisible).map((e) => e.textContent.trim()).filter((t) => /^(No hay|Todavía no|Aún no|Sin |Nada |Vacío)/i.test(t) && t.length < 140);
  return {
    cls: +window.__cls.toFixed(4), shifts: window.__shifts.slice(0, 8), sizes, fams, radii, shadows: Object.keys(shadows).length,
    smallTargets: small.slice(0, 25), smallTargetCount: small.length, targetCount: targets.length,
    overflowX: document.documentElement.scrollWidth > vw, pageH: document.documentElement.scrollHeight, h1, headings: headings.slice(0, 20),
    emptyish: [...new Set(emptyish)].slice(0, 10), title: document.title,
    tabbar: !!document.querySelector('nav[aria-label*="rincipal" i], nav.fixed, [data-testid=tabbar]'),
  };
};

const ctxOpts = MODE === 'mobile'
  ? { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const browser = await chromium.launch();
const ctx = await browser.newContext(ctxOpts);
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const results = {};
const SKIP = process.env.SKIP_CAPTURE === '1';
if (SKIP) { try { Object.assign(results, JSON.parse((await import('node:fs')).readFileSync(`${OUT}/metrics.json`,'utf8'))); } catch {} }
const slug = (r) => r.replace(/^\//, '').replace(/[\/\[\]]+/g, '_') || 'root';

async function capture(route, name = slug(route)) {
  const t0 = Date.now();
  try {
    const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
    const ttfb = Date.now() - t0;
    await page.waitForTimeout(800);
    const m = await page.evaluate(METRICS);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/${name}.fold.png`, fullPage: false });
    results[route] = { status: resp?.status(), finalUrl: page.url().replace(BASE, ''), loadMs: ttfb, ...m };
    console.log(`ok  ${route} → ${results[route].finalUrl} ${resp?.status()} ${ttfb}ms cls=${m.cls} small=${m.smallTargetCount}/${m.targetCount} h=${m.pageH}`);
  } catch (e) {
    results[route] = { error: String(e).slice(0, 200) };
    console.log(`ERR ${route}: ${String(e).slice(0, 120)}`);
  }
}

// 1. landing (logged out) + login via demo
if (!SKIP) await capture('/', 'landing');
await page.goto(BASE + '/');
await page.getByRole('button', { name: /iniciar demo/i }).click();
await page.waitForURL('**/inicio', { timeout: 30000 });
console.log('logged in as demo');

// 2. static routes
if (!SKIP) for (const r of STATIC_ROUTES) await capture(r);

// 3. discover dynamic routes from lists
const discover = async (route, pattern) => {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  return page.evaluate((p) => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => new RegExp(p).test(h)))].slice(0, 3), pattern);
};
const chars = await discover('/personajes', '^/characters/[0-9a-f-]{36}$');
const camps = await discover('/campanas', '^/campanas/[0-9a-f-]{36}$');
const encs = await discover('/encuentros', '^/encuentros/[0-9a-f-]{36}$');
const cats = await discover('/compendium', '^/compendium/[^?]+');
results.__compendiumHrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')))].slice(0,40));
const worlds = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^\/worlds\/[0-9a-f-]{36}$/.test(h)))].slice(0, 1));
console.log({ chars, camps, encs, cats, worlds });
results.__discovered = { chars, camps, encs, cats, worlds };
if (!SKIP) {
for (const [i, c] of chars.entries()) await capture(c, `character_${i}`);
if (chars[0]) { await capture(chars[0] + '/level-up', 'character_levelup'); await capture(chars[0] + '?tab=inventario', 'character_inventario'); await capture(chars[0] + '?tab=hechizos', 'character_hechizos'); await capture(chars[0] + '?tab=notas', 'character_notas'); }
for (const [i, c] of camps.entries()) await capture(c, `campaign_${i}`);
for (const [i, c] of encs.entries()) await capture(c, `encounter_${i}`);
for (const [i, c] of cats.entries()) await capture(c, `compendium_${c.split('/').pop()}`);
for (const w of worlds) await capture(w, 'world');
}

// 4. long-name simulation (DOM-only, never persisted): character list + sheet
if (chars[0]) {
  await page.goto(BASE + '/personajes', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const LONG = 'Thalindra Voss-Ravenwood de la Casa Argéntea del Norte Helado';
    const a = document.querySelector('a[href^="/characters/"]');
    if (!a) return;
    const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT); let n; let best = null;
    while ((n = walker.nextNode())) { if (n.textContent.trim().length > 2 && (!best || n.textContent.length > best.textContent.length)) best = n; }
    if (best) best.textContent = LONG;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/sim_longname_list.png`, fullPage: false });
  await page.goto(BASE + chars[0], { waitUntil: 'networkidle' });
  await page.evaluate(() => { const h = document.querySelector('h1'); if (h) h.textContent = 'Thalindra Voss-Ravenwood de la Casa Argéntea del Norte Helado'; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/sim_longname_sheet.png`, fullPage: false });
}

// 5. navigation continuity: shell persistence + tap acknowledgement latency
const navTests = [];
await page.goto(BASE + '/inicio', { waitUntil: 'networkidle' });
const navLinks = await page.evaluate(() => [...document.querySelectorAll('nav a[href]')].filter((a) => a.offsetParent !== null && !a.hasAttribute('aria-current')).map((a) => a.getAttribute('href')).filter((h, i, arr) => h.startsWith('/') && arr.indexOf(h) === i).slice(0, 6));
for (const href of navLinks) {
  await page.goto(BASE + '/inicio', { waitUntil: 'networkidle' });
  await page.evaluate(() => { const nav = document.querySelector('nav'); if (nav) nav.__marker = 'persist'; document.body.__marker = 'persist'; });
  const link = page.locator(`nav a[href="${href}"]:visible`).first();
  const t0 = Date.now();
  await link.click({ noWaitAfter: true });
  let ackMs = null; let urlMs = null;
  for (let i = 0; i < 100; i++) {
    const st = await page.evaluate((h) => ({ url: location.pathname, ack: !!document.querySelector('[class*="wizard-loading"]') || !!document.querySelector(`nav a[href="${h}"][aria-current]`) }), href);
    if (ackMs == null && st.ack) ackMs = Date.now() - t0;
    if (urlMs == null && st.url === href) { urlMs = Date.now() - t0; break; }
    await page.waitForTimeout(25);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  const persisted = await page.evaluate(() => ({ nav: document.querySelector('nav')?.__marker === 'persist', body: document.body.__marker === 'persist' }));
  navTests.push({ href, ackMs, urlMs, shellPersisted: persisted });
  console.log('nav', href, { ackMs, urlMs, persisted });
}
results.__nav = navTests;

writeFileSync(`${OUT}/metrics.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log('done →', OUT);

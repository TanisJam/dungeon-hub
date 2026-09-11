/**
 * Tests for classifyRoute() — the pure route → chrome classifier that backs
 * AppChrome (audit F1, work unit 1). Two jobs:
 *
 *  a) Unit-test classifyRoute() branch-by-branch, including the segment-
 *     boundary edge case (`/linkage` must NOT match the `/link` prefix).
 *  b) Drift guard: enumerate every real `page.tsx` under apps/web/app from
 *     disk and assert each one has an explicit entry in
 *     ROUTE_CHROME_EXPECTATIONS below. A new page.tsx with no entry fails
 *     this test by name, so nobody can add a route without deciding its
 *     chrome.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { classifyRoute, type RouteChrome } from './route-chrome';

// ── Part a: unit tests ──────────────────────────────────────────────────────

describe('classifyRoute()', () => {
  it('root path has no chrome', () => {
    expect(classifyRoute('/')).toEqual({ shell: false, tabBar: false });
  });

  it.each(['/auth', '/auth/error', '/auth/callback'])(
    '%s is standalone (auth prefix)',
    (p) => {
      expect(classifyRoute(p)).toEqual({ shell: false, tabBar: false });
    },
  );

  it.each(['/invite', '/invite/abc123'])(
    '%s is standalone (invite prefix)',
    (p) => {
      expect(classifyRoute(p)).toEqual({ shell: false, tabBar: false });
    },
  );

  it.each(['/link', '/link/abc123'])(
    '%s is standalone (link prefix)',
    (p) => {
      expect(classifyRoute(p)).toEqual({ shell: false, tabBar: false });
    },
  );

  it.each(['/dev', '/dev/catalog/components'])(
    '%s is standalone (dev prefix)',
    (p) => {
      expect(classifyRoute(p)).toEqual({ shell: false, tabBar: false });
    },
  );

  it('/linkage does NOT match the /link prefix (segment boundary)', () => {
    expect(classifyRoute('/linkage')).toEqual({ shell: true, tabBar: true });
  });

  it('/authority does NOT match the /auth prefix (segment boundary)', () => {
    expect(classifyRoute('/authority')).toEqual({ shell: true, tabBar: true });
  });

  it('/invitational does NOT match the /invite prefix (segment boundary)', () => {
    expect(classifyRoute('/invitational')).toEqual({ shell: true, tabBar: true });
  });

  it('/devtools does NOT match the /dev prefix (segment boundary)', () => {
    expect(classifyRoute('/devtools')).toEqual({ shell: true, tabBar: true });
  });

  it('wizard index hides the tabbar but keeps the shell', () => {
    expect(classifyRoute('/characters/abc/wizard')).toEqual({ shell: true, tabBar: false });
  });

  it('wizard nested step hides the tabbar', () => {
    expect(classifyRoute('/characters/abc/wizard/spells')).toEqual({ shell: true, tabBar: false });
  });

  it('level-up hides the tabbar', () => {
    expect(classifyRoute('/characters/abc/level-up')).toEqual({ shell: true, tabBar: false });
  });

  it('level-up nested path also hides the tabbar', () => {
    expect(classifyRoute('/characters/abc/level-up/confirm')).toEqual({ shell: true, tabBar: false });
  });

  it('character sheet root (neither wizard nor level-up) keeps full chrome', () => {
    expect(classifyRoute('/characters/abc')).toEqual({ shell: true, tabBar: true });
  });

  it('an ordinary authenticated route gets full chrome', () => {
    expect(classifyRoute('/inicio')).toEqual({ shell: true, tabBar: true });
  });

  it('/dashboard (redirect-only route) still gets full chrome classification', () => {
    expect(classifyRoute('/dashboard')).toEqual({ shell: true, tabBar: true });
  });
});

// ── Part b: drift guard ─────────────────────────────────────────────────────

const APP_DIR = join(import.meta.dirname, '..', 'app');

/**
 * Enumerate every `page.tsx` under apps/web/app and convert its containing
 * directory to the URL pattern it serves: strip the app-dir prefix, drop
 * route groups `(...)`, and keep `[param]` segments literally — they contain
 * no `/`, so classifyRoute's dynamic-segment regexes (`[^/]+`) match a
 * literal `[id]` exactly the way they'd match a real id at runtime.
 */
function discoverPageRoutes(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      discoverPageRoutes(full, found);
      continue;
    }
    if (entry !== 'page.tsx') continue;

    const rel = relative(APP_DIR, dirname(full));
    const segments = rel === '' ? [] : rel.split('/').filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')));
    found.push(segments.length === 0 ? '/' : `/${segments.join('/')}`);
  }
  return found;
}

/**
 * Explicit chrome expectations — one entry per real `page.tsx` on disk.
 * Deliberately hand-maintained, not derived from classifyRoute: this table
 * IS the declared intent a new route must state. When disk and table
 * disagree, the guard test below fails and names the offending route.
 */
const ROUTE_CHROME_EXPECTATIONS: Readonly<Record<string, RouteChrome>> = {
  // Standalone — no app chrome at all.
  '/': { shell: false, tabBar: false },
  '/auth/error': { shell: false, tabBar: false },
  '/invite/[token]': { shell: false, tabBar: false },
  '/link/[token]': { shell: false, tabBar: false },
  '/dev': { shell: false, tabBar: false },
  '/dev/catalog/components': { shell: false, tabBar: false },
  '/dev/catalog/diagnostics': { shell: false, tabBar: false },
  '/dev/catalog/screens': { shell: false, tabBar: false },
  '/dev/catalog/tokens': { shell: false, tabBar: false },
  '/dev/compendium-preview': { shell: false, tabBar: false },
  '/dev/engine-preview': { shell: false, tabBar: false },
  '/dev/token': { shell: false, tabBar: false },

  // Shell, no TabBar — wizard + level-up full-bleed flows.
  '/characters/[id]/wizard': { shell: true, tabBar: false },
  '/characters/[id]/wizard/background': { shell: true, tabBar: false },
  '/characters/[id]/wizard/class': { shell: true, tabBar: false },
  '/characters/[id]/wizard/equipment': { shell: true, tabBar: false },
  '/characters/[id]/wizard/race': { shell: true, tabBar: false },
  '/characters/[id]/wizard/review': { shell: true, tabBar: false },
  '/characters/[id]/wizard/spells': { shell: true, tabBar: false },
  '/characters/[id]/wizard/stats': { shell: true, tabBar: false },
  '/characters/[id]/level-up': { shell: true, tabBar: false },

  // Full chrome — everything else, authenticated.
  '/bitacora': { shell: true, tabBar: true },
  '/bitacora/eventos': { shell: true, tabBar: true },
  '/bitacora/notas': { shell: true, tabBar: true },
  '/campanas': { shell: true, tabBar: true },
  '/campanas/[id]': { shell: true, tabBar: true },
  '/campanas/[id]/sessions/[sid]': { shell: true, tabBar: true },
  '/campanas/new': { shell: true, tabBar: true },
  '/characters/[id]': { shell: true, tabBar: true },
  '/characters/import': { shell: true, tabBar: true },
  '/characters/new': { shell: true, tabBar: true },
  '/compendium': { shell: true, tabBar: true },
  '/compendium/[category]': { shell: true, tabBar: true },
  '/dashboard': { shell: true, tabBar: true },
  '/encuentros': { shell: true, tabBar: true },
  '/encuentros/[id]': { shell: true, tabBar: true },
  '/herramientas': { shell: true, tabBar: true },
  '/herramientas/contenido': { shell: true, tabBar: true },
  '/herramientas/facciones': { shell: true, tabBar: true },
  '/herramientas/npcs': { shell: true, tabBar: true },
  '/herramientas/quests': { shell: true, tabBar: true },
  '/herramientas/tienda': { shell: true, tabBar: true },
  '/inicio': { shell: true, tabBar: true },
  '/mapa': { shell: true, tabBar: true },
  '/mercado': { shell: true, tabBar: true },
  '/mesa': { shell: true, tabBar: true },
  '/personajes': { shell: true, tabBar: true },
  '/settings': { shell: true, tabBar: true },
  '/tablero': { shell: true, tabBar: true },
  '/worlds/[id]': { shell: true, tabBar: true },
};

describe('classifyRoute() drift guard — every page.tsx must declare its chrome', () => {
  const discovered = discoverPageRoutes(APP_DIR).sort();
  const declared = Object.keys(ROUTE_CHROME_EXPECTATIONS).sort();

  it('has an explicit ROUTE_CHROME_EXPECTATIONS entry for every real route', () => {
    const missing = discovered.filter((route) => !(route in ROUTE_CHROME_EXPECTATIONS));

    if (missing.length > 0) {
      throw new Error(
        `${missing.length} route(s) under apps/web/app have a page.tsx but no chrome ` +
          `expectation declared in apps/web/lib/route-chrome.test.ts:\n` +
          missing.map((r) => `  - ${r}`).join('\n') +
          `\n\nFix: add an entry to ROUTE_CHROME_EXPECTATIONS for each route above, ` +
          `declaring the { shell, tabBar } it should get, then make sure ` +
          `classifyRoute() in route-chrome.ts actually returns that.`,
      );
    }

    expect(missing).toEqual([]);
  });

  it('has no stale ROUTE_CHROME_EXPECTATIONS entry for a route that no longer exists', () => {
    const stale = declared.filter((route) => !discovered.includes(route));

    if (stale.length > 0) {
      throw new Error(
        `${stale.length} route(s) declared in ROUTE_CHROME_EXPECTATIONS no longer have ` +
          `a page.tsx under apps/web/app:\n` +
          stale.map((r) => `  - ${r}`).join('\n') +
          `\n\nFix: remove the stale entry from apps/web/lib/route-chrome.test.ts.`,
      );
    }

    expect(stale).toEqual([]);
  });

  it('classifyRoute(pathname) matches the declared expectation for every route', () => {
    for (const [route, expected] of Object.entries(ROUTE_CHROME_EXPECTATIONS)) {
      expect(classifyRoute(route), `classifyRoute(${route})`).toEqual(expected);
    }
  });
});

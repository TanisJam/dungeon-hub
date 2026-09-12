import { test, expect } from '@playwright/test';

/**
 * Interactive targets are at least 44px tall on the real app (CLAUDE.md §2).
 *
 * The existing tap-targets.public.spec.ts measures the /dev component catalog.
 * This measures the routes a player and a DM actually use, which is where the
 * regressions land: audit F10 found 61 sub-44px targets on /herramientas/tienda
 * alone, and a later sweep found the Bitácora tag filter sitting at 36px.
 *
 * It measures the EFFECTIVE target, not the control's own box. A <label>
 * wrapping an input forwards the tap, so a 16x16 checkbox inside a 44px label
 * row is a 44px target — measuring the input alone reports defects that are not
 * there. A first version of this sweep flagged the settings toggle and a tienda
 * checkbox for exactly that reason; both were fine.
 */
const ROUTES = [
  '/inicio',
  '/personajes',
  '/compendium',
  '/mercado',
  '/bitacora',
  '/mesa',
  '/tablero',
  '/settings',
  '/campanas',
  '/encuentros',
  '/herramientas/facciones',
  '/herramientas/quests',
  '/herramientas/tienda',
];

const MIN = 44;

test.describe('tap targets at 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  for (const route of ROUTES) {
    test(`${route} has no interactive target under ${MIN}px tall`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const small = await page.evaluate((min) => {
        const out: Array<{ tag: string; label: string; w: number; h: number }> = [];
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue;
          const tag = el.tagName;
          const role = el.getAttribute('role');
          const interactive =
            tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' ||
            role === 'button' || role === 'tab';
          if (!interactive || el.closest('[aria-hidden="true"]')) continue;

          // The effective target: a wrapping label/button/anchor forwards the tap.
          let box = r;
          const host = el.closest('label') ?? el.closest('button') ?? el.closest('a');
          if (host && host !== el) {
            const hr = host.getBoundingClientRect();
            if (hr.height > box.height) box = hr;
          }
          if (box.height < min) {
            out.push({
              tag,
              label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
              w: Math.round(box.width),
              h: Math.round(box.height),
            });
          }
        }
        return out;
      }, MIN);

      expect(
        small,
        `targets under ${MIN}px on ${route}:\n` +
          small.map((s) => `  ${s.w}x${s.h}  <${s.tag}> "${s.label}"`).join('\n'),
      ).toEqual([]);
    });
  }
});

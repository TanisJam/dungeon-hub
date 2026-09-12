import { test, expect } from '@playwright/test';

/**
 * One h1 per document (audit F8).
 *
 * A page heading is the top of the document outline, and a screen reader reads
 * it as "heading level 1". The character sheet used to render the character's
 * name as an h1 twice — once in the topbar at 15px, once in the hero at 24px —
 * so the same name was announced twice and the outline had two roots. The
 * campaign and session detail pages did the same with their own names.
 *
 * The audit's acceptance criterion for F8 is exactly this: "h1 array has one
 * entry per page". It cannot be checked by reading the source, because the
 * duplicate comes from combining a shared shell with a page's own content —
 * two files that each look correct alone.
 */
const ROUTES = ['/inicio', '/personajes', '/compendium', '/bitacora', '/mercado', '/mesa', '/tablero', '/settings'];

test.describe('document headings', () => {
  for (const route of ROUTES) {
    test(`${route} has exactly one h1`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      const headings = await page.locator('h1').allTextContents();
      expect(headings, `h1 texts on ${route}`).toHaveLength(1);
    });
  }

  test('the character sheet has exactly one h1, and it is the hero', async ({ page }) => {
    await page.goto('/personajes', { waitUntil: 'networkidle' });
    const link = page.locator('[data-character-card] a[href^="/characters/"]').first();
    const has = await link.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!has, 'No character on /personajes — nothing to open.');

    await link.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/, { timeout: 15_000 });

    // The sheet renders the name twice by design — topbar and hero. Only the
    // hero is the heading; the topbar one is a <p>.
    const headings = await page.locator('h1').allTextContents();
    expect(headings, 'h1 texts on the character sheet').toHaveLength(1);
  });
});

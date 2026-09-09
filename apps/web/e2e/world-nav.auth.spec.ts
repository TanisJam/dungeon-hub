import { test, expect } from '@playwright/test';

/**
 * world-nav — world navigation E2E (REQ-NAV-01, REQ-NAV-02).
 * Biblioteca W1 renamed Codex→Biblioteca; Mercado W3 added the Mercado tab;
 * barrido-final renamed the Bitácora tab href /cronica → /bitacora.
 *
 * The navigability-audit revamp re-added a Mesa tab, but ONLY for a GM of the
 * active world (TabBar gates it on callerRole === 'gm'). The tab count is
 * therefore role-dependent: 5 for a player, 6 for a GM. These specs derive the
 * expected count from the rendered Mesa tab instead of hard-coding it, so they
 * hold for whichever role the auth user happens to have.
 *
 * Verifies:
 *   (a) Authenticated user lands on /inicio with the role-appropriate tab count.
 *   (b) Each shared tab label is visible (Inicio, Mapa, Biblioteca, Mercado, Bitácora).
 *   (c) Stub routes (Mapa) render without error.
 *   (d) Biblioteca tab navigates to /compendium.
 *   (e) The compendium tab accepts either label (see the label test).
 *   (f) Bitácora tab renders /bitacora unified feed (no redirect — bitacora-gremio W4 ADR-4).
 *
 * Mobile-first: runs at 375px viewport (iPhone SE) per project convention.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('tab count on /inicio matches the caller role (5 player / 6 GM)', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  // Base tabs: Inicio, Mapa, Biblioteca, Mercado, Bitácora. The Mesa tab is
  // added only when the caller is GM of the active world (TabBar callerRole
  // gate), so read it off the DOM rather than assuming a role here.
  const hasMesaTab = (await nav.locator('a[href="/mesa"]').count()) > 0;

  const tabLinks = nav.locator('a');
  await expect(tabLinks).toHaveCount(hasMesaTab ? 6 : 5, { timeout: 5_000 });
});

test('each tab label is visible — Inicio, Mapa, Biblioteca/Códex, Mercado, Bitácora', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  for (const label of ['Inicio', 'Mapa', 'Mercado', 'Bitácora']) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible({ timeout: 5_000 });
  }

  // The compendium tab renders 'Biblioteca' at 5 columns and its shortLabel
  // 'Códex' at 6 (GM + Mesa), where the full label overflows a ~56px column
  // (TabBar isCompact). Accepting either is a DELIBERATE narrowing of
  // REQ-NAV-01's Codex→Biblioteca rename: the short form keeps the old name
  // for GMs. Decided 2026-09-09 alongside the navigability-audit revamp.
  await expect(nav.getByText(/^(Biblioteca|Códex)$/)).toBeVisible({ timeout: 5_000 });
});

test('Mapa renders hex list content (no longer a stub — REQ-MAP-02)', async ({ page }) => {
  await page.goto('/mapa', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/mapa/, { timeout: 10_000 });
  // Page renders without error — title visible (hex list or empty state)
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

/**
 * Biblioteca tab navigates directly to /compendium (no dispatcher redirect).
 * REQ-NAV-01, ADR-1.
 */
test('Biblioteca tab navigates to /compendium and renders content', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  // 'Códex' when the GM's 6th tab (Mesa) forces TabBar into compact labels.
  const bibliotecaTab = nav.getByText(/^(Biblioteca|Códex)$/);
  await expect(bibliotecaTab).toBeVisible({ timeout: 5_000 });
  await bibliotecaTab.click();

  // Biblioteca tab points directly at /compendium (no /codex dispatcher)
  await expect(page).toHaveURL(/\/compendium/, { timeout: 10_000 });
  // Page renders without 404 — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('Bitácora tab renders /bitacora unified feed (REQ-RENAME-01, barrido-final — ADR-4)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'domcontentloaded' });
  // barrido-final REQ-RENAME-01: route moved from /cronica → /bitacora.
  // The URL stays at /bitacora (unified feed — no redirect).
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });
  // Page renders without 404 — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

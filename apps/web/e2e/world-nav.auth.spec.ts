import { test, expect } from '@playwright/test';

/**
 * world-nav — 5-tab world navigation E2E (REQ-NAV-01, REQ-NAV-02).
 * Biblioteca W1 removed Mesa + renamed Codex→Biblioteca; Mercado W3 added the
 * Mercado tab; barrido-final renamed the Bitácora tab href /cronica → /bitacora.
 *
 * Verifies:
 *   (a) Authenticated user lands on /inicio with 5 tabs rendered.
 *   (b) Each tab label is visible and non-empty (Inicio, Mapa, Biblioteca, Mercado, Bitácora).
 *   (c) Stub routes (Mapa) render without error.
 *   (d) Biblioteca tab navigates to /compendium.
 *   (e) No Mesa tab visible.
 *   (f) Bitácora tab renders /bitacora unified feed (no redirect — bitacora-gremio W4 ADR-4).
 *
 * Mobile-first: runs at 375px viewport (iPhone SE) per project convention.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('5 tabs render on /inicio (Mesa removed, Mercado added)', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  // TabBar should have exactly 5 links (Inicio, Mapa, Biblioteca, Mercado, Bitácora)
  const nav = page.locator('nav[aria-label="Navegación principal"]');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  const tabLinks = nav.locator('a');
  await expect(tabLinks).toHaveCount(5, { timeout: 5_000 });
});

test('each tab label is visible — Inicio, Mapa, Biblioteca, Mercado, Bitácora (no Mesa, no Codex)', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  const expectedLabels = ['Inicio', 'Mapa', 'Biblioteca', 'Mercado', 'Bitácora'];
  for (const label of expectedLabels) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible({ timeout: 5_000 });
  }

  // No Mesa tab (REQ-NAV-02)
  await expect(nav.getByText('Mesa', { exact: true })).not.toBeVisible({ timeout: 2_000 });
  // No Codex label (REQ-NAV-01)
  await expect(nav.getByText('Codex', { exact: true })).not.toBeVisible({ timeout: 2_000 });
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
  const bibliotecaTab = nav.getByText('Biblioteca', { exact: true });
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

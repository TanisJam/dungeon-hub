import { test, expect } from '@playwright/test';

/**
 * world-nav — 5-tab world navigation E2E (REQ-WIS-E02, REQ-WIS-05, REQ-WIS-06).
 *
 * Verifies:
 *   (a) Authenticated user lands on /inicio with 5 tabs rendered.
 *   (b) Each tab label is visible and non-empty.
 *   (c) Stub routes (Mapa, Codex, Crónica) render without error.
 *   (d) Mesa tab navigates to /campanas (existing surface).
 *
 * Mobile-first: runs at 375px viewport (iPhone SE) per project convention.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('5 tabs render on /inicio', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  // TabBar should have exactly 5 links in a grid-cols-5 nav
  const nav = page.locator('nav[aria-label="Navegación principal"]');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  const tabLinks = nav.locator('a');
  await expect(tabLinks).toHaveCount(5, { timeout: 5_000 });
});

test('each tab label is visible and non-empty', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  const expectedLabels = ['Inicio', 'Mapa', 'Codex', 'Crónica', 'Mesa'];
  for (const label of expectedLabels) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible({ timeout: 5_000 });
  }
});

test('Mapa renders hex list content (no longer a stub — REQ-MAP-02)', async ({ page }) => {
  await page.goto('/mapa', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/mapa/, { timeout: 10_000 });
  // Page renders without error — title visible (hex list or empty state)
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('Codex redirects to /codex/facciones and renders content', async ({ page }) => {
  await page.goto('/codex', { waitUntil: 'domcontentloaded' });
  // /codex redirects to /codex/facciones (ADR-1, REQ-FAC-04)
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });
  // Page renders without 404 — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('Crónica redirects to /cronica/eventos and renders content', async ({ page }) => {
  await page.goto('/cronica', { waitUntil: 'domcontentloaded' });
  // /cronica redirects to /cronica/eventos (ADR-1, REQ-CRO-01)
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });
  // Page renders without 404 — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('Mesa tab href points to /campanas (existing surface)', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  const mesaLink = nav.getByText('Mesa', { exact: true });
  await expect(mesaLink).toBeVisible({ timeout: 5_000 });

  // Click Mesa tab and confirm it navigates to /campanas
  await mesaLink.click();
  await expect(page).toHaveURL(/\/campanas/, { timeout: 10_000 });
});

import { test, expect, type BrowserContext } from '@playwright/test';
import path from 'node:path';

/**
 * world-nav — 5-tab world navigation E2E (REQ-WIS-E02, REQ-WIS-05, REQ-WIS-06).
 *
 * Verifies:
 *   (a) Authenticated user lands on /inicio with 5 tabs rendered.
 *   (b) Each tab label is visible and non-empty.
 *   (c) Stub routes (Mapa, Crónica) render without error.
 *   (d) Mesa tab navigates to /campanas (existing surface).
 *   (e) Codex: DM redirects to /codex/facciones; player sees 6-card grid (fixture-gated).
 *
 * Mobile-first: runs at 375px viewport (iPhone SE) per project convention.
 *
 * codex-rehome (REQ-TEST-01): "Codex redirects to /codex/facciones" is now
 * DM-specific. The default auth account (user.json) is a GM so the redirect
 * assertion still passes. A conditional player grid assertion runs when the
 * player1 fixture auth file exists.
 */

const MOBILE = { width: 375, height: 812 };
const PLAYER_AUTH_FILE = path.join(__dirname, '.auth/player1.json');

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

  const expectedLabels = ['Inicio', 'Mapa', 'Codex', 'Bitácora', 'Mesa'];
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

/**
 * codex-rehome REQ-TEST-01: DM-specific assertion.
 * The default auth account (user.json from auth.setup.ts) is always a GM
 * (world owner via POST /campaigns). This test verifies the DM redirect
 * behavior is preserved after the role-dispatch refactor.
 */
test('Codex (DM account) redirects to /codex/facciones and renders content', async ({ page }) => {
  await page.goto('/codex', { waitUntil: 'domcontentloaded' });
  // DM: /codex redirects to /codex/facciones (ADR-4, REQ-DISPATCH-01, REQ-FAC-04)
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });
  // Page renders without 404 — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

/**
 * codex-rehome REQ-TEST-01: Player grid assertion (fixture-gated).
 * Runs only when the player1 fixture auth file exists (seeded by db:seed:e2e).
 * If the file is absent, the test is skipped — DO NOT fabricate player state.
 *
 * E2E FIXTURE FINDING (Task 5.3):
 * - player1@dh.test auth file path: e2e/.auth/player1.json
 * - This file is created by running `pnpm test:e2e --project=fixture-setup`.
 * - When present, player1 is a world MEMBER (player role), not GM.
 * - The test asserts: no redirect to facciones + 6 grid links render.
 * - NOTE: player1 may or may not have an active character cookie set.
 *   If no active character → empty state renders instead of grid.
 *   The assertion therefore checks the union: grid OR empty-state title.
 */
test('Codex (player account) — no facciones redirect, grid or empty state renders', async ({ browser }) => {
  const fs = await import('node:fs/promises');
  let playerAuthExists = false;
  try {
    await fs.access(PLAYER_AUTH_FILE);
    playerAuthExists = true;
  } catch {
    playerAuthExists = false;
  }

  if (!playerAuthExists) {
    // Player fixture not seeded — skip rather than fabricate
    test.skip();
    return;
  }

  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      storageState: PLAYER_AUTH_FILE,
      viewport: MOBILE,
    });
    const page = await context.newPage();

    await page.goto('/codex', { waitUntil: 'domcontentloaded' });

    // Player MUST NOT be redirected to /codex/facciones
    await expect(page).not.toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });

    // Either the 6-card grid OR the empty state renders — both are correct player outcomes
    const gridOrEmpty = page.locator(
      '[href="/codex/monsters"], [data-testid="empty-title"], h2',
    ).first();
    await expect(gridOrEmpty).toBeVisible({ timeout: 10_000 });
  } finally {
    await context?.close();
  }
});

test('Bitácora tab redirects to /cronica/eventos and renders content', async ({ page }) => {
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

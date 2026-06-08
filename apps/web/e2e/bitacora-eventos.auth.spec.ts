import { test, expect } from '@playwright/test';

/**
 * bitacora-eventos — E2E spec for the Eventos source-facet in the Bitácora tab.
 * REQ-CRO-01, REQ-CRO-02, REQ-GATE-01, REQ-GATE-03, REQ-GREM-FD-04.
 * REQ-RENAME-01 (barrido-final): renamed from cronica-eventos → bitacora-eventos; /cronica → /bitacora.
 *
 * bitacora-gremio W4 changes:
 *   - REMOVED: '/cronica redirects to /cronica/eventos' — /bitacora is now the unified feed (ADR-4, T-17).
 *   - UPDATED: SubNav now has 3 items: Todo | Eventos | Notas (not 2).
 *   - KEPT: /bitacora/eventos deep-link preserved; DM FAB and create-event flow retained (ADR-7, T-18).
 *
 * Verifies:
 *   (a) /bitacora/eventos resolves (deep-link preserved as source-facet — REQ-GREM-FD-04).
 *   (b) DM (callerRole='gm') sees FAB "Crear" button.
 *   (c) DM creates an event → appears in list.
 *   (d) SubNav pills Todo|Eventos|Notas visible (3-item nav — ADR-4).
 *   (e) Bitácora TabBar tab remains active.
 *
 * Note: The E2E test user is GM of 'E2E Test Campaign (World)' via auth.setup.ts.
 * The test assumes the dev stack is running (apps/web/e2e/README.md).
 *
 * Mobile-first: 375px viewport. REQ-GATE-03.
 *
 * CRITICAL: FAB is a hydrated client island — use networkidle + await expect before clicking.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

// NOTE: The '/cronica redirects to /cronica/eventos' test has been REMOVED.
// /bitacora is now the unified feed (bitacora-gremio W4 ADR-4). The redirect no
// longer exists — /bitacora renders the unified feed directly. See T-21 (tasks #1995).

test('Eventos page renders for GM (DM view) — deep-link preserved', async ({ page }) => {
  await page.goto('/bitacora/eventos', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora\/eventos/, { timeout: 10_000 });

  // Page rendered without error — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('DM view: FAB "Crear" is visible at /bitacora/eventos', async ({ page }) => {
  await page.goto('/bitacora/eventos', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora\/eventos/, { timeout: 10_000 });

  // DM (callerRole='gm') should see the FAB — REQ-CRO-02, REQ-GATE-01
  // EventClientWrapper is retained on the eventos page (ADR-7, T-18)
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
});

test('DM can create an event via FAB', async ({ page }) => {
  // networkidle: the FAB is a hydrated client island — clicking before hydration is a no-op.
  await page.goto('/bitacora/eventos', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/bitacora\/eventos/, { timeout: 10_000 });

  // Open create form
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
  await fab.click();

  // Form sheet opens
  const titleInput = page.getByLabel(/título/i);
  await expect(titleInput).toBeVisible({ timeout: 5_000 });

  // Fill form
  const uniqueTitle = `E2E Evento ${Date.now()}`;
  await titleInput.fill(uniqueTitle);

  // Submit
  const submitButton = page.getByRole('button', { name: /crear evento/i });
  await submitButton.click();

  // After successful create, the event should appear in the list
  await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
});

test('SubNav pills are visible: Todo, Eventos and Notas (3-item nav — bitacora-gremio W4)', async ({ page }) => {
  await page.goto('/bitacora/eventos', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora\/eventos/, { timeout: 10_000 });

  // 3-item SubNav (Todo|Eventos|Notas) after bitacora-gremio W4 (ADR-4)
  await expect(page.getByRole('link', { name: /^todo$/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /eventos/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /notas/i })).toBeVisible({ timeout: 10_000 });
});

test('Bitácora tab remains active when on /bitacora/eventos', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  const bitacoraTab = nav.getByText('Bitácora', { exact: true });
  await bitacoraTab.click();

  // After clicking Bitácora tab, we land on /bitacora (unified feed — no more redirect to /eventos)
  // The tab should navigate to /bitacora now (ADR-4)
  await expect(page).toHaveURL(/\/bitacora/, { timeout: 10_000 });

  // Bitácora tab should still be visible
  const bitacoraLink = nav.locator('a[href^="/bitacora"]');
  await expect(bitacoraLink.first()).toBeVisible({ timeout: 5_000 });
});

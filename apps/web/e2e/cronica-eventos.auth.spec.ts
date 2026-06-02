import { test, expect } from '@playwright/test';

/**
 * cronica-eventos — E2E spec for the Eventos section in the Crónica tab.
 * REQ-CRO-01, REQ-CRO-02, REQ-GATE-01, REQ-GATE-03.
 *
 * Verifies:
 *   (a) /cronica redirects to /cronica/eventos (ADR-1, REQ-CRO-01).
 *   (b) DM (callerRole='gm') sees FAB "Crear" button.
 *   (c) DM creates an event → appears in list.
 *   (d) SubNav pills Eventos|Notas visible.
 *   (e) Crónica TabBar tab remains active.
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

test('/cronica redirects to /cronica/eventos', async ({ page }) => {
  await page.goto('/cronica', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });
});

test('Eventos page renders for GM (DM view)', async ({ page }) => {
  await page.goto('/cronica/eventos', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });

  // Page rendered without error — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('DM view: FAB "Crear" is visible at /cronica/eventos', async ({ page }) => {
  await page.goto('/cronica/eventos', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });

  // DM (callerRole='gm') should see the FAB — REQ-CRO-02, REQ-GATE-01
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
});

test('DM can create an event via FAB', async ({ page }) => {
  // networkidle: the FAB is a hydrated client island — clicking before hydration is a no-op.
  await page.goto('/cronica/eventos', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });

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

test('SubNav pills are visible: Eventos and Notas', async ({ page }) => {
  await page.goto('/cronica/eventos', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });

  // Both sub-nav pills should be visible
  await expect(page.getByRole('link', { name: /eventos/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /notas/i })).toBeVisible({ timeout: 10_000 });
});

test('Crónica tab remains active when on /cronica/eventos', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  const cronicaTab = nav.getByText('Crónica', { exact: true });
  await cronicaTab.click();

  // Should redirect to /cronica/eventos
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });

  // Crónica tab should still be visible
  const cronicaLink = nav.locator('a[href^="/cronica"]');
  await expect(cronicaLink.first()).toBeVisible({ timeout: 5_000 });
});

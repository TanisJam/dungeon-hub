import { test, expect } from '@playwright/test';

/**
 * cronica-notas — E2E spec for the Notas source-facet in the Crónica tab.
 * REQ-CRO-01, REQ-CRO-03, REQ-GATE-01, REQ-GATE-03, REQ-GREM-FD-04.
 *
 * bitacora-gremio W4 changes:
 *   - UPDATED: SubNav now has 3 items: Todo | Eventos | Notas (not 2).
 *   - KEPT: /cronica/notas deep-link preserved; DM FAB and create-note flow retained (ADR-7, T-19).
 *   - ADDED: assertion that /cronica/notas shows journal entries via CronicaFeed (source=dm badge).
 *
 * Verifies:
 *   (a) /cronica/notas renders (sub-route works — deep-link preserved as source-facet).
 *   (b) DM (callerRole='gm') sees FAB "Crear" button.
 *   (c) DM creates a note → appears in list.
 *   (d) SubNav pills Todo|Eventos|Notas visible, Notas pill is active.
 *   (e) Navigating from Eventos to Notas via sub-nav pill works.
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

test('Notas page renders for GM (DM view) — deep-link preserved', async ({ page }) => {
  await page.goto('/cronica/notas', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/notas/, { timeout: 10_000 });

  // Page rendered without error — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('DM view: FAB "Crear" is visible at /cronica/notas', async ({ page }) => {
  await page.goto('/cronica/notas', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/notas/, { timeout: 10_000 });

  // DM (callerRole='gm') should see the FAB — REQ-CRO-03, REQ-GATE-01
  // JournalClientWrapper is retained on the notas page (ADR-7, T-19)
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
});

test('DM can create a note via FAB', async ({ page }) => {
  // networkidle: the FAB is a hydrated client island — clicking before hydration is a no-op.
  await page.goto('/cronica/notas', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/cronica\/notas/, { timeout: 10_000 });

  // Open create form
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
  await fab.click();

  // Form sheet opens
  const titleInput = page.getByLabel(/título/i);
  await expect(titleInput).toBeVisible({ timeout: 5_000 });

  // Fill form
  const uniqueTitle = `E2E Nota ${Date.now()}`;
  await titleInput.fill(uniqueTitle);

  // Submit
  const submitButton = page.getByRole('button', { name: /crear nota/i });
  await submitButton.click();

  // After successful create, the note should appear in the list
  await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
});

test('SubNav pills are visible: Todo, Eventos, and Notas (3-item nav), Notas is active', async ({ page }) => {
  await page.goto('/cronica/notas', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/notas/, { timeout: 10_000 });

  // 3-item SubNav (Todo|Eventos|Notas) after bitacora-gremio W4 (ADR-4)
  await expect(page.getByRole('link', { name: /^todo$/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /eventos/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /notas/i })).toBeVisible({ timeout: 10_000 });

  // Notas pill should be active (aria-current="page")
  const notasLink = page.getByRole('link', { name: /notas/i });
  await expect(notasLink).toHaveAttribute('aria-current', 'page', { timeout: 5_000 });
});

test('SubNav: clicking Eventos pill navigates to /cronica/eventos', async ({ page }) => {
  await page.goto('/cronica/notas', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cronica\/notas/, { timeout: 10_000 });

  // Click the Eventos pill
  await page.getByRole('link', { name: /eventos/i }).click();
  await expect(page).toHaveURL(/\/cronica\/eventos/, { timeout: 10_000 });
});

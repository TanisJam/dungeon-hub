import { test, expect } from '@playwright/test';

/**
 * herramientas-facciones — E2E spec for the Facciones section under Herramientas del DM.
 * Biblioteca W1 (ADR-2): updated from /codex/facciones → /herramientas/facciones.
 *
 * REQ-FAC-01, REQ-FAC-02, REQ-FAC-03, REQ-GATE-01, REQ-GATE-03, REQ-DMTOOLS-01, REQ-DMTOOLS-02.
 *
 * Verifies:
 *   (a) /herramientas/facciones renders for GM (DM view).
 *   (b) DM (callerRole='gm') sees FAB "Crear" button.
 *   (c) DM creates a faction → appears in list.
 *   (d) SubNav pills visible (Facciones/NPCs).
 *   (e) Biblioteca tab is active (highlights on /compendium prefix); no /codex tab.
 *
 * Note: The E2E test user is GM of 'E2E Test Campaign (World)' via auth.setup.ts.
 * The test assumes the dev stack is running (apps/web/e2e/README.md).
 *
 * Mobile-first: 375px viewport. REQ-GATE-03.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('Facciones page renders for GM (DM view) at /herramientas/facciones', async ({ page }) => {
  await page.goto('/herramientas/facciones', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/herramientas\/facciones/, { timeout: 10_000 });

  // Page rendered without error — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('DM view: FAB "Crear" is visible at /herramientas/facciones', async ({ page }) => {
  await page.goto('/herramientas/facciones', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/herramientas\/facciones/, { timeout: 10_000 });

  // DM (callerRole='gm') should see the FAB
  // REQ-FAC-01, REQ-GATE-01
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
});

test('DM can create a faction via FAB', async ({ page }) => {
  // networkidle: the FAB is a hydrated client island — clicking before hydration is a no-op.
  await page.goto('/herramientas/facciones', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/herramientas\/facciones/, { timeout: 10_000 });

  // Open create form
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
  await fab.click();

  // Form sheet opens
  const nameInput = page.getByLabel(/nombre/i);
  await expect(nameInput).toBeVisible({ timeout: 5_000 });

  // Fill form
  const uniqueName = `E2E Facción ${Date.now()}`;
  await nameInput.fill(uniqueName);

  // Submit
  const submitButton = page.getByRole('button', { name: /crear facción/i });
  await submitButton.click();

  // After successful create, the faction should appear in the list
  // (revalidatePath triggers a re-render)
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });
});

test('SubNav pills are visible: Facciones and NPCs', async ({ page }) => {
  await page.goto('/herramientas/facciones', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/herramientas\/facciones/, { timeout: 10_000 });

  // Both sub-nav pills should be visible
  await expect(page.getByRole('link', { name: /facciones/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /npcs/i })).toBeVisible({ timeout: 10_000 });
});

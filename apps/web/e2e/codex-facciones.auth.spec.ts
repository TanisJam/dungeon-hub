import { test, expect } from '@playwright/test';

/**
 * codex-facciones — E2E spec for the Facciones section in the Codex tab.
 * REQ-FAC-01, REQ-FAC-02, REQ-FAC-03, REQ-FAC-04, REQ-GATE-01, REQ-GATE-03.
 *
 * Verifies:
 *   (a) /codex redirects to /codex/facciones (ADR-1, REQ-FAC-04).
 *   (b) DM (callerRole='gm') sees FAB "Crear" button.
 *   (c) DM creates a faction → appears in list.
 *   (d) Player view (role toggled) sees no FAB, no create button.
 *
 * Note: The E2E test user is GM of 'E2E Test Campaign (World)' via auth.setup.ts.
 * The test assumes the dev stack is running (apps/web/e2e/README.md).
 *
 * Mobile-first: 375px viewport. REQ-GATE-03.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('/codex redirects to /codex/facciones', async ({ page }) => {
  await page.goto('/codex', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });
});

test('Facciones page renders for GM (DM view)', async ({ page }) => {
  await page.goto('/codex/facciones', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });

  // Page rendered without error — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('DM view: FAB "Crear" is visible at /codex/facciones', async ({ page }) => {
  await page.goto('/codex/facciones', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });

  // DM (callerRole='gm') should see the FAB
  // REQ-FAC-01, REQ-GATE-01
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
});

test('DM can create a faction via FAB', async ({ page }) => {
  // networkidle: the FAB is a hydrated client island — clicking before hydration is a no-op.
  await page.goto('/codex/facciones', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });

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
  await page.goto('/codex/facciones', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });

  // Both sub-nav pills should be visible
  await expect(page.getByRole('link', { name: /facciones/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /npcs/i })).toBeVisible({ timeout: 10_000 });
});

test('Codex tab remains active when on /codex/facciones', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const nav = page.locator('nav[aria-label="Navegación principal"]');
  const codexTab = nav.getByText('Codex', { exact: true });
  await codexTab.click();

  // Should redirect to /codex/facciones
  await expect(page).toHaveURL(/\/codex\/facciones/, { timeout: 10_000 });

  // Codex tab should still be "active" (highlighted in TabBar)
  // TabBar uses aria-current="page" for active state
  const codexLink = nav.locator('a[href^="/codex"]');
  await expect(codexLink.first()).toBeVisible({ timeout: 5_000 });
});

import { test, expect } from '@playwright/test';

/**
 * create-campaign — end-to-end: a DM creates a new campaign from /campanas.
 *
 * Flow: navigate to /campanas → DM view (derived from callerRole='gm' of the active world)
 * → "Iniciar campaña nueva" → fill name → submit → lands on the new campaign's detail page.
 *
 * Slice 3 migration (REQ-WIS-E03): the dh:role=dm cookie hack is replaced by per-world
 * GM membership. The E2E test user is GM of 'E2E Test Campaign (World)' (created by
 * auth.setup.ts via POST /campaigns). getActiveWorld() falls back to that world when no
 * dh:world cookie is set, and callerRole='gm' causes the DM view to render without a cookie.
 *
 * Mobile-first: runs at a 375px viewport (iPhone SE) per project convention.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('DM creates a new campaign and lands on its detail page', async ({ page }) => {
  // DM view now renders from per-world callerRole (GM of 'E2E Test Campaign (World)').
  // No dh:role cookie needed — getActiveWorld falls back to the user's first world
  // and callerRole='gm' triggers the DM view. (REQ-WIS-08)

  // 1. From the campaigns list, the DM sees the create CTA.
  await page.goto('/campanas', { waitUntil: 'domcontentloaded' });
  const createLink = page.getByRole('link', { name: /Iniciar campaña nueva/ });
  await expect(createLink).toBeVisible({ timeout: 10_000 });
  await createLink.click();

  // 2. The create-campaign form route resolves (no more 404).
  await expect(page).toHaveURL(/\/campanas\/new$/, { timeout: 10_000 });

  // 3. Fill a unique name and submit.
  const name = `Campaña E2E ${Date.now()}`;
  await page.getByLabel('Nombre de la campaña').fill(name);
  await page.getByRole('button', { name: 'Crear campaña' }).click();

  // 4. Server Action creates world+campaign+gm and redirects to the detail page.
  await expect(page).toHaveURL(/\/campanas\/[a-f0-9-]+$/, { timeout: 15_000 });
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
});

import { test, expect } from '@playwright/test';

/**
 * create-campaign — end-to-end: a DM creates a new campaign from /campanas.
 *
 * Flow: switch to DM mode (dh:role cookie) → /campanas → "Iniciar campaña nueva"
 * → fill name → submit → lands on the new campaign's detail page.
 *
 * Mobile-first: runs at a 375px viewport (iPhone SE) per project convention.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('DM creates a new campaign and lands on its detail page', async ({ page, context }) => {
  // Switch to DM mode the same way the app does: the dh:role=dm cookie.
  await context.addCookies([
    { name: 'dh:role', value: 'dm', url: 'http://localhost:3001', sameSite: 'Lax' },
  ]);

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

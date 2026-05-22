import { test, expect } from '@playwright/test';

test.describe('dashboard (authenticated)', () => {
  test('loads with identity header and characters/campaigns sections', async ({ page }) => {
    await page.goto('/dashboard');

    // Identity header con role badge (lowercase content; CSS uppercases visually)
    await expect(page.getByText('player', { exact: true })).toBeVisible();

    // Las dos secciones
    await expect(page.getByRole('heading', { name: 'Your Characters', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your Campaigns', level: 2 })).toBeVisible();

    // Hay al menos un link a /characters/new (header siempre + empty-state si no hay chars)
    await expect(
      page.locator('a[href="/characters/new"]').first(),
    ).toBeVisible();
  });

  test('home redirects to dashboard when authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

import { test, expect } from '@playwright/test';

test.describe('dashboard (authenticated)', () => {
  test('loads with identity header and characters/campaigns sections', async ({ page }) => {
    await page.goto('/dashboard');

    // Identity header con role badge (ES label)
    await expect(page.getByText('Jugador', { exact: true })).toBeVisible();

    // Las dos secciones (SectionHead usa <span>, buscamos por texto)
    await expect(page.getByText('Tus Personajes')).toBeVisible();
    await expect(page.getByText('Tus Campañas')).toBeVisible();

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

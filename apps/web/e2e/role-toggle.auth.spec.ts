import { test, expect } from '@playwright/test';

test('role toggle works with a NORMAL click + player view reaches character', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await page.goto('/inicio', { waitUntil: 'networkidle' });
  await expect(page.getByText('TU GREMIO — DM')).toBeVisible({ timeout: 10_000 });

  // NORMAL click (no force) — proves a real user can toggle
  await page.getByRole('button', { name: 'Jugador' }).click();
  await expect(page.getByText('TU GREMIO — DM')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('Atajos')).toBeVisible();
  await expect(page.locator('a[href^="/personajes"], a[href^="/characters/"]').first()).toBeVisible();

  // Toggle back to DM
  await page.getByRole('button', { name: 'DM', exact: true }).click();
  await expect(page.getByText('TU GREMIO — DM')).toBeVisible({ timeout: 10_000 });
});

import { test, expect } from '@playwright/test';

test.describe('home (unauthenticated)', () => {
  test('shows Sign in with Discord when logged out', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dungeon Hub' })).toBeVisible();
    await expect(page.getByRole('button', { name: /iniciar sesión con discord/i })).toBeVisible();
  });
});

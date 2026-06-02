import { test, expect } from '@playwright/test';

/**
 * Per-world role toggle — the switcher is a single compact button (DM ⇄ PJ) that
 * toggles the GM's view. A GM defaults to DM view; tapping switches to player and back.
 * Regression guards: (1) the server reads the dh:role view-preference, (2) the switcher
 * click actually lands (the decorative swap glyph is pointer-events-none).
 */
test('role toggle (single button) switches view + player view reaches character', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await page.goto('/inicio', { waitUntil: 'networkidle' });

  // GM defaults to DM view
  await expect(page.locator('[data-value]')).toHaveAttribute('data-value', 'dm');
  await expect(page.getByText('TU GREMIO — DM')).toBeVisible({ timeout: 10_000 });

  // Tap the switcher → player view
  await page.locator('[data-value]').click();
  await expect(page.getByText('TU GREMIO — DM')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('Atajos')).toBeVisible();
  await expect(page.locator('a[href^="/personajes"], a[href^="/characters/"]').first()).toBeVisible();

  // Tap again → back to DM view
  await page.locator('[data-value]').click();
  await expect(page.getByText('TU GREMIO — DM')).toBeVisible({ timeout: 10_000 });
});

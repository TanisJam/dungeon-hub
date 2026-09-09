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

  // RoleSwitcher is a single ToggleChip button; `data-value` was dropped when the
  // ToggleChip atom was extracted (commit b79b794) in favor of aria-pressed. The
  // button's title stays stable across DM/PJ state — use it to find the switcher.
  const roleSwitcher = page.getByTitle('Cambiar vista DM / Jugador');

  // GM defaults to DM view.
  //
  // The marker is AppShell's subtitle, which /inicio renders as "TU GREMIO — DM" on
  // the DM branch and "TU GREMIO" on the player one — so its presence is exactly the
  // server-side branch this spec exists to guard. Assert presence, not visibility:
  // the subtitle carries `hidden sm:block`, so at this 390px viewport it is in the
  // DOM and deliberately not painted. The negative assertion below already counts
  // rather than looks; this makes the pair symmetric.
  const dmSubtitle = page.getByText('TU GREMIO — DM');
  await expect(roleSwitcher).toHaveAttribute('aria-pressed', 'true');
  await expect(dmSubtitle).toHaveCount(1, { timeout: 10_000 });

  // Tap the switcher → player view
  await roleSwitcher.click();
  await expect(dmSubtitle).toHaveCount(0, { timeout: 10_000 });
  await expect(roleSwitcher).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Atajos')).toBeVisible();
  await expect(page.locator('a[href^="/personajes"], a[href^="/characters/"]').first()).toBeVisible();

  // Tap again → back to DM view
  await roleSwitcher.click();
  await expect(dmSubtitle).toHaveCount(1, { timeout: 10_000 });
  await expect(roleSwitcher).toHaveAttribute('aria-pressed', 'true');
});

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
  // The marker is `data-home-view` on /inicio's branch wrapper, which names which
  // branch the SERVER resolved — exactly what this spec exists to guard.
  //
  // It used to read the "TU GREMIO — DM" subtitle instead. Audit finding F5 then
  // moved the world switcher under the title, and TopBar renders the world OR the
  // subtitle, never both — so on /inicio, which passes both, the subtitle stopped
  // rendering entirely and this spec lost its probe without anyone noticing,
  // because the e2e suite does not run in CI. Assert on a deliberate observable,
  // not on visible copy that a craft PR is free to move.
  //
  // Count rather than visibility: the wrapper is in the DOM either way and the
  // negative assertions below need the same shape.
  const dmView = page.locator('[data-home-view="dm"]');
  await expect(roleSwitcher).toHaveAttribute('aria-pressed', 'true');
  await expect(dmView).toHaveCount(1, { timeout: 10_000 });

  // Tap the switcher → player view
  await roleSwitcher.click();
  await expect(dmView).toHaveCount(0, { timeout: 10_000 });
  await expect(roleSwitcher).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Atajos')).toBeVisible();
  // Filtered to visible: DesktopSidebar renders its own /personajes link, and at
  // this 390px viewport it is in the DOM but hidden. Unfiltered, .first() picks
  // that one and the assertion fails on an element the design never meant to show
  // here. The point of the check is that the player view reaches a character from
  // a phone, so the link has to be one a thumb could actually reach.
  await expect(
    page.locator('a[href^="/personajes"], a[href^="/characters/"]').filter({ visible: true }).first(),
    'player view must expose a reachable character link at 390px',
  ).toBeVisible();

  // Tap again → back to DM view
  await roleSwitcher.click();
  await expect(dmView).toHaveCount(1, { timeout: 10_000 });
  await expect(roleSwitcher).toHaveAttribute('aria-pressed', 'true');
});

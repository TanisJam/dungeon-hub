import { test, expect } from '@playwright/test';

/**
 * world-switcher — E2E spec for the WorldSwitcher bottom-sheet (REQ-WIS-E01).
 *
 * Verifies:
 *   (a) Authenticated user can open the WorldSwitcher sheet by tapping the
 *       world-name trigger in TopBar.
 *   (b) At least one world row is visible in the sheet.
 *   (c) Per-world role: the E2E test user is GM of 'E2E Test Campaign (World)',
 *       so /inicio renders the DM view (DM role pill visible, not player).
 *
 * The E2E test user is guaranteed to be GM of 'E2E Test Campaign (World)'
 * because auth.setup.ts creates it via POST /campaigns (which inserts the
 * caller as a worldMember gm). REQ-WIS-08 — DM view shows from callerRole,
 * not from a dh:role cookie.
 *
 * Mobile-first: runs at 375px viewport (iPhone SE) per project convention.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('WorldSwitcher: opens sheet from TopBar trigger', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  // The WorldSwitcherTrigger button is in the TopBar left slot.
  // aria-label: "Mundo activo: {worldName}. Abrir selector de mundo."
  // Click the trigger — the V3Sheet portal renders to document.body.
  await page.getByRole('button', { name: /Abrir selector de mundo/i }).click();

  // REQ-WIS-E01: at least one world row appears (proves the sheet opened).
  // This is equivalent to verifying the sheet opened and has content.
  await expect(page.getByRole('button', { name: /E2E Test Campaign/ })).toBeVisible({ timeout: 10_000 });
});

test('WorldSwitcher: at least one world row visible in sheet', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const trigger = page.getByRole('button', { name: /Abrir selector de mundo/i });
  await trigger.click();

  // The sheet should list the E2E world (at least one row button with world name)
  // Sheet world rows are <button> elements inside the sheet body
  const worldRows = page.getByRole('button', { name: /E2E Test Campaign/ });
  await expect(worldRows.first()).toBeVisible({ timeout: 10_000 });
});

test('per-world GM role: /inicio shows DM view when callerRole is gm', async ({ page }) => {
  // REQ-WIS-08: E2E user is GM of 'E2E Test Campaign (World)'.
  // Without any dh:role cookie, getActiveWorld falls back to that world,
  // callerRole='gm' → DM view renders.
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  // DM view renders DM-specific widgets not present in the player view.
  // "Necesitan tu mirada" is the eyebrow label of the PendingFichasCardTrigger (DM only).
  // The text is lowercase in the DOM; CSS uppercases it visually — Playwright matches DOM text.
  await expect(page.getByText('Necesitan tu mirada', { exact: true })).toBeVisible({ timeout: 10_000 });

  // The single RoleSwitcher toggle reflects DM via aria-pressed (seeded from
  // callerRole='gm'). Confirms roleDefault='dm' was forwarded correctly. (REQ-WIS-09)
  // `data-value` was dropped when the ToggleChip atom was extracted (commit b79b794);
  // the button's title stays stable across DM/PJ state.
  const switcher = page.getByTitle('Cambiar vista DM / Jugador');
  await expect(switcher).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
});

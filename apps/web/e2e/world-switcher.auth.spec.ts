import { test, expect } from '@playwright/test';
import { clickUntilVisible } from './helpers/click-until';

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
  const trigger = page.getByRole('button', { name: /Abrir selector de mundo/i });

  // REQ-WIS-E01: at least one world row appears (proves the sheet opened).
  //
  // Scope the row to the dialog. The trigger's own aria-label carries the active
  // world's name, so an unscoped `name: /E2E Test Campaign/` matches the trigger
  // too — one element while the sheet is shut, two once it opens. That inverted
  // the test: it passed whenever the sheet stayed closed and raised a strict mode
  // violation whenever it opened. The dialog scope leaves only the row, so this
  // asserts what the name claims.
  const worldRow = page.getByRole('dialog').getByRole('button', { name: /E2E Test Campaign/ });

  await clickUntilVisible(trigger, worldRow, 'the world list must appear after tapping the switcher');
});

test('WorldSwitcher: at least one world row visible in sheet', async ({ page }) => {
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  const trigger = page.getByRole('button', { name: /Abrir selector de mundo/i });

  // Sheet world rows are <button> elements inside the sheet body. Scoped to the
  // dialog for the reason above; `.first()` used to hide the ambiguity here by
  // silencing strict mode, which made this pass against the trigger alone and
  // never once proved a row had rendered.
  const worldRow = page.getByRole('dialog').getByRole('button', { name: /E2E Test Campaign/ });

  await clickUntilVisible(trigger, worldRow, 'the world list must appear after tapping the switcher');
});

test('per-world GM role: /inicio shows DM view when callerRole is gm', async ({ page }) => {
  // REQ-WIS-08: E2E user is GM of 'E2E Test Campaign (World)'.
  // Without any dh:role cookie, getActiveWorld falls back to that world,
  // callerRole='gm' → DM view renders.
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

  // "Atajos DM" is the DMQuickActions heading: the component takes no props, has no
  // empty branch, and only DMView renders it, so it appears whenever the DM view does
  // and never otherwise.
  //
  // The previous probe here was "Necesitan tu mirada", the eyebrow of
  // PendingFichasCard — which opens with `if (fichas.length === 0) return null`.
  // That measured whether the world happened to hold a pending sheet, not whether
  // the DM view rendered, and it only ever passed because the wizard specs seed
  // pending characters and sort ahead of this file. Run alone, it failed every time
  // against a DM view that was rendering perfectly.
  //
  // The TopBar subtitle "TU GREMIO — DM" tracks the same state but cannot be asserted
  // at this viewport: its span is `hidden sm:block`, so at 375px it is present in the
  // DOM and never visible.
  await expect(page.getByText('Atajos DM', { exact: true })).toBeVisible({ timeout: 10_000 });

  // The single RoleSwitcher toggle reflects DM via aria-pressed (seeded from
  // callerRole='gm'). Confirms roleDefault='dm' was forwarded correctly. (REQ-WIS-09)
  // `data-value` was dropped when the ToggleChip atom was extracted (commit b79b794);
  // the button's title stays stable across DM/PJ state.
  const switcher = page.getByTitle('Cambiar vista DM / Jugador');
  await expect(switcher).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
});

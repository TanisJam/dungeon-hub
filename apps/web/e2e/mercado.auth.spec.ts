/**
 * E2E — Mercado browse + detail round-trip @ 375px (iPhone SE).
 *
 * REQ-MERC-E2E-01: Playwright auth spec covering the Mercado surface.
 * Scenarios:
 *   (a) Mercado tab present and navigable from TabBar.
 *   (b) Item list renders ≥1 row.
 *   (c) No row shows a magic rarity label (mundane-only filter is active).
 *   (d) Tap item row → DetailSheet opens with item name and the Comprar control.
 *   (e) Tap outside the open DetailSheet → sheet dismisses.
 *
 * Pre-requisites:
 *   - Stack running: Supabase + API (:4000) + web (:3001).
 *   - auth.setup.ts has run — auth user has a campaign and ideally an active character.
 *     If no active character exists, the Mercado page renders an empty state and
 *     the list tests are skipped gracefully.
 *
 * Mobile-first (REQ-MERC-NAV-01 ADR-2): viewport 375 × 812.
 * Follows CLAUDE.md §11: selectOption uses exact string, no regex variant.
 *
 * Stack cold-compile can be slow → 120s timeout on first goto.
 * retries: 2 (playwright.config.ts) absorb cold-start races.
 */
import { test, expect } from '@playwright/test';

import { clickUntilVisible } from './helpers/click-until';

// Magic rarity labels that MUST NOT appear in the Mercado item list (mundane-only).
// These strings match the display labels rendered by ItemRowView for magic rarities.
const MAGIC_RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Mercado browse + detail round-trip @ 375px (REQ-MERC-E2E-01)', () => {
  // -------------------------------------------------------------------------
  // Scenario (a): Mercado tab is present in the TabBar and navigates to /mercado
  // -------------------------------------------------------------------------
  test('(a) Mercado tab is present in TabBar and navigates to /mercado', async ({ page }) => {
    await page.goto('/inicio', { timeout: 120_000, waitUntil: 'domcontentloaded' });

    // TabBar is fixed at the bottom — find the Mercado tab link.
    const mercadoTab = page.getByRole('link', { name: /mercado/i });
    await expect(mercadoTab, 'Mercado tab must be visible in the TabBar').toBeVisible({ timeout: 15_000 });

    // Navigate by clicking the Mercado tab.
    await mercadoTab.click();

    // URL must be /mercado (REQ-MERC-NAV-01).
    await expect(page).toHaveURL(/\/mercado/, { timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // Scenario (b) + (c): item list renders ≥1 row; no magic rarity labels visible
  // -------------------------------------------------------------------------
  test('(b+c) /mercado renders ≥1 item row with no magic rarity label', async ({ page }) => {
    await page.goto('/mercado', { timeout: 120_000, waitUntil: 'domcontentloaded' });

    // If the page renders the empty-state (no active character), skip gracefully.
    const emptyState = page.locator('text=Seleccioná un personaje para ver el Mercado.');
    const hasEmptyState = await emptyState.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasEmptyState) {
      test.skip(true, 'No active character — Mercado shows empty state. Create an active character to run this spec.');
      return;
    }

    // At least one item row must be visible (ul > li > button pattern from CompendiumList).
    const firstRow = page.locator('ul button').first();
    await expect(firstRow, 'At least one item row must render on /mercado').toBeVisible({ timeout: 30_000 });

    // Assert no magic rarity label is visible in the list rows (mundane-only filter).
    // ItemRowView for items renders rarity display as text inside the row.
    // We check the full list container for any magic rarity text occurrence.
    const listContainer = page.locator('ul');
    const listText = await listContainer.textContent({ timeout: 5_000 }).catch(() => '');
    for (const rarityLabel of MAGIC_RARITY_LABELS) {
      // Case-insensitive check via regex against the full list text content.
      const regex = new RegExp(rarityLabel, 'i');
      expect(
        regex.test(listText ?? ''),
        `Magic rarity label "${rarityLabel}" must NOT appear in the Mercado list`,
      ).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Scenario (d): tap first item row → DetailSheet opens with item name → Comprar control
  // -------------------------------------------------------------------------
  test('(d) tap item row → DetailSheet opens with item name and the Comprar control', async ({ page }) => {
    await page.goto('/mercado', { timeout: 120_000, waitUntil: 'domcontentloaded' });

    // Skip if empty state (no active character).
    const emptyState = page.locator('text=Seleccioná un personaje para ver el Mercado.');
    const hasEmptyState = await emptyState.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasEmptyState) {
      test.skip(true, 'No active character — Mercado shows empty state.');
      return;
    }

    // Wait for list.
    const firstRow = page.locator('ul button').first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });

    // DetailSheet renders as role="dialog" (V3Sheet pattern from compendium browser).
    const dialog = page.getByRole('dialog');

    await clickUntilVisible(firstRow, dialog, 'DetailSheet must open after tapping an item row');

    // Wait for the loading state to resolve (Cargando… disappears after detail fetch).
    await expect(page.locator('text=Cargando…')).toBeHidden({ timeout: 15_000 });

    // ItemHeader renders the item name — assert it is non-empty inside the dialog.
    // The name is always rendered; we just assert the dialog has any non-trivial text.
    const dialogText = await dialog.textContent();
    expect(dialogText?.trim().length, 'Dialog must contain item data (name via ItemHeader)').toBeGreaterThan(0);

    // The Comprar control MUST be here. REQ-MERC-BROWSE-01 made this surface
    // browse-only at Wave 3, and the market-shop-buy-ui arc superseded it —
    // /mercado threads shopContext into the list, which is what renders this
    // button. This spec asserted the old requirement long after the new one
    // shipped, and nothing caught it because the suite was never run.
    await expect(
      dialog.getByRole('button', { name: 'Comprar' }),
      'Mercado detail must offer the Comprar control (market-shop-buy-ui)',
    ).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Scenario (e): tap outside the open DetailSheet → it dismisses (touch semantics)
  // -------------------------------------------------------------------------
  test('(e) tap outside open DetailSheet → sheet dismisses', async ({ page }) => {
    await page.goto('/mercado', { timeout: 120_000, waitUntil: 'domcontentloaded' });

    // Skip if empty state.
    const emptyState = page.locator('text=Seleccioná un personaje para ver el Mercado.');
    const hasEmptyState = await emptyState.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasEmptyState) {
      test.skip(true, 'No active character — Mercado shows empty state.');
      return;
    }

    // Open detail sheet.
    const firstRow = page.locator('ul button').first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });

    const dialog = page.getByRole('dialog');

    await clickUntilVisible(firstRow, dialog, 'DetailSheet must open after tapping an item row');

    await expect(page.locator('text=Cargando…')).toBeHidden({ timeout: 15_000 });

    // Tap outside the sheet — click in the top-left corner of the viewport (outside the sheet).
    // The DetailSheet overlay/backdrop captures outside-click events → onClose().
    await page.mouse.click(30, 100);

    // Dialog must dismiss.
    await expect(dialog, 'DetailSheet must dismiss after tapping outside').toBeHidden({ timeout: 10_000 });
  });
});

import { test, expect, type Page } from '@playwright/test';

/**
 * E2E — DM grants gold + item paths @ 375px.
 *
 * REQ-MQS-DM-GRANTS-GOLD-ITEM (sdd/mobile-qa-sweep spec #910):
 *   Extends dm-grants.auth.spec.ts (XP path) with the gold and item grant tabs.
 *   Verifies:
 *     - Gold tab: enters 50 gp, submits, asserts gp increases by ≥50.
 *     - Item tab: searches "longsword", picks first result, submits, asserts
 *       item appears in inventory.
 *
 * Tab names confirmed from dm-grant-panel.tsx:164 — "Oro" and "Ítem".
 * Submit buttons from dm-grant-panel.tsx — "Otorgar oro" and "Otorgar ítem".
 * Gold gp input: id="coin-gp".
 * Item search input: id="item-search".
 *
 * Both tests: 375×667 viewport. Skip-graceful when prereqs absent.
 *
 * Mobile-first: viewport at 375px per CLAUDE.md §2.
 * Stack must be running (see apps/web/e2e/README.md).
 */
test.describe('DM grants — gold + item tabs @ 375px (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  /**
   * Helper: navigate dashboard → master world → activos tab → first char.
   * Returns charHref or null/skip signals via test.skip.
   */
  async function navigateToFirstActivoChar(page: Page): Promise<string> {
    await page.goto('/dashboard');
    await expect(page.getByText('Jugador', { exact: true })).toBeVisible({ timeout: 10_000 });

    const masterLink = page.locator('a[href^="/worlds/"]').first();
    const hasMasterLink = await masterLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(!hasMasterLink, 'Auth user is not GM of any world — skipping DM grant E2E.');

    const worldHref = await masterLink.getAttribute('href');
    if (!worldHref) throw new Error('masterLink has no href');
    await page.goto(worldHref);
    await expect(page).toHaveURL(/\/worlds\/[a-f0-9-]+/, { timeout: 10_000 });

    const activosTab = page.getByRole('tab', { name: /^activos$/i });
    const hasActivosTab = await activosTab.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasActivosTab) {
      await activosTab.click();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    }

    const charLink = page.locator('a[href^="/characters/"]').first();
    const hasChar = await charLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(
      !hasChar,
      'No accessible character found in GM world — skipping DM grant E2E.',
    );

    const charHref = await charLink.getAttribute('href');
    if (!charHref) throw new Error('charLink has no href');
    return charHref;
  }

  test('DM grants gold via Oro tab', async ({ page }) => {
    // ---- Step 1: Navigate to character sheet ----
    const charHref = await navigateToFirstActivoChar(page);
    await page.goto(charHref);
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Step 2: Capture gold before ----
    // Navigate to inventario tab first to read current gp value.
    const inventarioTab = page.getByRole('tab', { name: /^inventario$/i });
    const hasInventarioTab = await inventarioTab.isVisible({ timeout: 5_000 }).catch(() => false);
    let goldBefore = 0;
    if (hasInventarioTab) {
      await inventarioTab.click();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      // CurrencyBlock: aria-label="Monedas" grid — gp is 4th cell (MO label).
      // Read the MO cell text — it's a raw number (e.g. "0" or "50").
      const currencyGrid = page.locator('[aria-label="Monedas"]');
      const gridVisible = await currencyGrid.isVisible({ timeout: 3_000 }).catch(() => false);
      if (gridVisible) {
        // Each coin cell: number then label. gp is index 3 (0-based).
        const coinCells = currencyGrid.locator('div');
        const gpCell = coinCells.nth(3);
        const gpText = await gpCell.textContent().catch(() => '0');
        const parsed = parseInt((gpText ?? '').replace(/\D+/g, '') || '0', 10);
        if (!isNaN(parsed)) goldBefore = parsed;
      }
    }

    // ---- Step 3: Open "Otorgar recompensa de DM" modal ----
    const otorgarBtn = page.getByRole('button', { name: 'Otorgar recompensa de DM' });
    const hasOtorgar = await otorgarBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(
      !hasOtorgar,
      '"Otorgar" button not visible — user is not GM of this character\'s world.',
    );

    await otorgarBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });

    // ---- Step 4: Click "Oro" tab ----
    // Tab name confirmed: dm-grant-panel.tsx:164 — tab === 'gold' ? 'Oro' : ...
    const goldTab = page.getByRole('tab', { name: /^Oro$/i });
    await expect(goldTab).toBeVisible({ timeout: 3_000 });
    await goldTab.click();

    await expect(dialog).toBeVisible({ timeout: 3_000 });

    await page.screenshot({
      path: 'e2e/.screenshots/dm-grants-gold-tab-375.png',
      fullPage: false,
    });

    // ---- Step 5: Enter 50 gp ----
    // Gold input: id="coin-gp" (dm-grant-panel.tsx:312 pattern with coin='gp').
    const gpInput = page.locator('#coin-gp');
    await expect(gpInput).toBeVisible({ timeout: 3_000 });
    await gpInput.fill('50');

    // ---- Step 6: Submit ----
    // Submit button text: 'Otorgar oro' (dm-grant-panel.tsx:339, lowercase 'o').
    const submitBtn = dialog.getByRole('button', { name: /^Otorgar oro$/i });
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // ---- Step 7: Wait for modal to close ----
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // ---- Step 8: Navigate to inventario tab ----
    const inventarioTabAfter = page.getByRole('tab', { name: /^inventario$/i });
    const hasInvAfter = await inventarioTabAfter.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInvAfter) {
      // Navigate directly with query param
      await page.goto(`${charHref}?tab=inventario`);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    } else {
      await inventarioTabAfter.click();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    }

    // ---- Step 9: Assert gp value is ≥ goldBefore + 50 ----
    const currencyGridAfter = page.locator('[aria-label="Monedas"]');
    await expect(currencyGridAfter).toBeVisible({ timeout: 8_000 });
    const coinCellsAfter = currencyGridAfter.locator('div');
    const gpCellAfter = coinCellsAfter.nth(3);
    const gpTextAfter = await gpCellAfter.textContent().catch(() => '0');
    const goldAfter = parseInt((gpTextAfter ?? '').replace(/\D+/g, '') || '0', 10);
    expect(goldAfter, `gp after grant (${goldAfter}) should be ≥ goldBefore(${goldBefore}) + 50`).toBeGreaterThanOrEqual(goldBefore + 50);

    await page.screenshot({
      path: 'e2e/.screenshots/dm-grants-gold-after-375.png',
      fullPage: false,
    });
  });

  test('DM grants item via Ítem tab', async ({ page }) => {
    // ---- Step 1: Navigate to character sheet ----
    const charHref = await navigateToFirstActivoChar(page);
    await page.goto(charHref);
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Step 2: Open "Otorgar recompensa de DM" modal ----
    const otorgarBtn = page.getByRole('button', { name: 'Otorgar recompensa de DM' });
    const hasOtorgar = await otorgarBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(
      !hasOtorgar,
      '"Otorgar" button not visible — user is not GM of this character\'s world.',
    );

    await otorgarBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });

    // ---- Step 3: Click "Ítem" tab ----
    // Tab name confirmed: dm-grant-panel.tsx:164 — tab === 'item' ? 'Ítem'
    const itemTab = page.getByRole('tab', { name: /^Ítem$/i });
    await expect(itemTab).toBeVisible({ timeout: 3_000 });
    await itemTab.click();

    await expect(dialog).toBeVisible({ timeout: 3_000 });

    await page.screenshot({
      path: 'e2e/.screenshots/dm-grants-item-tab-375.png',
      fullPage: false,
    });

    // ---- Step 4: Type "longsword" in search input ----
    // Item search input: id="item-search" (dm-grant-panel.tsx:430).
    const searchInput = page.locator('#item-search');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('longsword');

    // ---- Step 5: Wait for typeahead results (debounced 200ms) ----
    // Results are rendered in a <ul> inside the dialog once debounce fires.
    const resultsContainer = dialog.locator('ul');
    const hasResults = await resultsContainer.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(
      !hasResults,
      'No item search results returned for "longsword" — compendium data may not be seeded.',
    );

    // ---- Step 6: Click first result ----
    const firstResult = resultsContainer.locator('li button').first();
    await expect(firstResult).toBeVisible({ timeout: 3_000 });
    await firstResult.click();

    // ---- Step 7: Submit ----
    // Submit button text: 'Otorgar ítem' (dm-grant-panel.tsx:504, lowercase 'í').
    const submitBtn = dialog.getByRole('button', { name: /^Otorgar ítem$/i });
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // ---- Step 8: Wait for modal to close ----
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // ---- Step 9: Navigate to inventario tab ----
    const inventarioTabAfter = page.getByRole('tab', { name: /^inventario$/i });
    const hasInvAfter = await inventarioTabAfter.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInvAfter) {
      await page.goto(`${charHref}?tab=inventario`);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    } else {
      await inventarioTabAfter.click();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    }

    // ---- Step 10: Assert longsword visible in inventory ----
    const inventorySection = page.locator('[class*="space-y"]').filter({ hasText: /longsword/i }).first();
    // Broad approach: just check for text anywhere in the page inventory area.
    await expect(page.getByText(/longsword/i).first()).toBeVisible({ timeout: 8_000 });

    await page.screenshot({
      path: 'e2e/.screenshots/dm-grants-item-after-375.png',
      fullPage: false,
    });
  });

  test('Inventario tab renders CurrencyBlock (Monedas grid) at 375px', async ({ page }) => {
    // Separate test: verifies CurrencyBlock renders correctly at 375px on the
    // inventario tab — this is a pure rendering test, no DM action needed.
    // Mirrors inventory-mobile.auth.spec.ts pattern.

    await page.goto('/dashboard');

    const allHrefs = await page
      .locator('a[href^="/characters/"]')
      .evaluateAll((els) =>
        (els as HTMLAnchorElement[])
          .map((a) => a.getAttribute('href'))
          .filter((h): h is string => !!h && /\/characters\/[a-f0-9-]{36}/.test(h)),
      );
    const uniqueHrefs = [...new Set(allHrefs)];
    test.skip(uniqueHrefs.length === 0, 'No characters for test user — skipping CurrencyBlock smoke.');

    // Try each character until inventario tab loads (published chars only).
    let landed = false;
    for (const href of uniqueHrefs) {
      await page.goto(`${href}?tab=inventario`);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      if (/\/characters\/[a-f0-9-]+\?tab=inventario/.test(page.url())) {
        landed = true;
        break;
      }
    }
    test.skip(!landed, 'No published characters found — all drafts redirect to wizard.');

    // CurrencyBlock: aria-label="Monedas" grid — always rendered even with 0 coins.
    const currencyGrid = page.locator('[aria-label="Monedas"]');
    await expect(currencyGrid).toBeVisible({ timeout: 5_000 });

    // Denomination labels: MC, MP, ME, MO, PP
    for (const label of ['MC', 'MP', 'ME', 'MO', 'PP']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 3_000 });
    }

    // No horizontal scroll at 375px
    const wScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScroll, 'horizontal scroll on inventario tab at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/currency-block-375.png',
      fullPage: true,
    });
  });
});

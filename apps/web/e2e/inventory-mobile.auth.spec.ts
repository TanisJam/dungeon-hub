import { test, expect } from '@playwright/test';

/**
 * Mobile smoke for SDD `inventory-foundation` (C4 — web inventory tab).
 *
 * Verifies the new interactive inventario tab renders correctly at 375px
 * (iPhone SE viewport) per CLAUDE.md §2 mobile-first mandate + the
 * REQ-INV-MOBILE-LAYOUT requirement from spec #843.
 *
 * The deep functional coverage lives in:
 *   - apps/web/.../inventario.test.tsx (round-trip component)
 *   - apps/api/tests/integration/character-inventory.test.ts (equip → AC)
 *   - packages/domain/.../armor-class.test.ts (PHB formula)
 *
 * This spec proves the page LOADS at 375px without SSR errors and the
 * picker modal opens. It relies on at least one character already existing
 * for the test user — `wizard.auth.spec.ts` creates them when run.
 */
test.describe('inventory mobile smoke @ 375px (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('inventory tab renders + picker opens at 375px', async ({ page }) => {
    await page.goto('/dashboard');

    // Collect all char hrefs (uuid-shaped, skip /characters/new).
    const allHrefs = await page
      .locator('a[href^="/characters/"]')
      .evaluateAll((els) =>
        (els as HTMLAnchorElement[])
          .map((a) => a.getAttribute('href'))
          .filter((h): h is string => !!h && /\/characters\/[a-f0-9-]{36}/.test(h)),
      );
    const uniqueHrefs = [...new Set(allHrefs)];

    test.skip(uniqueHrefs.length === 0, 'No characters for test user.');

    // Try each char until one renders the inventory tab (i.e., not a draft
    // that redirects to the wizard).
    let landed = false;
    for (const href of uniqueHrefs) {
      await page.goto(`${href}?tab=inventario`);
      // Wait for either: stable on /characters/.../?tab=inventario, OR redirect.
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      if (/\/characters\/[a-f0-9-]+\?tab=inventario/.test(page.url())) {
        landed = true;
        break;
      }
    }

    test.skip(
      !landed,
      `No published characters found for test user (tried ${uniqueHrefs.length}). All drafts redirect to wizard. Run wizard.auth.spec.ts to publish one.`,
    );

    // Key element: "Agregar item" button must be visible.
    await expect(page.getByRole('button', { name: /agregar.*[ií]tem/i })).toBeVisible({
      timeout: 5_000,
    });

    // No horizontal scroll at 375px (REQ-INV-MOBILE-LAYOUT).
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, 'horizontal scroll at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/inventory-mobile-375-tab.png',
      fullPage: true,
    });

    // Open picker modal → must render as dialog at 375px.
    await page.getByRole('button', { name: /agregar.*[ií]tem/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });

    await page.screenshot({
      path: 'e2e/.screenshots/inventory-mobile-375-picker.png',
      fullPage: true,
    });
  });
});

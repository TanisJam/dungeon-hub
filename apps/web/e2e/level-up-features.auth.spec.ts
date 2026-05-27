import { test, expect } from '@playwright/test';

/**
 * E2E — featuresUnlocked section visible on the level-up success screen.
 *
 * REQ-CLU-FTR-SUCCESS-SCREEN, REQ-CLU-FTR-API-RESPONSE-SHAPE.
 *
 * Flow: Find a Fighter character at L1 (or any level where leveling up grants
 * a named feature). Level up → complete the flow → assert the success screen
 * shows "Características nuevas" section with at least one feature name.
 *
 * Fighter L1→L2 grants "Action Surge" (PHB p.72 — Second Wind + Action Surge
 * at L2). This is a reliable fixture: any L1 Fighter leveling to L2 will have
 * featuresUnlocked populated.
 *
 * Skips gracefully when:
 *   - No Fighter L1 character is found with XP ≥ 300.
 *   - "Subir nivel" is not visible.
 *   - Level is not L1 (Action Surge only unlocks at L2).
 *
 * Mobile-first: 375px per CLAUDE.md §2.
 * Stack must be running. Run after wizard.auth.spec.ts (Fighter char created there).
 */
test.describe('Level-up featuresUnlocked on success screen — Fighter L1→L2 @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Fighter L1→L2 success screen shows "Características nuevas" with Action Surge', async ({ page }) => {
    // ---- Step 1: Dashboard ----
    await page.goto('/dashboard');
    await expect(page.getByText('Jugador', { exact: true })).toBeVisible({ timeout: 10_000 });

    // ---- Step 2: Find a Fighter L1 character ----
    const allHrefs = await page
      .locator('a[href^="/characters/"]')
      .evaluateAll((els) =>
        (els as HTMLAnchorElement[])
          .map((a) => a.getAttribute('href'))
          .filter((h): h is string => !!h && /\/characters\/[a-f0-9-]{36}/.test(h)),
      );
    const uniqueHrefs = [...new Set(allHrefs)];
    test.skip(uniqueHrefs.length === 0, 'No characters for test user — skipping features E2E.');

    let fighterCharHref: string | null = null;
    for (const href of uniqueHrefs) {
      await page.goto(href);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      const hasFighter = await page.locator('text=/fighter/i').first().isVisible({ timeout: 2_000 }).catch(() => false);
      const isL1 = await page.locator('text=/nivel 1/i').first().isVisible({ timeout: 1_000 }).catch(() => false);
      if (hasFighter && isL1) {
        fighterCharHref = href;
        break;
      }
    }

    test.skip(
      !fighterCharHref,
      'No Fighter L1 character found. Run wizard.auth.spec.ts first (creates an E2E Fighter character).',
    );

    await page.goto(fighterCharHref!);
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Step 3: Level-up pill ----
    const levelUpLink = page.getByRole('link', { name: /subir.*nivel/i });
    const hasLevelUp = await levelUpLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(
      !hasLevelUp,
      '"Subir nivel" not visible — Fighter not active, not player-owned, or insufficient XP.',
    );

    // ---- Step 4: Navigate to level-up flow ----
    await levelUpLink.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+\/level-up/, { timeout: 10_000 });
    await expect(page.getByText(/subir de nivel/i)).toBeVisible({ timeout: 5_000 });

    // ---- Step 5: Same-class branch ----
    const sameClassBtn = page.getByRole('button', { name: /subir clase existente/i });
    await expect(sameClassBtn).toBeVisible({ timeout: 5_000 });
    await sameClassBtn.click();

    // ---- Step 6: Pick Fighter class ----
    const classBtn = page.getByRole('button').filter({ hasText: /nivel \d+ → \d+/i }).first();
    const hasClassBtn = await classBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasClassBtn, 'No class button on class step.');
    await classBtn.click();

    // ---- Step 7: HP step — choose "Promedio" ----
    await expect(page.getByText(/promedio/i)).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /continuar/i }).click();

    // ---- Step 8: ASI step does NOT appear at Fighter L2 (ASI is at L4/6/8/...) ----
    // Guard in case character is at a different level than expected
    const isAsiStep = await page.getByText(/mejora de características/i).isVisible({ timeout: 2_000 }).catch(() => false);
    if (isAsiStep) {
      // Fighter ASI levels: 4, 6, 8, 12, 14 — if we're here the char is at L3/5/7/...
      // We still need to complete the ASI step to proceed
      const strBtn = page.getByRole('button', { name: '+2' }).first();
      if (await strBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await strBtn.click();
        const asiCta = page.getByRole('button', { name: /continuar/i });
        if (await asiCta.isEnabled({ timeout: 2_000 }).catch(() => false)) {
          await asiCta.click();
        } else {
          test.skip(true, 'ASI step appeared but cannot complete it.');
        }
      } else {
        test.skip(true, 'ASI step appeared at unexpected level.');
      }
    }

    // ---- Step 9: Review step — confirm ----
    await expect(page.getByRole('button', { name: /confirmar subida/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /confirmar subida/i }).click();

    // ---- Step 10: Success screen — assert "Características nuevas" ----
    await expect(page.getByText(/subiste de nivel/i)).toBeVisible({ timeout: 10_000 });

    // The success screen should show the features section when featuresUnlocked is non-empty.
    // Fighter L2 grants "Action Surge" (PHB p.72).
    const featuresSection = page.getByText(/caracter[ií]sticas nuevas/i);
    const hasFeaturesSection = await featuresSection.isVisible({ timeout: 5_000 }).catch(() => false);

    // This is the primary assertion for this spec.
    // If the API returned featuresUnlocked=[], the section would not render.
    expect(
      hasFeaturesSection,
      'Expected "Características nuevas" section on success screen for Fighter L2 — check API featuresUnlocked response.',
    ).toBe(true);

    // Assert "Action Surge" visible (PHB p.72 — Fighter L2 feature)
    // The feature name comes from the compendium classFeature string.
    const actionSurge = page.getByText(/action surge/i).first();
    await expect(actionSurge).toBeVisible({ timeout: 3_000 });

    // Mobile: success screen fits within 375px
    const wScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScroll, 'horizontal scroll on success screen at 375px').toBeLessThanOrEqual(375);

    // ---- Step 11: "Ver ficha" ----
    await page.getByRole('button', { name: /ver ficha/i }).click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText(/activo/i)).toBeVisible({ timeout: 5_000 });
  });
});

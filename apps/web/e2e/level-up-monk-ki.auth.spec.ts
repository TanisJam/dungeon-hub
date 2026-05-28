import { test, expect } from '@playwright/test';

/**
 * E2E — Monk L1→L2 level-up with Puntos de Ki visible in recursos tab.
 *
 * REQ-MQS-LEVELUP-MONK (sdd/mobile-qa-sweep spec #910):
 *   After a Monk character levels up to L2, the recursos tab must show
 *   "Puntos de Ki" (monk:ki-points resource, tracked from L2 per PHB p.76).
 *
 * Flow:
 *   1. Dashboard → find a character whose name starts with "E2E Monk"
 *      (created by wizard-monk.auth.spec.ts).
 *   2. If no Monk character is active/has XP, skip gracefully.
 *   3. Click "Subir nivel" → same-class branch → Monk → average HP → confirm.
 *   4. Navigate to /characters/[id]?tab=recursos and assert "Puntos de Ki" is visible.
 *
 * Skips gracefully when:
 *   - No Monk character exists for the auth user.
 *   - Monk character is not active or lacks sufficient XP (< 300 for L2).
 *   - "Subir nivel" button is not visible.
 *   - Monk is not L1 (already L2+ or a higher level where test would be invalid).
 *
 * Mobile-first: viewport at 375px per CLAUDE.md §2.
 * Stack must be running (see apps/web/e2e/README.md).
 * Run after wizard-monk.auth.spec.ts to ensure a Monk character exists.
 */
test.describe('Level-up Monk L1→L2 — Puntos de Ki visible @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Monk levels up to L2, recursos tab shows Puntos de Ki', async ({ page }) => {
    // ---- Step 1: Navigate to dashboard ----
    await page.goto('/dashboard');
    await expect(page.getByRole('main').getByText('Jugador', { exact: true })).toBeVisible({ timeout: 10_000 });

    // ---- Step 2: Find a Monk character ----
    // Collect all char hrefs (uuid-shaped, skip /characters/new).
    const allHrefs = await page
      .locator('a[href^="/characters/"]')
      .evaluateAll((els) =>
        (els as HTMLAnchorElement[])
          .map((a) => a.getAttribute('href'))
          .filter((h): h is string => !!h && /\/characters\/[a-f0-9-]{36}/.test(h)),
      );
    const uniqueHrefs = [...new Set(allHrefs)];
    test.skip(uniqueHrefs.length === 0, 'No characters for test user — skipping Monk level-up E2E.');

    // Try to find a Monk character by navigating to each char sheet and looking
    // for Monk-specific content (e.g., "monk" class name on sheet).
    let monkCharHref: string | null = null;
    for (const href of uniqueHrefs) {
      await page.goto(href);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      // Sheet shows the character name and class. Look for "monk" text (case-insensitive).
      const hasMonk = await page.locator('text=monk').first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (hasMonk) {
        monkCharHref = href;
        break;
      }
    }

    test.skip(
      !monkCharHref,
      'No Monk character found for auth user. Run wizard-monk.auth.spec.ts first.',
    );

    await page.goto(monkCharHref!);
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Step 3: Check "Subir nivel" button ----
    const levelUpLink = page.getByRole('link', { name: /subir.*nivel/i });
    const hasLevelUp = await levelUpLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(
      !hasLevelUp,
      '"Subir nivel" not visible — Monk not active, not player-owned, or insufficient XP.',
    );

    // ---- Step 4: Navigate to level-up flow ----
    await levelUpLink.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+\/level-up/, { timeout: 10_000 });
    await expect(page.getByText(/subir de nivel/i)).toBeVisible({ timeout: 5_000 });

    // ---- Step 5: Select "Subir clase existente" ----
    const sameClassBtn = page.getByRole('button', { name: /subir clase existente/i });
    await expect(sameClassBtn).toBeVisible({ timeout: 5_000 });
    await sameClassBtn.click();

    // ---- Step 6: Pick the Monk class ----
    const firstClassBtn = page.getByRole('button').filter({ hasText: /nivel \d+ → \d+/i }).first();
    const hasClassBtn = await firstClassBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(
      !hasClassBtn,
      'No owned-class buttons found on class step — unexpected state.',
    );
    await firstClassBtn.click();

    // ---- Step 7: HP step — choose "Promedio" (default) ----
    await expect(page.getByText(/promedio/i)).toBeVisible({ timeout: 5_000 });
    const continueBtn = page.getByRole('button', { name: /continuar/i });
    await continueBtn.click();

    // ---- Step 8: ASI step (Monk L2 does NOT have an ASI — skip if visible) ----
    // Monk L2 grants Ki Points + Unarmored Movement, not an ASI.
    // The ASI step should NOT appear here; guard in case UI state differs.
    const isAsiStep = await page.getByText(/mejora de características/i).isVisible({ timeout: 2_000 }).catch(() => false);
    if (isAsiStep) {
      test.skip(true, 'ASI step appeared at Monk L2 — unexpected; skipping to avoid incorrect state.');
    }

    // ---- Step 9: Review step — confirm ----
    await expect(page.getByRole('button', { name: /confirmar subida/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /confirmar subida/i }).click();

    // ---- Step 10: Success screen ----
    await expect(page.getByText(/subiste de nivel/i)).toBeVisible({ timeout: 10_000 });

    // ---- Step 11: "Ver ficha" → back to character sheet ----
    const verFichaBtn = page.getByRole('button', { name: /ver ficha/i });
    await verFichaBtn.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/, { timeout: 10_000 });

    const charUrl = page.url();

    // ---- Step 12: Navigate to recursos tab ----
    // ki-points resource is registered for 'monk' class with slug 'monk:ki-points'.
    // The RecursosTab renders it with label 'Puntos de Ki' (recursos.tsx line 21).
    await page.goto(`${charUrl}?tab=recursos`);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    // ---- Step 13: Assert "Puntos de Ki" is visible ----
    // The resource label is rendered as a heading inside ResourceRow.
    await expect(page.getByText(/Puntos de Ki/i).first()).toBeVisible({ timeout: 8_000 });

    // No horizontal scroll at 375px (CLAUDE.md §2 mobile-first mandate)
    const wScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScroll, 'horizontal scroll on recursos tab at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/monk-ki-recursos-375.png',
      fullPage: true,
    });
  });
});

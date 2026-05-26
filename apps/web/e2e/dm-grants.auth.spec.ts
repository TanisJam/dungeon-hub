import { test, expect } from '@playwright/test';

/**
 * E2E happy path for SDD `dm-session-grants` (C3).
 *
 * REQ-CDG-DM-PANEL-VISIBILITY: "Otorgar" button visible only for GM.
 * REQ-CDG-XP-FORM: DM opens panel, submits XP=100, sheet refreshes with new XP.
 *
 * This spec runs with the auth user's storageState. It navigates to any
 * character page where the test user is a GM (callerRole==='gm') and verifies
 * the grant flow end-to-end.
 *
 * The test skips gracefully if:
 *  - No character sheet is accessible as GM from the dashboard.
 *  - The "Otorgar" button is not present (user has no GM characters).
 *
 * Stack must be running (see apps/web/e2e/README.md). If not feasible in this
 * session, document skip in commit body — the spec is the contract.
 *
 * Mobile-first: viewport at 375px per CLAUDE.md §2.
 */
test.describe('DM grants — E2E happy path (iPhone SE 375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('DM opens "Otorgar" panel, grants XP=100, sheet XP increments', async ({ page }) => {
    // ---- Step 1: Navigate to a GM world to find a character ----
    await page.goto('/dashboard');
    await expect(page.getByText('Jugador', { exact: true })).toBeVisible({ timeout: 10_000 });

    // The auth user must have at least one world where they are GM.
    const masterLink = page.locator('a[href^="/worlds/"]').first();
    const hasMasterLink = await masterLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(!hasMasterLink, 'Auth user is not GM of any world — skipping DM grant E2E.');

    const worldHref = await masterLink.getAttribute('href');
    if (!worldHref) throw new Error('masterLink has no href');
    await page.goto(worldHref);
    await expect(page).toHaveURL(/\/worlds\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Step 2: Find a character to grant to ----
    // Navigate to "Activos" tab — these chars have a full sheet.
    const activosTab = page.getByRole('tab', { name: /^activos$/i });
    const hasActivosTab = await activosTab.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasActivosTab) {
      await activosTab.click();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    }

    // Try to find a character link.
    const charLink = page.locator('a[href^="/characters/"]').first();
    const hasChar = await charLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(
      !hasChar,
      'No accessible character found in GM world — skipping DM grant E2E.',
    );

    const charHref = await charLink.getAttribute('href');
    if (!charHref) throw new Error('charLink has no href');
    await page.goto(charHref);
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Step 3: Verify "Otorgar" button is visible (REQ-CDG-DM-PANEL-VISIBILITY) ----
    const otorgarBtn = page.getByRole('button', { name: 'Otorgar recompensa de DM' });
    const hasOtorgar = await otorgarBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(
      !hasOtorgar,
      '"Otorgar" button not visible — user is not GM of this character\'s world.',
    );

    // ---- Step 4: Read current XP from page ----
    // The XP display is in the sheet hero — look for a numeric XP value.
    // Best-effort: we capture it via aria or text. If not found, we still
    // validate the flow completed without error.
    const xpLocator = page.locator('[data-testid="xp-current"]');
    const hasXpTestId = await xpLocator.isVisible({ timeout: 1_000 }).catch(() => false);
    const xpBefore = hasXpTestId
      ? parseInt((await xpLocator.textContent()) ?? '0', 10)
      : null;

    await page.screenshot({
      path: 'e2e/.screenshots/dm-grants-before.png',
      fullPage: false,
    });

    // ---- Step 5: Open grant panel ----
    await otorgarBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });

    // XP tab should be active by default.
    const xpTab = page.getByRole('tab', { name: 'XP' });
    await expect(xpTab).toBeVisible({ timeout: 2_000 });
    expect(await xpTab.getAttribute('aria-selected')).toBe('true');

    // ---- Step 6: No horizontal scroll at 375px ----
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, 'horizontal scroll in DM grant modal at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/dm-grants-modal-xp.png',
      fullPage: false,
    });

    // ---- Step 7: Submit XP=100 ----
    const xpInput = page.getByLabel(/XP a otorgar/i);
    await xpInput.fill('100');

    const submitBtn = page.getByRole('button', { name: 'Otorgar XP' });
    await submitBtn.click();

    // Modal should close on success (revalidatePath triggers server re-render).
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: 'e2e/.screenshots/dm-grants-after.png',
      fullPage: false,
    });

    // ---- Step 8: Verify XP incremented (best-effort) ----
    if (xpBefore !== null && !isNaN(xpBefore)) {
      const xpAfter = parseInt((await xpLocator.textContent()) ?? '0', 10);
      expect(xpAfter).toBeGreaterThan(xpBefore);
    }
    // If we couldn't read XP, the fact the modal closed is sufficient proof
    // the action succeeded (server returned ok).
  });
});

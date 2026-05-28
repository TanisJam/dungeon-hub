import { test, expect } from '@playwright/test';

/**
 * E2E — Approval transition + character sheet 375px smoke.
 *
 * REQ-MQS-APPROVAL-TRANSITION, REQ-MQS-SHEET-MOBILE (sdd/mobile-qa-sweep spec #910):
 *
 * Test 1 — Approval transition smoke:
 *   Navigate from /worlds/[id] Pendientes tab → character sheet → assert
 *   "Aprobar" and "Rechazar" buttons are visible for a pending character
 *   at 375px. Clicks "Aprobar", waits for Server Action to complete, asserts
 *   post-approve state (REQ-CAU-APPROVE-BUTTON + REQ-CAU-REVERT-BUTTON).
 *   NOTE: Mutates char status to active — subsequent runs skip gracefully
 *   if no pending char exists.
 *
 * Test 2 — Character sheet 375px full smoke:
 *   Navigate to a published (active) character sheet, assert core sections
 *   render and "Grants recientes" section (RecentGrants) is either visible
 *   with content or shows empty state — no crash. Also asserts CurrencyBlock
 *   (aria-label="Monedas") visible and tap-target minimum 44px height for
 *   a sample of visible buttons.
 *
 * Existing coverage:
 *   - apps/web/.../worlds/[id]/_components/status-tabs.test.tsx
 *   - apps/web/.../characters/[id]/_components/approval-actions.test.tsx
 *   - apps/web/e2e/dm-panel-mobile.auth.spec.ts (covers revert button)
 *
 * Skips gracefully at every step — depends on:
 *   - Auth user being GM of at least one world.
 *   - At least one pending character in that world (created by wizard runs).
 *
 * Mobile-first: viewport at 375px per CLAUDE.md §2.
 * Stack must be running (see apps/web/e2e/README.md).
 */
test.describe('Approval transition + sheet mobile smoke @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('GM sees Aprobar + Rechazar buttons on pending character at 375px', async ({ page }) => {
    // ---- Step 1: Navigate to a GM world ----
    await page.goto('/dashboard');
    await expect(page.getByRole('main').getByText('Jugador', { exact: true })).toBeVisible({ timeout: 10_000 });

    const masterLink = page.locator('a[href^="/worlds/"]').first();
    const hasMasterLink = await masterLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(!hasMasterLink, 'Auth user is not GM of any world — skipping approval transition E2E.');

    const worldHref = await masterLink.getAttribute('href');
    if (!worldHref) throw new Error('masterLink has no href');
    await page.goto(worldHref);
    await expect(page).toHaveURL(/\/worlds\/[a-f0-9-]+/, { timeout: 10_000 });

    // No horizontal scroll on world landing page at 375px
    const wScrollWorld = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScrollWorld, 'horizontal scroll on /worlds/[id] at 375px').toBeLessThanOrEqual(375);

    // ---- Step 2: Switch to "Pendientes" tab ----
    const pendientesTab = page.getByRole('tab', { name: /^pendientes$/i });
    await expect(pendientesTab).toBeVisible({ timeout: 5_000 });
    await pendientesTab.click();
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    // ---- Step 3: Find a pending character ----
    const charLink = page.locator('a[href^="/characters/"]').first();
    const hasChar = await charLink.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(
      !hasChar,
      'No pending characters in GM world — skipping approval transition E2E. Run wizard.auth.spec.ts to create one.',
    );

    const charHref = await charLink.getAttribute('href');
    if (!charHref) throw new Error('charLink has no href');
    await page.goto(charHref);
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Step 4: Assert approval buttons visible ----
    // REQ-CAU-APPROVE-BUTTON: "Aprobar" visible for GM on pending char.
    const aprobarBtn = page.getByRole('button', { name: /^aprobar$/i });
    const rechazarBtn = page.getByRole('button', { name: /^rechazar$/i });

    const hasAprobar = await aprobarBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(
      !hasAprobar,
      '"Aprobar" button not visible — character may no longer be pending or user is not GM.',
    );

    await expect(aprobarBtn).toBeVisible();
    await expect(rechazarBtn).toBeVisible();

    // ---- Step 5: No horizontal scroll on character page at 375px ----
    const wScrollChar = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScrollChar, 'horizontal scroll on /characters/[id] pending at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/approval-transition-375-pending.png',
      fullPage: true,
    });

    // ---- Step 6: Click "Aprobar" ----
    // Server Action fires; button text transitions to "Aprobando…" then the
    // pending_approval block disappears (approval-actions.tsx:84 — only rendered
    // when status === 'pending_approval'). After revalidation the component
    // re-renders with status === 'active', showing "Devolver a borrador".
    await aprobarBtn.click();

    // ---- Step 7: Wait for post-approve state ----
    // REQ-CAU-APPROVE-BUTTON: Aprobar/Rechazar only visible on pending_approval.
    // REQ-CAU-REVERT-BUTTON: "Devolver a borrador" visible on active.
    // Assert ONE of: buttons gone OR revert button appears OR badge says activo.
    const devolverBtn = page.getByRole('button', { name: /devolver a borrador/i });
    const activoBadge = page.getByText(/activo/i).first();

    // Wait up to 15s for the page to reflect the approved state via revalidation.
    await expect(async () => {
      const aprobarGone = !(await aprobarBtn.isVisible().catch(() => false));
      const devolverVisible = await devolverBtn.isVisible().catch(() => false);
      const activoVisible = await activoBadge.isVisible().catch(() => false);
      expect(
        aprobarGone || devolverVisible || activoVisible,
        'Post-approve: Aprobar gone, or Devolver a borrador visible, or activo badge visible',
      ).toBe(true);
    }).toPass({ timeout: 15_000 });

    await page.screenshot({
      path: 'e2e/.screenshots/approval-transition-375-approved.png',
      fullPage: true,
    });
  });

  test('Active character sheet: core sections + RecentGrants render at 375px', async ({ page }) => {
    // ---- Step 1: Navigate to dashboard ----
    await page.goto('/dashboard');
    await expect(page.getByRole('main').getByText('Jugador', { exact: true })).toBeVisible({ timeout: 10_000 });

    // ---- Step 2: Find a published (active) character sheet ----
    // Collect all char hrefs
    const allHrefs = await page
      .locator('a[href^="/characters/"]')
      .evaluateAll((els) =>
        (els as HTMLAnchorElement[])
          .map((a) => a.getAttribute('href'))
          .filter((h): h is string => !!h && /\/characters\/[a-f0-9-]{36}/.test(h)),
      );
    const uniqueHrefs = [...new Set(allHrefs)];
    test.skip(uniqueHrefs.length === 0, 'No characters for test user — skipping sheet smoke.');

    // Find an active character (sheet renders without wizard redirect)
    let activeHref: string | null = null;
    for (const href of uniqueHrefs) {
      await page.goto(href);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      // Active character stays on /characters/[id], draft redirects to /wizard
      if (/\/characters\/[a-f0-9-]+$/.test(page.url())) {
        // Check for "activo" badge
        const hasActivo = await page.locator('text=activo').first().isVisible({ timeout: 2_000 }).catch(() => false);
        if (hasActivo) {
          activeHref = href;
          break;
        }
      }
    }

    test.skip(!activeHref, 'No active characters found — all pending or draft. Run dm-panel-mobile.auth.spec.ts to approve one.');

    await page.goto(activeHref!);
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/, { timeout: 10_000 });

    // ---- Step 3: No horizontal scroll on character sheet at 375px ----
    const wScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScroll, 'horizontal scroll on active character sheet at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/sheet-active-375.png',
      fullPage: false,
    });

    // ---- Step 4: RecentGrants section renders (events or empty state) ----
    // RecentGrants uses aria-label="Grants recientes" (recent-grants.tsx:105).
    const grantsSection = page.locator('section[aria-label="Grants recientes"]');
    const sectionVisible = await grantsSection.isVisible({ timeout: 8_000 }).catch(() => false);

    if (sectionVisible) {
      // Either events or empty state must be shown
      const hasGrants = (await grantsSection.locator('ul li').count()) > 0;
      const hasEmptyState = await grantsSection.getByText('Sin grants recientes.').isVisible().catch(() => false);
      expect(hasGrants || hasEmptyState, 'RecentGrants shows events or empty state').toBe(true);

      // No horizontal overflow within the section
      const sectionScroll = await grantsSection.evaluate((el) => el.scrollWidth);
      expect(sectionScroll, 'RecentGrants section horizontal overflow at 375px').toBeLessThanOrEqual(375);
    }
    // If not visible: caller may not be owner/DM — that's valid, no assertion.

    await page.screenshot({
      path: 'e2e/.screenshots/sheet-active-grants-375.png',
      fullPage: true,
    });

    // ---- Step 5: CurrencyBlock visible ----
    // Navigate to inventario tab to find CurrencyBlock.
    // aria-label="Monedas" confirmed at inventario.tsx:56.
    const inventarioTab = page.getByRole('tab', { name: /^inventario$/i });
    const hasInvTab = await inventarioTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasInvTab) {
      await inventarioTab.click();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

      const currencyBlock = page.locator('[aria-label="Monedas"]');
      await expect(
        currencyBlock,
        'CurrencyBlock (aria-label="Monedas") should be visible on inventario tab',
      ).toBeVisible({ timeout: 5_000 });
    }

    // ---- Step 6: Tap-target sample — visible buttons height ≥ 44px ----
    // Sample up to 5 visible buttons on the current page state.
    const buttons = await page.locator('button:visible').all();
    const sample = buttons.slice(0, 5);
    for (const btn of sample) {
      const box = await btn.boundingBox();
      expect(box?.height ?? 0, `button "${await btn.textContent()}" height should be ≥ 44px`).toBeGreaterThanOrEqual(44);
    }

    await page.screenshot({
      path: 'e2e/.screenshots/sheet-active-currency-tap-375.png',
      fullPage: false,
    });
  });
});

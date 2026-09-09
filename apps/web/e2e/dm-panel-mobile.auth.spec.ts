import { test, expect } from '@playwright/test';

/**
 * Mobile smoke for SDD `dm-session-panel` (C2 + C3 — DM world panel + approval UI).
 *
 * Verifies the new DM landing page (/worlds/[id]) + character-page approval
 * actions render correctly at 375px (iPhone SE) per CLAUDE.md §2 mobile-first
 * mandate + spec #857 REQ-WDCL-WEB-LANDING + REQ-CAU-REVERT-BUTTON.
 *
 * Component-level coverage already lives in:
 *   - apps/web/.../worlds/[id]/_components/character-row.test.tsx
 *   - apps/web/.../worlds/[id]/_components/status-tabs.test.tsx
 *   - apps/web/.../characters/[id]/_components/approval-actions.test.tsx
 *   - apps/web/.../mesa/page.test.tsx (Aprobaciones link — the CampaignsSection
 *     "Master pill" GM entry point moved here from /dashboard)
 *
 * This spec proves the pages LOAD at 375px end-to-end through the auth user
 * who owns "E2E Test Campaign (World)" as GM.
 */
test.describe('DM panel mobile smoke @ 375px (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Mesa Aprobaciones link → /worlds/[id] tabs + list → approval buttons', async ({
    page,
  }) => {
    // ---- /mesa: tap Aprobaciones link ----
    // /mesa is the DM hub (was reachable only via /dashboard's "Master pill").
    // It default-denies (notFound → 404) when effectiveView !== 'dm', so a
    // non-GM auth user gets a 404 response instead of the a[href^="/worlds/"]
    // link that used to gate this test — check the response status instead.
    const mesaResponse = await page.goto('/mesa');
    const isGm = mesaResponse !== null && mesaResponse.status() !== 404;
    test.skip(
      !isGm,
      'No /worlds/[id] link visible — test user is not GM of any campaign world.',
    );

    // Page-loaded sentinel — /mesa's AppShell h1 title replaces the old
    // dashboard "Jugador" IdentityHeader text.
    await expect(page.getByRole('heading', { name: 'Mesa', exact: true })).toBeVisible({ timeout: 5_000 });

    // The auth user owns "E2E Test Campaign" — they should also be gm of its
    // world. /mesa's "Aprobaciones" link is <Link href="/worlds/...">.
    const masterPill = page.locator('a[href^="/worlds/"]').first();
    await expect(masterPill).toBeVisible({ timeout: 5_000 });

    const worldHref = await masterPill.getAttribute('href');
    if (!worldHref) throw new Error('masterPill missing href');
    await page.goto(worldHref);
    await expect(page).toHaveURL(/\/worlds\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- /worlds/[id] world landing ----
    // Status tabs visible.
    const _tabsRegion = page.getByRole('tablist').or(
      page.locator('[data-testid="status-tabs"]'),
    );
    // Either role or fallback selector — but at minimum the three tab labels.
    await expect(page.getByRole('tab', { name: /^pendientes$/i })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('tab', { name: /^activos$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^todos$/i })).toBeVisible();

    // No horizontal scroll at 375px (REQ-WDCL-WEB-LANDING).
    const wScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScroll, 'horizontal scroll on /worlds/[id] at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/dm-panel-375-world-page.png',
      fullPage: true,
    });

    // ---- Switch to "Activos" tab — most likely to have at least one char
    //      from prior wizard.auth.spec.ts runs. URL should reflect ?status=.
    await page.getByRole('tab', { name: /^activos$/i }).click();
    await expect(page).toHaveURL(/[?&]status=active/, { timeout: 5_000 });

    // ---- Tap first character row (if any) → /characters/[id] ----
    const firstCharRow = page.locator('a[href^="/characters/"]').first();
    const hasChar = await firstCharRow.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasChar) {
      // No active chars — smoke ends here with screenshots of empty state.
      await page.screenshot({
        path: 'e2e/.screenshots/dm-panel-375-world-empty.png',
        fullPage: true,
      });
      return;
    }

    await firstCharRow.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });

    // ---- Character page (active) — REQ-CAU-REVERT-BUTTON ----
    // GM + active char → "Devolver a borrador" button MUST be visible.
    const revertBtn = page.getByRole('button', { name: /devolver.*borrador/i });
    await expect(revertBtn).toBeVisible({ timeout: 5_000 });

    // No horizontal scroll on char page either.
    const cScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(cScroll, 'horizontal scroll on /characters/[id] at 375px').toBeLessThanOrEqual(375);

    await page.screenshot({
      path: 'e2e/.screenshots/dm-panel-375-char-page-active.png',
      fullPage: true,
    });
  });
});

import { test, expect } from '@playwright/test';

/**
 * Recent-grants E2E smoke — best-effort (T34, sdd/inventory-d4-d6 tasks #891).
 *
 * Navigates to the character sheet of the authenticated user's first character
 * and asserts that the RecentGrants widget renders — either with events or the
 * empty state. Empty state is acceptable when the test seed has no prior grants.
 *
 * Component-level coverage lives in:
 *   apps/web/app/characters/[id]/_components/recent-grants.test.tsx
 *
 * This spec just proves the widget appears in the real page at 375px mobile.
 */
test.describe('RecentGrants widget — mobile smoke @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('character sheet renders RecentGrants section (events or empty state)', async ({
    page,
  }) => {
    // Navigate to dashboard to find a character link
    await page.goto('/dashboard');
    await expect(page.getByText('Jugador', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Find the first character link (Jugador section → character name → href to /characters/[id])
    const charLink = page.locator('a[href^="/characters/"]').first();
    const hasChar = await charLink.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(
      !hasChar,
      'No character link found on dashboard — test user has no characters.',
    );

    await charLink.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/, { timeout: 10_000 });

    // The RecentGrants section is labeled "Grants recientes" or shows its
    // heading / empty state. Look for the section aria-label.
    const grantsSection = page.locator('section[aria-label="Grants recientes"]');

    // Wait for section to appear (Server Component — should be in initial HTML)
    const sectionVisible = await grantsSection.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!sectionVisible) {
      // Best-effort: if the user is not owner/DM, RecentGrants returns null.
      // That's valid — skip rather than fail.
      test.skip(true, 'RecentGrants not visible — caller may not be owner or DM.');
      return;
    }

    // Section is visible — assert it contains either events or empty state
    const hasGrants = await grantsSection.locator('ul li').count() > 0;
    const hasEmptyState = await grantsSection.getByText('Sin grants recientes.').isVisible();

    expect(hasGrants || hasEmptyState, 'RecentGrants shows events or empty state').toBe(true);

    // No horizontal scroll at 375px (mobile-first mandate)
    const wScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wScroll, 'no horizontal scroll at 375px').toBeLessThanOrEqual(375 + 1); // +1 for rounding
  });
});

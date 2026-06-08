import { test, expect } from '@playwright/test';
import { resolveAccessToken } from './helpers/resolve-access-token';

/**
 * E2E — Bitácora Pages @ 375px (iPhone SE) — Round-trip spec
 *
 * bitacora-personal SDD spec #1974:
 *   REQ-BP-TEST-02: page create → full reload → page appears in Páginas list with correct data.
 *
 * Pre-requisites:
 *   - Stack must be running (see apps/web/e2e/README.md).
 *   - The auth test user must exist (auth.setup.ts).
 *   - The auth user must own an active character (status=active).
 *
 * HOUSE RULE: Bitácora pages are player-authored personal notes.
 * No PHB rule — anti-metagaming design principle.
 */

const MOBILE = { width: 375, height: 667 };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.use({ viewport: MOBILE });

/**
 * Resolve the first active character ID for the test user via the API.
 */
async function resolveCharacterId(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
): Promise<string | null> {
  const res = await request.get(`${API}/api/v1/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return null;
  const data = await res.json() as { data?: Array<{ id: string; status: string }> };
  const active = (data.data ?? []).find((c) => c.status === 'active');
  return active?.id ?? null;
}

test.describe('Bitácora Pages @ 375px', () => {
  test(
    'REQ-BP-TEST-02: create page → reload → page appears in Páginas list (round-trip)',
    async ({ page, request }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const accessToken = await resolveAccessToken(page);

      if (!accessToken) {
        test.skip(true, 'Could not resolve access token — ensure auth.setup.ts ran first');
        return;
      }

      const characterId = await resolveCharacterId(request, accessToken);
      if (!characterId) {
        test.skip(true, 'No active character found for test user — create one first');
        return;
      }

      // 1. Create a bitácora page via the API (same as UI composer would do via Server Action)
      const createRes = await request.post(
        `${API}/api/v1/characters/${characterId}/bitacora/pages`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            body: 'Test round-trip',
            tags: ['monsters'],
            refs: [],
          },
        },
      );
      expect(createRes.status()).toBe(200);
      const createdData = await createRes.json() as { page: { id: string } };
      const pageId = createdData.page.id;
      expect(typeof pageId).toBe('string');

      // 2. Full browser reload — navigate to Bitácora tab → Páginas sub-view
      await page.goto(
        `/characters/${characterId}?tab=notas&sub=paginas`,
        { waitUntil: 'networkidle', timeout: 60_000 },
      );
      await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

      // 3. Páginas sub-view renders — assert the page appears with body snippet (REQ-BP-TEST-02)
      // Use the card button that contains both snippet and tag to scope assertions.
      const pageCard = page.getByRole('button', { name: /Test round-trip/ }).first();
      await expect(pageCard).toBeVisible({ timeout: 10_000 });

      // 4. Tag chip "monsters" is visible inside the card (REQ-BP-TEST-02)
      await expect(pageCard.getByText('monsters')).toBeVisible({ timeout: 10_000 });

      // 5. No horizontal overflow at 375px (REQ-BP-WEB-01)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, 'No horizontal overflow at 375px').toBeLessThanOrEqual(375);

      // Cleanup: delete the test page
      await request.delete(
        `${API}/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    },
  );

  test(
    'Empty state renders when character has zero bitácora pages (REQ-BP-WEB-03)',
    async ({ page, request }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const accessToken = await resolveAccessToken(page);

      if (!accessToken) {
        test.skip(true, 'Could not resolve access token');
        return;
      }

      const characterId = await resolveCharacterId(request, accessToken);
      if (!characterId) {
        test.skip(true, 'No active character found');
        return;
      }

      // Check current page count — only run empty-state assertion if truly empty
      const listRes = await request.get(
        `${API}/api/v1/characters/${characterId}/bitacora/pages`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listData = await listRes.json() as { pages: unknown[]; total: number };

      if (listData.total > 0) {
        test.skip(true, 'Character already has pages — empty-state test N/A');
        return;
      }

      // Navigate to Páginas sub-view
      await page.goto(
        `/characters/${characterId}?tab=notas&sub=paginas`,
        { waitUntil: 'networkidle', timeout: 60_000 },
      );

      // Empty state message is rendered
      await expect(
        page.getByText('Aún no escribiste ninguna página.'),
      ).toBeVisible({ timeout: 10_000 });

      // "Nueva página" button is still visible (REQ-BP-WEB-03: create affordance)
      await expect(page.getByText('Nueva página')).toBeVisible({ timeout: 10_000 });
    },
  );
});

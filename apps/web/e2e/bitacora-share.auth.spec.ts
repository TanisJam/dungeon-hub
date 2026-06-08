import { test, expect } from '@playwright/test';
import { resolveAccessToken } from './helpers/resolve-access-token';

/**
 * E2E — Bitácora Personal Share @ 375px (iPhone SE)
 *
 * bitacora-personal-share SDD spec #2035 REQ-SHARE-11.
 * Round-trip: share personal page → appears in guild /bitacora feed with
 * "Bitácora" badge → source page shows "Compartido" indicator + no re-share button.
 *
 * Pre-requisites (same as bitacora-pages.auth.spec.ts):
 *   - Stack must be running (see apps/web/e2e/README.md).
 *   - The auth test user must exist (auth.setup.ts).
 *   - The auth user must own an active character (status=active).
 *
 * Mobile-first: 375px viewport. REQ-GATE-03.
 *
 * NOTE: Playwright `selectOption({ label: regex })` does NOT exist.
 * Use exact string or { value: ... } for selectOption calls.
 */

const MOBILE = { width: 375, height: 812 };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.use({ viewport: MOBILE });

/** Resolve the first active character ID for the test user via the API. */
async function resolveCharacterId(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
): Promise<string | null> {
  const res = await request.get(`${API}/api/v1/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return null;
  // GET /characters returns { data: [...] }, not { characters: [...] }.
  const data = await res.json() as { data?: Array<{ id: string; status: string }> };
  const active = (data.data ?? []).find((c) => c.status === 'active');
  return active?.id ?? null;
}

/** Resolve the world ID from the test user's character. */
async function resolveWorldId(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  characterId: string,
): Promise<string | null> {
  const res = await request.get(`${API}/api/v1/characters/${characterId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return null;
  // GET /characters/:id returns the row directly with worldId at the root.
  const data = await res.json() as { worldId?: string };
  return data.worldId ?? null;
}


test.describe('Bitácora Personal Share @ 375px', () => {
  // ---------------------------------------------------------------------------
  // Scenario 1 — Happy path: share a page → feed shows "Bitácora" badge →
  // source page shows "Compartido" indicator + no re-share button
  // ---------------------------------------------------------------------------

  test(
    'REQ-SHARE-11: share page → guild feed shows Bitácora badge → source page shows Compartido',
    async ({ page, request }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Resolve access token from the @supabase/ssr auth cookie (NOT localStorage).
      const accessToken = await resolveAccessToken(page);

      if (!accessToken) {
        test.skip(true, 'Could not resolve access token — ensure auth.setup.ts ran first');
        return;
      }

      const characterId = await resolveCharacterId(request, accessToken);
      if (!characterId) {
        test.skip(true, 'No active character found — create one first');
        return;
      }

      const worldId = await resolveWorldId(request, accessToken, characterId);
      if (!worldId) {
        test.skip(true, 'Could not resolve worldId for character');
        return;
      }

      // 1. Create a bitácora page via the API (unique title to identify in feed)
      const pageTitle = `Share E2E ${Date.now()}`;
      const createRes = await request.post(
        `${API}/api/v1/characters/${characterId}/bitacora/pages`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            title: pageTitle,
            body: 'E2E round-trip test page',
            tags: ['monsters'],
            refs: [],
          },
        },
      );
      expect(createRes.status()).toBe(200);
      const createdData = await createRes.json() as { page: { id: string } };
      const pageId = createdData.page.id;

      try {
        // 2. Navigate to Páginas sub-view and open the page detail
        await page.goto(
          `/characters/${characterId}?tab=notas&sub=paginas`,
          { waitUntil: 'networkidle', timeout: 60_000 },
        );
        await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

        // 3. Find and click the page card (matches title)
        const pageCard = page.getByText(pageTitle).first();
        await expect(pageCard).toBeVisible({ timeout: 15_000 });
        await pageCard.click();

        // 4. Assert share button visible in page detail (page not yet shared)
        const shareBtn = page.getByRole('button', { name: /compartir con el gremio/i });
        await expect(shareBtn).toBeVisible({ timeout: 10_000 });

        // 5. Assert "Compartido" badge NOT visible yet
        await expect(
          page.getByText(/compartido con el gremio/i),
        ).not.toBeVisible({ timeout: 5_000 });

        // 6. Tap "Compartir con el gremio" → confirm panel appears
        await shareBtn.click();

        const confirmBtn = page.getByRole('button', { name: /^compartir$/i });
        await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
        const cancelBtn = page.getByRole('button', { name: /cancelar/i });
        await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

        // 7. Tap [Compartir] to confirm
        await confirmBtn.click();

        // 8. "Compartido" badge appears on the page detail
        await expect(
          page.getByText(/compartido con el gremio/i),
        ).toBeVisible({ timeout: 15_000 });

        // 9. "Compartir con el gremio" button no longer visible (no re-share affordance)
        await expect(
          page.getByRole('button', { name: /compartir con el gremio/i }),
        ).not.toBeVisible({ timeout: 5_000 });

        // 10. Navigate to /bitacora guild feed
        await page.goto('/bitacora', { waitUntil: 'networkidle', timeout: 60_000 });
        await expect(page).toHaveURL(/\/bitacora/, { timeout: 10_000 });

        // 11. Assert the shared page's contribution card appears with "Bitácora" badge
        // The feed card for a shared page shows "Bitácora" pill (ADR-7 REQ-SHARE-07)
        // We locate the title first, then find the parent article and check for the badge
        const titleLocator = page.getByText(pageTitle).first();
        await expect(titleLocator).toBeVisible({ timeout: 20_000 });

        // Find the feed-card article containing the page title
        const feedCard = page.locator('article').filter({ hasText: pageTitle });
        await expect(feedCard.getByText('Bitácora')).toBeVisible({ timeout: 10_000 });

      } finally {
        // Cleanup: delete the test page (which also cascades via ON DELETE SET NULL on contribution)
        await request.delete(
          `${API}/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario 2 — Cancel aborts: tap Cancelar → no share, no Compartido badge
  // ---------------------------------------------------------------------------

  test(
    'REQ-SHARE-11 cancel: confirm panel visible → tap Cancelar → page unchanged',
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

      // Create a page for cancel test
      const pageTitle = `Cancel E2E ${Date.now()}`;
      const createRes = await request.post(
        `${API}/api/v1/characters/${characterId}/bitacora/pages`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            title: pageTitle,
            body: 'Cancel test page',
            tags: ['lore'],
            refs: [],
          },
        },
      );
      expect(createRes.status()).toBe(200);
      const createdData = await createRes.json() as { page: { id: string } };
      const pageId = createdData.page.id;

      try {
        await page.goto(
          `/characters/${characterId}?tab=notas&sub=paginas`,
          { waitUntil: 'networkidle', timeout: 60_000 },
        );

        // Open the page detail
        const pageCard = page.getByText(pageTitle).first();
        await expect(pageCard).toBeVisible({ timeout: 15_000 });
        await pageCard.click();

        // Tap "Compartir con el gremio"
        const shareBtn = page.getByRole('button', { name: /compartir con el gremio/i });
        await expect(shareBtn).toBeVisible({ timeout: 10_000 });
        await shareBtn.click();

        // Confirm panel appears
        const cancelBtn = page.getByRole('button', { name: /cancelar/i });
        await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

        // Tap [Cancelar]
        await cancelBtn.click();

        // Confirm panel gone
        await expect(
          page.getByRole('button', { name: /cancelar/i }),
        ).not.toBeVisible({ timeout: 5_000 });

        // "Compartido" badge NOT visible — share was aborted
        await expect(
          page.getByText(/compartido con el gremio/i),
        ).not.toBeVisible({ timeout: 5_000 });

        // "Compartir con el gremio" button is back (share affordance restored)
        await expect(
          page.getByRole('button', { name: /compartir con el gremio/i }),
        ).toBeVisible({ timeout: 5_000 });

      } finally {
        await request.delete(
          `${API}/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
      }
    },
  );
});

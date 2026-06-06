import { test, expect } from '@playwright/test';

/**
 * E2E — Character Codex Browser @ 375px (iPhone SE) — UPDATED for Slice 1'
 *
 * SDD character-codex-browser (Slice 1'):
 *   REQ-CCB-WEB-01: grid page shows "N de M descubiertos" per category.
 *   REQ-CCB-WEB-02: /codex/monsters player view — known monsters in CodexList.
 *   REQ-CCB-MIG-01: /codex/bestiario redirects (not 404).
 *   REQ-CCB-MIG-02: E2E updated same slice as bespoke page removal.
 *
 * HOUSE RULE: Bestiary statblock gating — no RAW basis (PHB p.177-179).
 * DM grants a monster → player sees it. Ungranted monsters NOT in player DOM.
 *
 * DOM model change from old bestiario page:
 *   OLD: [data-monster-slug] attributes on individual monster rows
 *   NEW: CodexList buttons rendered by MonsterRowView (no data-monster-slug)
 *        Row tap opens DetailSheet. No silhouette "???" tiles in player view.
 *
 * Pre-requisites:
 *   - Stack must be running (see apps/web/e2e/README.md).
 *   - The auth test user must exist (created by auth.setup.ts).
 *   - The auth user must own an active character (status=active) and be GM of its world.
 *   - The compendium must have at least one monster (run pnpm import:5etools if needed).
 *
 * NOTE: This spec uses the auth test user (e2e/.auth/user.json) who is assumed
 * to be the DM/owner of a test character. The character ID is resolved dynamically
 * from the API so the spec is not tightly coupled to a specific UUID.
 *
 * Stack must be running (see apps/web/e2e/README.md).
 * Hydration: hydrated islands must be loaded before clicking — use networkidle.
 */

const MOBILE = { width: 375, height: 667 };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.use({ viewport: MOBILE });

/**
 * Resolve the first active character ID for the test user by calling the API.
 * Returns null if none found (test will skip gracefully).
 */
async function resolveCharacterId(request: import('@playwright/test').APIRequestContext, accessToken: string): Promise<string | null> {
  const res = await request.get(`${API}/api/v1/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return null;
  const data = await res.json() as { characters?: Array<{ id: string; status: string }> };
  const active = (data.characters ?? []).find((c) => c.status === 'active');
  return active?.id ?? null;
}

/**
 * Resolve the first monster slug/source from the compendium.
 */
async function resolveFirstMonster(request: import('@playwright/test').APIRequestContext, accessToken: string): Promise<{ slug: string; source: string; name: string } | null> {
  const res = await request.get(`${API}/api/v1/compendium/monsters?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return null;
  const data = await res.json() as { data?: Array<{ slug: string; source: string; name: string }> };
  return data.data?.[0] ?? null;
}

test.describe.skip('Character Codex Browser @ 375px', () => {
  // W1 Biblioteca: world-knowledge gated surface deleted; re-enabled by Bitácora wave
  test(
    'DM grants a monster → player codex shows it as known in CodexList',
    async ({ page, request }) => {
      // Navigate to home first to capture the session token
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Get the auth token from the page (via localStorage/cookie)
      const accessToken = await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.includes('supabase') && key.includes('token')) {
            try {
              const val = JSON.parse(localStorage.getItem(key) ?? '{}');
              return val.access_token ?? val.currentSession?.access_token ?? null;
            } catch { return null; }
          }
        }
        return null;
      });

      if (!accessToken) {
        test.skip(true, 'Could not resolve access token — ensure auth.setup.ts ran first');
        return;
      }

      const characterId = await resolveCharacterId(request, accessToken);
      if (!characterId) {
        test.skip(true, 'No active character found for test user — create one first');
        return;
      }

      const monster = await resolveFirstMonster(request, accessToken);
      if (!monster) {
        test.skip(true, 'No monsters in compendium — run pnpm import:5etools first');
        return;
      }

      // 1. Grant the monster via API (DM grant)
      const grantRes = await request.post(
        `${API}/api/v1/characters/${characterId}/knowledge`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data: { kind: 'bestiary', refKey: monster.slug, refSource: monster.source },
        },
      );
      expect(grantRes.status()).toBe(200);

      // 2. Navigate to /characters/:id/codex (grid page — replaces /codex/bestiario)
      await page.goto(`/characters/${characterId}/codex`, { waitUntil: 'networkidle', timeout: 60_000 });
      await expect(page).toHaveURL(/\/codex$/, { timeout: 15_000 });

      // 3. Grid page: "N de M descubiertos" progress text visible (REQ-CCB-WEB-01)
      await expect(page.getByText(/descubiertos/)).toBeVisible({ timeout: 10_000 });

      // 4. Navigate to /characters/:id/codex/monsters (the scoped list)
      await page.goto(`/characters/${characterId}/codex/monsters`, { waitUntil: 'networkidle', timeout: 60_000 });
      await expect(page).toHaveURL(/\/codex\/monsters/, { timeout: 15_000 });

      // 5. The granted monster appears in CodexList with its name
      await expect(page.getByText(monster.name)).toBeVisible({ timeout: 10_000 });

      // 6. No horizontal overflow at 375px (REQ-CCB-WEB-02)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, 'No horizontal overflow at 375px').toBeLessThanOrEqual(375);
    },
  );

  test(
    'Ungranted monster NOT in player DOM — statblock data absent (REQ-CCB-WEB-02)',
    async ({ page, request }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const accessToken = await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.includes('supabase') && key.includes('token')) {
            try {
              const val = JSON.parse(localStorage.getItem(key) ?? '{}');
              return val.access_token ?? val.currentSession?.access_token ?? null;
            } catch { return null; }
          }
        }
        return null;
      });

      if (!accessToken) {
        test.skip(true, 'Could not resolve access token');
        return;
      }

      const characterId = await resolveCharacterId(request, accessToken);
      if (!characterId) {
        test.skip(true, 'No active character found');
        return;
      }

      // Check if tarrasque is in the player's known list first
      const knownRes = await request.get(`${API}/api/v1/characters/${characterId}/knowledge/monsters`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const knownData = await knownRes.json() as { rows: Array<{ slug: string }> };
      const knowsTarrasque = knownData.rows.some((r) => r.slug === 'tarrasque');

      await page.goto(`/characters/${characterId}/codex/monsters`, { waitUntil: 'networkidle', timeout: 60_000 });
      await expect(page).toHaveURL(/\/codex\/monsters/, { timeout: 15_000 });

      if (!knowsTarrasque) {
        // CRITICAL: CodexList (player view) only renders API-returned rows.
        // Ungranted monsters never appear — API gate + no silhouette DOM.
        // [data-monster-slug] is gone — we check by monster name absence.
        const tarrasqueEl = page.getByText('Tarrasque');
        const count = await tarrasqueEl.count();
        expect(count, 'Ungranted tarrasque must not appear in player CodexList').toBe(0);

        // Also confirm no [data-monster-slug] attributes (old DOM model removed)
        const slugAttrCount = await page.locator('[data-monster-slug]').count();
        expect(slugAttrCount, '[data-monster-slug] DOM model removed — CodexList uses MonsterRowView buttons').toBe(0);
      }
      // If user knows the tarrasque — test is N/A (skip assertion)
    },
  );

  test(
    'REQ-CCB-MIG-01: /codex/bestiario redirects to /codex or /codex/monsters (no 404)',
    async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Resolve a character ID via page cookies
      const accessToken = await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.includes('supabase') && key.includes('token')) {
            try {
              const val = JSON.parse(localStorage.getItem(key) ?? '{}');
              return val.access_token ?? val.currentSession?.access_token ?? null;
            } catch { return null; }
          }
        }
        return null;
      });

      if (!accessToken) {
        test.skip(true, 'Could not resolve access token');
        return;
      }

      // Use a known UUID format — we don't need an actual valid character ID for the redirect test.
      // The redirect page.tsx redirects before any DB access.
      // Use a fake UUID to trigger the redirect without DB dependencies.
      const fakeCharId = '00000000-0000-0000-0000-000000000099';
      await page.goto(`/characters/${fakeCharId}/codex/bestiario`, { waitUntil: 'networkidle', timeout: 30_000 });

      // Must redirect (URL must not contain /bestiario after redirect settles)
      // The page may 404 on the redirect target (fake character) — that's OK.
      // What we assert is that /bestiario is NOT the final URL (redirect happened).
      const finalUrl = page.url();
      expect(finalUrl, 'bestiario URL must redirect — not stay on /bestiario').not.toMatch(/\/codex\/bestiario/);
    },
  );
});

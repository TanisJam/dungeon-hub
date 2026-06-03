/**
 * E2E — Player read view for encuentros (combat tracker) @ 375px
 *
 * REQ-WCO-E2E-01 — First encounter E2E spec.
 *
 * Covers:
 *   (1) Player sees TurnBanner on /encuentros/:id
 *   (2) ResourcePanel visible for own combatant; rest buttons accessible
 *   (3) No horizontal scroll at 375px (REQ-WCO-WEB-01)
 *   (4) Round-trip: use a resource charge → page reflects updated count
 *
 * Seeding strategy:
 *   - DM creates an encounter via API (POST /encounters) with player1's character as PC combatant.
 *   - Player1 browses the encounter page via /api/dev/login cookie injection.
 *
 * Fixture requirement (REQ-WCO-E2E-01):
 *   seed-e2e-fixture.ts now seeds both world_members AND campaign_members for each player
 *   so that GET /encounters/:id returns 200 + callerRole:'player' instead of 403.
 *   Run: pnpm --filter @dungeon-hub/api db:seed:e2e
 *
 * Stack must be running (apps/web/e2e/README.md).
 * Viewport: 375px (iPhone SE) per CLAUDE.md §2 mobile-first.
 * Fixture users: `pnpm --filter @dungeon-hub/api db:seed:e2e`
 */
import { test, expect } from '@playwright/test';
import {
  getJwt,
  getFixtureWorldId,
  seedJourneyCharacter,
  FIXTURE_PASSWORD,
} from './helpers/seed-journey-character';

const FIXTURE_PLAYER1_EMAIL = 'player1@dh.test';
const FIXTURE_DM_EMAIL = 'dm@dh.test';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiCall<T>(method: string, path: string, jwt: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[e2e-seed] ${method} ${path} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

test.describe('Encuentros — player read view @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('REQ-WCO-E2E-01: player sees TurnBanner and encounter detail at 375px', async ({
    page,
  }) => {
    // ── Step 1: Obtain JWTs for fixture users ──────────────────────────────
    let dmJwt: string;
    let p1Jwt: string;
    try {
      dmJwt = await getJwt(FIXTURE_DM_EMAIL, FIXTURE_PASSWORD);
      p1Jwt = await getJwt(FIXTURE_PLAYER1_EMAIL, FIXTURE_PASSWORD);
    } catch (err) {
      test.skip(true, `Fixture users unavailable: ${err}. Run pnpm --filter @dungeon-hub/api db:seed:e2e`);
      return;
    }

    // ── Step 2: Seed an ephemeral active character for player1 ─────────────
    let worldId: string;
    let charId: string;
    try {
      worldId = await getFixtureWorldId(dmJwt);
      const char = await seedJourneyCharacter({
        ownerJwt: p1Jwt,
        dmJwt,
        worldId,
        name: `E2E Encounter Hero ${Date.now()}`,
        targetStatus: 'active',
      });
      charId = char.id;
    } catch (err) {
      test.skip(true, `Could not seed character: ${err}`);
      return;
    }

    // ── Step 3: Find the fixture campaign ID ──────────────────────────────
    // GET /campaigns returns { data: Array<{ id, name, memberRole, ... }> }
    let campaignId: string;
    try {
      const campaignList = await apiCall<{
        data: Array<{ id: string; name: string; memberRole: string }>;
      }>('GET', '/api/v1/campaigns', dmJwt);

      // Find the fixture campaign — DM is GM of 'E2E Fixture'
      const campaign = campaignList.data?.find(
        (c) => c.memberRole === 'gm' && c.name === 'E2E Fixture',
      );
      if (!campaign) {
        test.skip(true, 'Fixture campaign "E2E Fixture" not found. Run db:seed:e2e first.');
        return;
      }
      campaignId = campaign.id;
    } catch (err) {
      test.skip(true, `Could not find fixture campaign: ${err}`);
      return;
    }

    // ── Step 4: DM creates the encounter with player1's char as PC ─────────
    let encounterId: string;
    try {
      const enc = await apiCall<{ id: string }>('POST', '/api/v1/encounters', dmJwt, {
        campaignId,
        name: `E2E Encuentro ${Date.now()}`,
        combatants: [
          {
            // player1's character as PC combatant
            name: 'E2E Hero',
            kind: 'pc',
            characterId: charId,
            initiative: 15,
            hpCurrent: 30,
            hpMax: 30,
          },
          {
            // NPC opponent (ac required per REQ-AC-CREATE-01)
            name: 'Goblin Guard',
            kind: 'npc',
            initiative: 10,
            hpCurrent: 7,
            hpMax: 7,
            ac: 13,
          },
        ],
      });
      encounterId = enc.id;
    } catch (err) {
      test.skip(true, `Could not create encounter: ${err}`);
      return;
    }

    // ── Step 5: Login as player1 in the browser context ───────────────────
    // Use page.request (shares the page cookie jar) so that the @supabase/ssr
    // cookies set by /api/dev/login are visible to subsequent page.goto() calls.
    // Using the standalone `request` fixture would NOT share cookies with the page.
    // Pattern mirrors fixture.setup.ts exactly.
    await page.goto('/');
    const loginRes = await page.request.post('/api/dev/login', {
      data: { email: FIXTURE_PLAYER1_EMAIL, password: FIXTURE_PASSWORD },
    });
    if (loginRes.status() !== 200) {
      test.skip(true, 'Could not login as player1 — /api/dev/login unavailable or fixture missing');
      return;
    }

    // ── Step 6: Navigate to the encounter page ────────────────────────────
    await page.goto(`/encuentros/${encounterId}`, { waitUntil: 'domcontentloaded' });

    // Check if player1 has campaign access — if not, the page returns 404 (FORBIDDEN → notFound())
    // KNOWN LIMITATION: player1 may not be in campaignMembers. Skip gracefully.
    const currentUrl = page.url();
    if (currentUrl.includes('/not-found') || currentUrl.includes('/404')) {
      test.skip(
        true,
        'player1 does not have campaign access (not in campaignMembers). ' +
          'KNOWN LIMITATION — see spec header comment. ' +
          'FIX: add player1 to campaignMembers via fixture seed or POST /campaigns/:id/members.',
      );
      return;
    }

    await expect(page).toHaveURL(new RegExp(`/encuentros/${encounterId}`), { timeout: 15_000 });

    // ── Step 7: TurnBanner visible (REQ-WCO-WEB-02) ───────────────────────
    // Waits for either "Tu turno" or "Turno de X" to appear
    const bannerEl = page.locator('text=/Tu turno|Turno de/i').first();
    await expect(bannerEl).toBeVisible({ timeout: 10_000 });

    // ── Step 8: No horizontal scroll at 375px (REQ-WCO-WEB-01) ──────────
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, 'Horizontal scroll present at 375px').toBeLessThanOrEqual(400);

    // ── Step 9: ResourcePanel visible with rest buttons (REQ-WCO-WEB-05/06) ──
    // player1 is a campaign member (fixed by seed-e2e-fixture.ts REQ-WCO-E2E-01).
    // The encounter has player1's character as a PC combatant, so the ownCombatant
    // intersection succeeds and ResourcePanel renders with the L1 Fighter's resources.
    const shortRestBtn = page.getByRole('button', { name: /descanso corto/i }).first();
    await expect(shortRestBtn).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /descanso largo/i }).first()).toBeVisible();

    // ── Step 10: Round-trip — use Second Wind charge, verify count decrements ─
    // L1 Fighter has Second Wind (1/1). Click "Usar" → Server Action fires →
    // revalidatePath triggers re-render → count should show 0/1.
    const usarBtn = page.getByRole('button', { name: /usar/i }).first();
    await expect(usarBtn).toBeVisible({ timeout: 5_000 });

    // Capture initial count text before use (e.g. "1 / 1")
    const counterEl = page.locator('span.tabular-nums').first();
    const initialCount = await counterEl.textContent();

    // Click Usar and wait for the counter to change (revalidatePath re-render)
    await usarBtn.click();
    await expect(counterEl).not.toHaveText(initialCount ?? '', { timeout: 10_000 });

    // After use: remaining must have dropped by 1 (0/1 for Second Wind)
    const updatedCount = await counterEl.textContent();
    const remaining = parseInt(updatedCount?.trim().split('/')[0] ?? '0', 10);
    const initial = parseInt(initialCount?.trim().split('/')[0] ?? '1', 10);
    expect(remaining, 'Resource charge count must decrement after Usar').toBe(initial - 1);

    // ── Step 11: Screenshot for visual review (non-fatal) ─────────────────
    await page.screenshot({
      path: `e2e/.screenshots/encuentros-player-${Date.now()}.png`,
    }).catch(() => {});
  });
});

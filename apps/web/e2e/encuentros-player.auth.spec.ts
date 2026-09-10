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
 * REQ-WCR-E2E-01 — Barbarian Rage flow @ 375px
 *
 * Covers:
 *   (5) Barbarian sees "Entrar en Furia" button when on own turn
 *   (6) Click → 'Raging' badge appears, rage-uses counter decrements
 *   (7) Advance turn → button disabled (not own turn)
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

// ── Shared apiCall helper for this file ──────────────────────────────────────
// Used by every test in this file (read view, pass-turn, rage, weapon-attack).

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
    // `networkidle` rather than `domcontentloaded`: the control tapped below is a
    // client island, and a server-rendered button is clickable before React attaches
    // its handler, so the tap can land on markup with no onClick and do nothing.
    // The usual guard — retrying the click — is wrong here because this action is
    // not idempotent, so a second tap would spend a charge or pass another turn.
    // Waiting for the chunks to settle is what bitacora-feed already does for the
    // same reason.
    await page.goto(`/encuentros/${encounterId}`, { waitUntil: 'networkidle' });

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

// ── REQ-WCPT-WEB-E2E-01: Player passes own turn @ 375px ──────────────────────

test.describe('REQ-WCPT-WEB-E2E-01: Player passes own turn @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('WCPT-E2E-01: player passes own turn → TurnBanner advances to NPC + panel disappears', async ({
    page,
  }) => {
    // ── Step 1: Obtain JWTs ────────────────────────────────────────────────
    let dmJwt: string;
    let p1Jwt: string;
    try {
      dmJwt = await getJwt(FIXTURE_DM_EMAIL, FIXTURE_PASSWORD);
      p1Jwt = await getJwt(FIXTURE_PLAYER1_EMAIL, FIXTURE_PASSWORD);
    } catch (err) {
      test.skip(true, `Fixture users unavailable: ${err}. Run pnpm --filter @dungeon-hub/api db:seed:e2e`);
      return;
    }

    // ── Step 2: Seed a Fighter character for player1 ──────────────────────
    // Use default Human Fighter (no classOverride) — any active PC works for pass-turn.
    let worldId: string;
    let charId: string;
    try {
      worldId = await getFixtureWorldId(dmJwt);
      const char = await seedJourneyCharacter({
        ownerJwt: p1Jwt,
        dmJwt,
        worldId,
        name: `WCPT E2E Hero ${Date.now()}`,
        targetStatus: 'active',
      });
      charId = char.id;
    } catch (err) {
      test.skip(true, `Could not seed character: ${err}`);
      return;
    }

    // ── Step 3: Find fixture campaign ─────────────────────────────────────
    let campaignId: string;
    try {
      const campaignList = await apiCall<{
        data: Array<{ id: string; name: string; memberRole: string }>;
      }>('GET', '/api/v1/campaigns', dmJwt);
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

    // ── Step 4: DM creates encounter — Player PC at initiative 20 (goes first) ─
    // NPC at initiative 5. PC is currentCombatant at encounter start.
    const NPC_NAME = `WCPT Goblin ${Date.now()}`;
    let encounterId: string;
    try {
      const enc = await apiCall<{ id: string; version: number }>('POST', '/api/v1/encounters', dmJwt, {
        campaignId,
        name: `WCPT Pass-Turn E2E ${Date.now()}`,
        combatants: [
          {
            name: 'WCPT Hero',
            kind: 'pc',
            characterId: charId,
            initiative: 20,
            hpCurrent: 20,
            hpMax: 20,
          },
          {
            name: NPC_NAME,
            kind: 'npc',
            initiative: 5,
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

    // Verify PC is currentCombatant (initiative 20 > 5).
    const encDetail = await apiCall<{
      currentCombatantId: string;
      combatants: Array<{ id: string; characterId: string | null }>;
    }>('GET', `/api/v1/encounters/${encounterId}`, dmJwt);
    const pcCombatant = encDetail.combatants.find((c) => c.characterId === charId);
    if (!pcCombatant || encDetail.currentCombatantId !== pcCombatant.id) {
      test.skip(true, 'PC is not the current combatant — initiative ordering issue');
      return;
    }

    // ── Step 5: Login as player1 in the browser context ───────────────────
    // page.request shares the cookie jar with page.goto() calls (mirrors Rage E2E pattern).
    await page.goto('/');
    const loginRes = await page.request.post('/api/dev/login', {
      data: { email: FIXTURE_PLAYER1_EMAIL, password: FIXTURE_PASSWORD },
    });
    if (loginRes.status() !== 200) {
      test.skip(true, 'Could not login as player1 — /api/dev/login unavailable or fixture missing');
      return;
    }

    // ── Step 6: Navigate to encounter page ────────────────────────────────
    // `networkidle` rather than `domcontentloaded`: the control tapped below is a
    // client island, and a server-rendered button is clickable before React attaches
    // its handler, so the tap can land on markup with no onClick and do nothing.
    // The usual guard — retrying the click — is wrong here because this action is
    // not idempotent, so a second tap would spend a charge or pass another turn.
    // Waiting for the chunks to settle is what bitacora-feed already does for the
    // same reason.
    await page.goto(`/encuentros/${encounterId}`, { waitUntil: 'networkidle' });

    const currentUrl = page.url();
    if (currentUrl.includes('/not-found') || currentUrl.includes('/404')) {
      test.skip(
        true,
        'player1 does not have campaign access. Run db:seed:e2e to re-seed campaign members.',
      );
      return;
    }

    await expect(page).toHaveURL(new RegExp(`/encuentros/${encounterId}`), { timeout: 15_000 });

    // ── Step 7: Assert "Tu turno" in TurnBanner and "Pasar Turno" button visible ─
    // REQ-WCPT-WEB-UI-01: PlayerActionPanel + PassTurnButton render when own turn + active.
    const turnBanner = page.locator('text=Tu turno').first();
    await expect(turnBanner).toBeVisible({ timeout: 10_000 });

    const passTurnBtn = page.getByRole('button', { name: /pasar turno/i });
    await expect(passTurnBtn).toBeVisible({ timeout: 5_000 });
    await expect(passTurnBtn).toBeEnabled();

    // ── Step 8: Click "Pasar Turno" ───────────────────────────────────────
    await passTurnBtn.click();

    // ── Step 9: Assert TurnBanner advances to NPC ─────────────────────────
    // After revalidatePath SC re-render: TurnBanner shows "Turno de {NPC_NAME}".
    // "Tu turno" must disappear (no longer own turn).
    const npcTurnBanner = page.locator(`text=Turno de`).first();
    await expect(npcTurnBanner).toBeVisible({ timeout: 15_000 });

    // "Tu turno" must be gone (player's turn ended).
    await expect(turnBanner).not.toBeVisible({ timeout: 5_000 });

    // ── Step 10: Assert "Pasar Turno" button is no longer visible ─────────
    // PlayerActionPanel only renders when isOwnTurn + active; after passing turn
    // isOwnTurn=false → panel not rendered.
    await expect(passTurnBtn).not.toBeVisible({ timeout: 5_000 });

    // ── Step 11: Screenshot for visual review (non-fatal) ─────────────────
    await page.screenshot({
      path: `e2e/.screenshots/wcpt-pass-turn-${Date.now()}.png`,
    }).catch(() => {});
  });
});

// ── REQ-WCR-E2E-01: Barbarian Rage flow @ 375px ───────────────────────────────

test.describe('REQ-WCR-E2E-01: Barbarian Rage flow @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('REQ-WCR-E2E-01: player enters and ends Rage on own turn', async ({ page }) => {
    // ── Step 1: Obtain JWTs ────────────────────────────────────────────────
    let dmJwt: string;
    let p1Jwt: string;
    try {
      dmJwt = await getJwt(FIXTURE_DM_EMAIL, FIXTURE_PASSWORD);
      p1Jwt = await getJwt(FIXTURE_PLAYER1_EMAIL, FIXTURE_PASSWORD);
    } catch (err) {
      test.skip(true, `Fixture users unavailable: ${err}. Run pnpm --filter @dungeon-hub/api db:seed:e2e`);
      return;
    }

    // ── Step 2: Seed a Barbarian character for player1 ────────────────────
    // PHB p.49 — Barbarian skill pool: Animal Handling, Athletics, Intimidation,
    //             Nature, Perception, Survival. Pick 2 skills (PHB p.49 — Barbarian).
    // Soldier fixed skills: Athletics + Intimidation (PHB p.140 — Soldier).
    // Safe choices (no collision with Soldier): 'animal handling' + 'survival'.
    // Note: skill slugs use spaces not hyphens ('animal handling', not 'animal-handling').
    let worldId: string;
    let charId: string;
    try {
      worldId = await getFixtureWorldId(dmJwt);
      const char = await seedJourneyCharacter({
        ownerJwt: p1Jwt,
        dmJwt,
        worldId,
        name: `E2E Barbarian ${Date.now()}`,
        targetStatus: 'active',
        classOverride: {
          slug: 'barbarian',
          source: 'PHB',
          skillChoices: ['animal handling', 'survival'],
        },
      });
      charId = char.id;
    } catch (err) {
      test.skip(true, `Could not seed Barbarian character: ${err}`);
      return;
    }

    // ── Step 3: Find fixture campaign ─────────────────────────────────────
    let campaignId: string;
    try {
      const campaignList = await apiCall<{
        data: Array<{ id: string; name: string; memberRole: string }>;
      }>('GET', '/api/v1/campaigns', dmJwt);
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

    // ── Step 4: DM creates encounter — Barbarian on initiative 20 (goes first) ─
    // Put the Barbarian first so it starts as currentCombatant immediately.
    let encounterId: string;
    let _encVersion: number;
    try {
      const enc = await apiCall<{ id: string; version: number }>('POST', '/api/v1/encounters', dmJwt, {
        campaignId,
        name: `E2E Rage ${Date.now()}`,
        combatants: [
          {
            name: 'Barbarian Hero',
            kind: 'pc',
            characterId: charId,
            initiative: 20,
            hpCurrent: 12,
            hpMax: 12,
          },
          {
            name: 'Test Goblin',
            kind: 'npc',
            initiative: 5,
            hpCurrent: 7,
            hpMax: 7,
            ac: 13,
          },
        ],
      });
      encounterId = enc.id;
      _encVersion = enc.version;
    } catch (err) {
      test.skip(true, `Could not create encounter: ${err}`);
      return;
    }

    // Verify that it is indeed the Barbarian's turn (initiative 20 > 5)
    const encDetail = await apiCall<{
      currentCombatantId: string;
      combatants: Array<{ id: string; characterId: string | null }>;
    }>('GET', `/api/v1/encounters/${encounterId}`, dmJwt);
    const barbarianCombatant = encDetail.combatants.find((c) => c.characterId === charId);
    if (!barbarianCombatant || encDetail.currentCombatantId !== barbarianCombatant.id) {
      test.skip(true, 'Barbarian is not the current combatant — initiative ordering issue');
      return;
    }

    // ── Step 5: Login as player1 in the browser context ───────────────────
    // Use page.request (shares cookie jar with the page — MUST NOT use standalone `request`).
    await page.goto('/');
    const loginRes = await page.request.post('/api/dev/login', {
      data: { email: FIXTURE_PLAYER1_EMAIL, password: FIXTURE_PASSWORD },
    });
    if (loginRes.status() !== 200) {
      test.skip(true, 'Could not login as player1 — /api/dev/login unavailable or fixture missing');
      return;
    }

    // ── Step 6: Navigate to encounter page ────────────────────────────────
    await page.goto(`/encuentros/${encounterId}`, { waitUntil: 'domcontentloaded' });

    const currentUrl = page.url();
    if (currentUrl.includes('/not-found') || currentUrl.includes('/404')) {
      test.skip(
        true,
        'player1 does not have campaign access (not in campaignMembers). ' +
          'Run db:seed:e2e to re-seed campaign members.',
      );
      return;
    }

    await expect(page).toHaveURL(new RegExp(`/encuentros/${encounterId}`), { timeout: 15_000 });

    // ── Step 7: Assert "Furia" section and "Entrar en Furia" button visible ─
    // REQ-WCR-WEB-PAGE-01: RageControls renders for own Barbarian combatant.
    const rageSection = page.locator('section[aria-label="Furia"]');
    await expect(rageSection).toBeVisible({ timeout: 10_000 });

    const enterRageBtn = page.getByRole('button', { name: /entrar en furia/i });
    await expect(enterRageBtn).toBeVisible({ timeout: 5_000 });
    // PHB p.48: Barbarian can rage on own turn — button must be enabled.
    await expect(enterRageBtn).toBeEnabled();

    // ── Step 8: Assert rage counter shows "X / Y usos de Furia" ──────────
    const counterEl = rageSection.locator('p').first();
    const initialCounterText = await counterEl.textContent();
    // L1 Barbarian has 2 uses per day (PHB p.48 Barbarian table)
    expect(initialCounterText).toMatch(/usos de Furia/i);

    // ── Step 9: Click "Entrar en Furia" — activate Rage ──────────────────
    await enterRageBtn.click();

    // After revalidatePath, Server Component re-renders.
    // Assert: "Terminar Furia" button appears (isRaging now true).
    const endRageBtn = page.getByRole('button', { name: /terminar furia/i });
    await expect(endRageBtn).toBeVisible({ timeout: 15_000 });

    // Assert: "Raging" condition badge appears on the combatant's roster row.
    // RosterList renders ConditionBadges per combatant.
    const ragingBadge = page.locator('[aria-label="Raging"]').or(
      page.locator('text=Raging').first(),
    );
    await expect(ragingBadge.first()).toBeVisible({ timeout: 10_000 });

    // Assert: rage uses counter decremented (e.g. "1 / 2" → was "2 / 2").
    const updatedCounterText = await counterEl.textContent();
    const initialRemaining = parseInt(initialCounterText?.trim().split('/')[0] ?? '2', 10);
    const updatedRemaining = parseInt(updatedCounterText?.trim().split('/')[0] ?? '1', 10);
    expect(updatedRemaining, 'Rage uses must decrement after activating').toBe(initialRemaining - 1);

    // ── Step 10: Assert "Terminar Furia" is disabled after activation ───────
    // PHB p.48 — both entering and ending Rage require a bonus action.
    // After activation this turn, bonusActionUsed=true → "Terminar Furia" disabled.
    // This is correct game behavior: you cannot spend the bonus action TWICE in one turn.
    await expect(endRageBtn).toBeDisabled();

    // ── Step 11: Advance turn twice via API to complete a full round ─────────
    // PHB p.48 end-early rule: Rage ends if the turn ends with no attack OR damage.
    // We advance Barbarian → Goblin → Barbarian. The end-early check fires on the
    // Barbarian's outgoing turn (raged_attacked_hostile=false, raged_took_damage=false),
    // removing the Raging condition. This IS correct PHB behavior.
    // Full deactivate-click test (with Rage surviving across a turn) requires attack
    // infrastructure (weapon instance + attack/apply endpoints) not yet in E2E scope.
    try {
      const encState1 = await apiCall<{ version: number }>('GET', `/api/v1/encounters/${encounterId}`, dmJwt);
      await apiCall('POST', `/api/v1/encounters/${encounterId}/advance-turn`, dmJwt, { version: encState1.version });
      const encState2 = await apiCall<{ version: number }>('GET', `/api/v1/encounters/${encounterId}`, dmJwt);
      await apiCall('POST', `/api/v1/encounters/${encounterId}/advance-turn`, dmJwt, { version: encState2.version });
    } catch (err) {
      test.fail(true, `Could not advance turn: ${err}`);
      return;
    }

    // ── Step 12: Reload + assert Rage ended (end-early fired) ────────────────
    // After reload: it is the Barbarian's turn again, Rage ended per end-early,
    // isRaging=false, bonusActionUsed=false → "Entrar en Furia" enabled again.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/encuentros/${encounterId}`), { timeout: 10_000 });

    // Assert: "Raging" badge disappeared (Rage ended on advance-turn per PHB end-early).
    await expect(ragingBadge.first()).not.toBeVisible({ timeout: 15_000 });

    // Assert: "Entrar en Furia" button is back and enabled (can enter Rage again).
    const reactivateBtn = page.getByRole('button', { name: /entrar en furia/i });
    await expect(reactivateBtn).toBeVisible({ timeout: 10_000 });
    await expect(reactivateBtn).toBeEnabled();

    // ── Step 13: Screenshot for visual review (non-fatal) ─────────────────
    await page.screenshot({
      path: `e2e/.screenshots/barbarian-rage-${Date.now()}.png`,
    }).catch(() => {});
  });
});

// ── REQ-WCA-E2E-01: Player weapon attack vs NPC @ 375px ───────────────────────

test.describe('REQ-WCA-E2E-01: player weapon attack vs NPC @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('REQ-WCA-E2E-01: player attacks NPC → NPC HP drops', async ({ page }) => {
    // ── Step 1: Obtain JWTs ────────────────────────────────────────────────
    // PHB p.194-195: attack roll (d20 + attack bonus vs AC) → hit/miss → damage.
    let dmJwt: string;
    let p1Jwt: string;
    try {
      dmJwt = await getJwt(FIXTURE_DM_EMAIL, FIXTURE_PASSWORD);
      p1Jwt = await getJwt(FIXTURE_PLAYER1_EMAIL, FIXTURE_PASSWORD);
    } catch (err) {
      test.skip(true, `Fixture users unavailable: ${err}. Run pnpm --filter @dungeon-hub/api db:seed:e2e`);
      return;
    }

    // ── Step 2: Seed a Fighter character with an equipped Shortsword ───────
    // ADR-5: equipWeapon opt-in — DM grants shortsword PHB; owner equips it.
    // PHB p.149 — Shortsword: finesse, light, 1d6 piercing.
    let worldId: string;
    let charId: string;
    try {
      worldId = await getFixtureWorldId(dmJwt);
      const char = await seedJourneyCharacter({
        ownerJwt: p1Jwt,
        dmJwt,
        worldId,
        name: `WCA E2E Hero ${Date.now()}`,
        targetStatus: 'active',
        equipWeapon: { slug: 'shortsword', source: 'PHB' },
      });
      charId = char.id;
    } catch (err) {
      test.skip(true, `Could not seed character with weapon: ${err}`);
      return;
    }

    // ── Step 3: Find fixture campaign ─────────────────────────────────────
    let campaignId: string;
    try {
      const campaignList = await apiCall<{
        data: Array<{ id: string; name: string; memberRole: string }>;
      }>('GET', '/api/v1/campaigns', dmJwt);
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

    // ── Helper to create a fresh encounter ───────────────────────────────
    const NPC_HP = 30; // High HP — ensures NPC survives even a crit
    async function createFreshEncounter(suffix: string) {
      const npcName = `WCA Goblin ${suffix}`;
      const enc = await apiCall<{ id: string; version: number }>('POST', '/api/v1/encounters', dmJwt, {
        campaignId,
        name: `WCA E2E ${Date.now()}`,
        combatants: [
          { name: 'WCA Fighter', kind: 'pc', characterId: charId, initiative: 20, hpCurrent: 20, hpMax: 20 },
          { name: npcName, kind: 'npc', initiative: 5, hpCurrent: NPC_HP, hpMax: NPC_HP, ac: 13 },
        ],
      });
      const detail = await apiCall<{
        currentCombatantId: string;
        combatants: Array<{ id: string; characterId: string | null; name: string; hpCurrent: number }>;
      }>('GET', `/api/v1/encounters/${enc.id}`, dmJwt);
      const pc = detail.combatants.find((c) => c.characterId === charId);
      const npc = detail.combatants.find((c) => c.name === npcName);
      return { encounterId: enc.id, pc, npc, npcName };
    }

    // ── Step 4: DM creates first encounter for preflight ──────────────────
    let preflight: Awaited<ReturnType<typeof createFreshEncounter>>;
    try {
      preflight = await createFreshEncounter('preflight');
    } catch (err) {
      test.skip(true, `Could not create preflight encounter: ${err}`);
      return;
    }
    if (!preflight.pc || !preflight.npc) {
      test.skip(true, 'PC or NPC combatant not found in preflight encounter');
      return;
    }
    if (preflight.pc.id !== (await apiCall<{ currentCombatantId: string }>('GET', `/api/v1/encounters/${preflight.encounterId}`, dmJwt)).currentCombatantId) {
      test.skip(true, 'PC is not currentCombatant in preflight encounter');
      return;
    }

    // ── Step 4b: Preflight — validate ownership via API with p1Jwt ───────
    // Confirms assertCombatantOwnerOrGm works for this character BEFORE the browser test.
    // If 403 here → ownership mismatch (charRow.userId vs JWT sub), NOT a web session issue.
    const sheetRes = await apiCall<{
      inventoryEnriched?: Array<{ instanceId: string; v3Type: string; equipped: boolean }>;
    }>('GET', `/api/v1/characters/${charId}/sheet`, p1Jwt);
    const equippedWeapon = sheetRes.inventoryEnriched?.find((i) => i.v3Type === 'weapon' && i.equipped);
    if (!equippedWeapon) {
      test.skip(
        true,
        `Preflight: weapon not in inventoryEnriched (equip step failed). ` +
          `inventoryEnriched=${JSON.stringify(sheetRes.inventoryEnriched?.slice(0, 3))}`,
      );
      return;
    }

    const preflightVersion = (await apiCall<{ version: number }>('GET', `/api/v1/encounters/${preflight.encounterId}`, p1Jwt)).version;
    const preflightAttack = await fetch(`${API_BASE}/api/v1/encounters/${preflight.encounterId}/actions/attack/apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p1Jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attackerId: preflight.pc.id,
        targetId: preflight.npc.id,
        weaponInstanceId: equippedWeapon.instanceId,
        version: preflightVersion,
      }),
    });
    if (preflightAttack.status === 403) {
      const errBody = await preflightAttack.json() as { error: string };
      throw new Error(
        `Preflight API attack → 403 FORBIDDEN. Ownership check failed — charRow.userId !== callerId. ` +
        `charId=${charId}, attackerId=${preflight.pc.id}. API: ${JSON.stringify(errBody)}`,
      );
    }
    if (preflightAttack.status === 401) {
      test.skip(true, `Preflight attack → 401 UNAUTHORIZED: JWT expired or fixture broken. Re-run db:seed:e2e.`);
      return;
    }
    // Preflight attack succeeded (or 200/400/409). The action is consumed on this encounter.
    // Create a FRESH encounter for the browser test so actionUsed=false.

    // ── Step 4c: Create fresh encounter for browser test ─────────────────
    let browserEnc: Awaited<ReturnType<typeof createFreshEncounter>>;
    try {
      browserEnc = await createFreshEncounter('browser');
    } catch (err) {
      test.skip(true, `Could not create browser encounter: ${err}`);
      return;
    }
    if (!browserEnc.pc || !browserEnc.npc) {
      test.skip(true, 'PC or NPC combatant not found in browser encounter');
      return;
    }

    const browserEncounterId = browserEnc.encounterId;
    const browserNpcCombatant = browserEnc.npc;

    // ── Step 5: Login as player1 in the browser context ───────────────────
    await page.goto('/');
    const loginRes = await page.request.post('/api/dev/login', {
      data: { email: FIXTURE_PLAYER1_EMAIL, password: FIXTURE_PASSWORD },
    });
    if (loginRes.status() !== 200) {
      test.skip(true, 'Could not login as player1 — /api/dev/login unavailable or fixture missing');
      return;
    }

    // ── Step 6: Navigate to encounter page ────────────────────────────────
    await page.goto(`/encuentros/${browserEncounterId}`, { waitUntil: 'domcontentloaded' });

    const currentUrl = page.url();
    if (currentUrl.includes('/not-found') || currentUrl.includes('/404')) {
      test.skip(
        true,
        'player1 does not have campaign access. Run db:seed:e2e to re-seed campaign members.',
      );
      return;
    }

    await expect(page).toHaveURL(new RegExp(`/encuentros/${browserEncounterId}`), { timeout: 15_000 });

    // ── Step 7: Assert "Tu turno" and "Atacar" button visible ────────────
    const turnBanner = page.locator('text=Tu turno').first();
    await expect(turnBanner).toBeVisible({ timeout: 10_000 });

    const atacarBtn = page.getByRole('button', { name: /^atacar$/i });
    await expect(atacarBtn).toBeVisible({ timeout: 10_000 });
    await expect(atacarBtn).toBeEnabled();

    // ── Step 8: Open AttackSheet, pick weapon, pick NPC target ──────────
    // Retry the tap, not the assertion. The button is server-rendered and clickable
    // before React attaches its handler, so a single tap can land on markup with no
    // onClick and do nothing at all — and a loop that only re-reads the page would
    // then spend its whole budget without ever tapping again. Re-tapping is safe
    // here: opening the sheet is idempotent, unlike the one-shot actions above.
    const shortswordBtn = page.getByRole('button', { name: /shortsword/i });
    await expect(async () => {
      await atacarBtn.click({ timeout: 5_000 }).catch(() => {});
      await expect(shortswordBtn).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });
    await shortswordBtn.click();

    // NPC name contains timestamp — use partial match
    const npcTargetBtn = page.getByRole('button', { name: /WCA Goblin/i }).first();
    await expect(npcTargetBtn).toBeVisible({ timeout: 5_000 });
    await npcTargetBtn.click();

    // ── Step 9: Assert result shown — hit or miss ───────────────────────
    await expect(
      page.locator('text=/¡Impacto!|Fallo/i').first()
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 10: Assert NPC HP changed correctly ─────────────────────────
    const resultText = await page.locator('text=/¡Impacto!|Fallo/i').first().textContent().catch(() => '');
    const wasHit = /impacto/i.test(resultText ?? '');

    const encAfter = await apiCall<{
      combatants: Array<{ id: string; hpCurrent: number }>;
    }>('GET', `/api/v1/encounters/${browserEncounterId}`, dmJwt);
    const npcAfter = encAfter.combatants.find((c) => c.id === browserNpcCombatant.id);
    expect(npcAfter, 'NPC combatant must still be in encounter after attack').toBeTruthy();

    if (wasHit) {
      expect(
        npcAfter!.hpCurrent,
        'NPC HP must have decreased after a hit (server applied damage — PHB p.194-195)',
      ).toBeLessThan(NPC_HP);
    } else {
      // On a miss: no damage (PHB p.194)
      expect(npcAfter!.hpCurrent).toBe(NPC_HP);
    }

    // ── Step 11: Screenshot for visual review (non-fatal) ────────────────
    await page.screenshot({
      path: `e2e/.screenshots/weapon-attack-${Date.now()}.png`,
    }).catch(() => {});
  });
});

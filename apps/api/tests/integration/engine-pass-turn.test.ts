/**
 * Integration tests — engine-pass-turn (Player passes own turn, C1).
 *
 * Authorisation matrix (WCPT-T*):
 *   WCPT-T1: GM → 200 (turn advances)
 *   WCPT-T2: Player (own turn) → 200 (turn advances)
 *   WCPT-T3: Player (not their turn) → 403 FORBIDDEN
 *   WCPT-T4: NPC as current combatant + player call → 404 NOT_FOUND
 *   WCPT-T5: Non-member → 403 FORBIDDEN
 *   WCPT-T6: Stale version → 409 VERSION_CONFLICT
 *   WCPT-T7: Completed encounter → 409 ENCOUNTER_NOT_ACTIVE
 *
 * Route-level assertions (REQ-WCPT-API-01, REQ-WCPT-API-03):
 *   Covered inside the same test file via HTTP POST /encounters/:id/actions/pass-turn.
 *   Route body validation: { version } only — no ragerId, no combatantId.
 *   Invalid body → 400 VALIDATION_FAILED.
 *
 * REQ-WCPT-API-01, REQ-WCPT-API-02, REQ-WCPT-API-03.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
  }
};

/** POST /encounters/:id/actions/pass-turn with a given token. */
async function doPassTurn(
  token: string,
  encounterId: string,
  version: number,
): Promise<{ statusCode: number; body: ReturnType<typeof Object.create> }> {
  const app = await getTestApp();
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/encounters/${encounterId}/actions/pass-turn`,
    headers: { authorization: `Bearer ${token}` },
    payload: { version },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

/** Read the current encounter version from DB. */
async function getVersion(encounterId: string): Promise<number> {
  const { db } = await import('../../src/infra/db/client.js');
  const { encounters } = await import('../../src/infra/db/schema.js');
  const { eq } = await import('drizzle-orm');
  const [row] = await db.select({ version: encounters.version }).from(encounters).where(eq(encounters.id, encounterId)).limit(1);
  return row?.version ?? -1;
}

/** Read currentCombatantId from DB. */
async function getCurrentCombatantId(encounterId: string): Promise<string | null> {
  const { db } = await import('../../src/infra/db/client.js');
  const { encounters } = await import('../../src/infra/db/schema.js');
  const { eq } = await import('drizzle-orm');
  const [row] = await db.select({ currentCombatantId: encounters.currentCombatantId }).from(encounters).where(eq(encounters.id, encounterId)).limit(1);
  return row?.currentCombatantId ?? null;
}

// ── Auth Matrix Suite ─────────────────────────────────────────────────────────
//
// Structure: 4 users (GM, player, otherPlayer, nonMember).
// Encounter: PC (player-owned, initiative=20) | OtherPC (otherPlayer, initiative=10) | NPC (initiative=5).
// PC is currentCombatant at encounter start.

describe('engine-pass-turn — Auth Matrix (REQ-WCPT-API-01, REQ-WCPT-API-02, REQ-WCPT-API-03)', () => {
  let gm: TestUser;
  let player: TestUser;
  let otherPlayer: TestUser;
  let nonMember: TestUser;
  let campaignId: string;
  let worldId: string;
  let playerCharId: string;
  let otherPlayerCharId: string;

  /**
   * Seed a fresh encounter:
   *   - Player PC (initiative=20) → currentCombatant first
   *   - OtherPlayer PC (initiative=10)
   *   - NPC Goblin (initiative=5)
   */
  async function makeFreshEncounter(name: string): Promise<{
    encounterId: string;
    version: number;
    playerCombatantId: string;
    otherPcCombatantId: string;
    npcCombatantId: string;
  }> {
    const app = await getTestApp();
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name,
          combatants: [
            {
              name: 'Player PC',
              kind: 'pc',
              characterId: playerCharId,
              initiative: 20,
              hpCurrent: 20,
              hpMax: 20,
            },
            {
              name: 'OtherPlayer PC',
              kind: 'pc',
              characterId: otherPlayerCharId,
              initiative: 10,
              hpCurrent: 20,
              hpMax: 20,
            },
            {
              name: 'NPC Goblin',
              kind: 'npc',
              initiative: 5,
              hpCurrent: 10,
              hpMax: 10,
              ac: 15,
            },
          ],
        },
      })
      .then((r) => r.json());

    const playerCombatantId = enc.currentCombatantId as string;
    const otherPcCombatantId = enc.combatants.find(
      (c: { id: string; characterId: string | null }) =>
        c.id !== playerCombatantId && c.characterId !== null,
    )?.id as string;
    const npcCombatantId = enc.combatants.find(
      (c: { id: string; characterId: string | null }) => c.characterId === null,
    )?.id as string;

    return {
      encounterId: enc.id as string,
      version: enc.version as number,
      playerCombatantId,
      otherPcCombatantId,
      npcCombatantId,
    };
  }

  /** Advance turns until a given combatantId becomes current. */
  async function advanceUntil(encounterId: string, targetCombatantId: string): Promise<number> {
    const app = await getTestApp();
    let version = await getVersion(encounterId);
    for (let i = 0; i < 10; i++) {
      const current = await getCurrentCombatantId(encounterId);
      if (current === targetCombatantId) return version;
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/advance-turn`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { version },
      });
      if (res.statusCode !== 200) throw new Error(`advance-turn failed: ${res.statusCode} ${res.body}`);
      version = res.json().version as number;
    }
    throw new Error('Could not advance to target combatant in 10 iterations');
  }

  /** Directly mark encounter as completed in DB. */
  async function setEncounterCompleted(encounterId: string): Promise<void> {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(encounters).set({ status: 'completed', updatedAt: new Date() }).where(eq(encounters.id, encounterId));
  }

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();
    otherPlayer = await createTestUser();
    nonMember = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Pass-Turn Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id as string;
    worldId = campaign.worldId as string;

    // Add player + otherPlayer as campaign members.
    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values([
      { campaignId, userId: player.id, role: 'player' },
      { campaignId, userId: otherPlayer.id, role: 'player' },
    ]);

    // Create player character (owned by player).
    const playerCharRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Pass-Turn Player PC' },
      })
      .then((r) => r.json());
    playerCharId = playerCharRes.id as string;

    await expectOk(
      'set-player-char-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${playerCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { class: { slug: 'fighter', source: 'PHB' }, level: 1, skillChoices: ['athletics', 'acrobatics'] },
      }),
    );

    // Transfer ownership to player.
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(characters).set({ userId: player.id }).where(eq(characters.id, playerCharId));

    // Create otherPlayer character.
    const otherCharRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Pass-Turn OtherPlayer PC' },
      })
      .then((r) => r.json());
    otherPlayerCharId = otherCharRes.id as string;
    await db.update(characters).set({ userId: otherPlayer.id }).where(eq(characters.id, otherPlayerCharId));
  });

  afterAll(async () => {
    await deleteTestUser(gm.id);
    await deleteTestUser(player.id);
    await deleteTestUser(otherPlayer.id);
    await deleteTestUser(nonMember.id);
    await closeTestApp();
  });

  // ── WCPT-T1: GM → 200 (turn advances) ───────────────────────────────────────

  it('WCPT-T1: GM passes current turn → 200 and currentCombatantId advances', async () => {
    const { encounterId, version, playerCombatantId } = await makeFreshEncounter('WCPT-T1');

    const result = await doPassTurn(gm.accessToken, encounterId, version);
    expect(result.statusCode, `Expected 200, got ${result.statusCode}: ${JSON.stringify(result.body)}`).toBe(200);

    // currentCombatantId must have advanced (PC → OtherPC or NPC depending on sort).
    const newCurrent = await getCurrentCombatantId(encounterId);
    expect(newCurrent).not.toBe(playerCombatantId);

    // Version bumped.
    const newVersion = await getVersion(encounterId);
    expect(newVersion).toBe(version + 1);
  });

  // ── WCPT-T2: Player (own turn) → 200 ────────────────────────────────────────

  it('WCPT-T2: player on own turn passes → 200 and currentCombatantId advances', async () => {
    const { encounterId, version, playerCombatantId } = await makeFreshEncounter('WCPT-T2');

    // Player PC is current combatant (initiative=20 → first).
    const result = await doPassTurn(player.accessToken, encounterId, version);
    expect(result.statusCode, `Expected 200, got ${result.statusCode}: ${JSON.stringify(result.body)}`).toBe(200);

    const newCurrent = await getCurrentCombatantId(encounterId);
    expect(newCurrent).not.toBe(playerCombatantId);
  });

  // ── WCPT-T3: Player (not their turn) → 403 FORBIDDEN ────────────────────────

  it('WCPT-T3: player calls pass-turn when it is not their turn → 403 FORBIDDEN', async () => {
    const { encounterId } = await makeFreshEncounter('WCPT-T3');

    // Advance past player PC so otherPlayer PC is current.
    const version = await advanceUntil(encounterId, await (async () => {
      // Get otherPcCombatantId by inspecting combatants.
      const app = await getTestApp();
      const enc = await app.inject({ method: 'GET', url: `/api/v1/encounters/${encounterId}`, headers: { authorization: `Bearer ${gm.accessToken}` } }).then((r) => r.json());
      return enc.combatants.find((c: { id: string; characterId: string | null }) => c.characterId === otherPlayerCharId)?.id as string;
    })());

    // Now it's otherPlayer's turn. Player tries to pass → FORBIDDEN.
    const result = await doPassTurn(player.accessToken, encounterId, version);
    expect(result.statusCode, `Expected 403, got ${result.statusCode}: ${JSON.stringify(result.body)}`).toBe(403);
    expect(result.body.error).toBe('FORBIDDEN');
  });

  // ── WCPT-T4: NPC is current + player call → 404 NOT_FOUND ──────────────────

  it('WCPT-T4: NPC is current combatant + player calls pass-turn → 404 NOT_FOUND', async () => {
    const { encounterId, npcCombatantId } = await makeFreshEncounter('WCPT-T4');

    // Advance until NPC is current (advance past player PC and otherPlayer PC).
    const version = await advanceUntil(encounterId, npcCombatantId);

    // Player calls pass-turn when NPC is current → assertCombatantOwnerOrGm: NPC has no characterId → NOT_FOUND.
    const result = await doPassTurn(player.accessToken, encounterId, version);
    expect(result.statusCode, `Expected 404, got ${result.statusCode}: ${JSON.stringify(result.body)}`).toBe(404);
    expect(result.body.error).toBe('NOT_FOUND');
  });

  // ── WCPT-T5: Non-member → 403 FORBIDDEN ──────────────────────────────────────

  it('WCPT-T5: non-member calls pass-turn → 403 FORBIDDEN (route-level member gate)', async () => {
    const { encounterId, version } = await makeFreshEncounter('WCPT-T5');

    const result = await doPassTurn(nonMember.accessToken, encounterId, version);
    expect(result.statusCode, `Expected 403, got ${result.statusCode}: ${JSON.stringify(result.body)}`).toBe(403);
    expect(result.body.error).toBe('FORBIDDEN');
  });

  // ── WCPT-T6: Stale version → 409 VERSION_CONFLICT ────────────────────────────

  it('WCPT-T6: stale version → 409 VERSION_CONFLICT', async () => {
    const { encounterId, version } = await makeFreshEncounter('WCPT-T6');

    // Pass with a stale version (version - 1 should be stale since freshly created encounters start at some initial version).
    const result = await doPassTurn(gm.accessToken, encounterId, version - 1);
    expect(result.statusCode, `Expected 409, got ${result.statusCode}: ${JSON.stringify(result.body)}`).toBe(409);
    expect(result.body.error).toBe('VERSION_CONFLICT');
  });

  // ── WCPT-T7: Completed encounter → 409 ENCOUNTER_NOT_ACTIVE ─────────────────

  it('WCPT-T7: completed encounter → 409 ENCOUNTER_NOT_ACTIVE', async () => {
    const { encounterId, version } = await makeFreshEncounter('WCPT-T7');

    // Mark encounter as completed.
    await setEncounterCompleted(encounterId);

    // GM tries to pass turn on a completed encounter → ENCOUNTER_NOT_ACTIVE.
    const result = await doPassTurn(gm.accessToken, encounterId, version);
    expect(result.statusCode, `Expected 409, got ${result.statusCode}: ${JSON.stringify(result.body)}`).toBe(409);
    expect(result.body.error).toBe('ENCOUNTER_NOT_ACTIVE');
  });

  // ── Route-level: invalid body → 400 VALIDATION_FAILED ────────────────────────

  it('WCPT-ROUTE-01: invalid body (missing version) → 400 VALIDATION_FAILED', async () => {
    const { encounterId } = await makeFreshEncounter('WCPT-ROUTE-01');
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/pass-turn`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {}, // missing version
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });
});

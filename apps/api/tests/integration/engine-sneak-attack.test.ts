/**
 * Integration tests — engine-sneak-attack (action pipeline SLICE 2b).
 *
 * Verifies runtimeDecisions body extension + rogue Sneak Attack registration:
 *   REQ-SA-API-01: runtimeDecisions optional body field accepted and threaded to ctx.
 *   REQ-SA-DICE-01: rogue character gets Sneak Attack rider; non-rogue does not.
 *   REQ-SA-API-01.1: existing callers without runtimeDecisions are unaffected.
 *
 * RED-first note: tests were written before runtimeDecisions was added to the schema.
 * PHB p.96 — Sneak Attack.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-sneak-attack — runtimeDecisions + rogue Sneak Attack rider', () => {
  let gm: TestUser;

  let campaignId: string;
  let worldId: string;

  // Rogue character (L3 → 2d6 Sneak Attack)
  let rogueCharId: string;
  let rogueEncounterId: string;
  let rogueCombatantId: string;
  let npcCombatantId: string;
  let rapierInstanceId: string;

  // Fighter character (non-rogue, for REQ-SA-DICE-01.5)
  let fighterCharId: string;
  let fighterEncounterId: string;
  let fighterCombatantId: string;
  let npcForFighterId: string;
  let longswordInstanceId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    // ── Campaign + world ───────────────────────────────────────────────────────
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Sneak Attack Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // ── Rogue L2 character ─────────────────────────────────────────────────────
    // L2 Rogue: ceil(2/2)=1 → 1d6 Sneak Attack. DEX-based (rapier, finesse).
    // PHB p.96 — Sneak Attack column: L1-2 = 1d6.
    // L2 is used (not L3) because L3 requires a subclass selection (Thief/Assassin/Arcane Trickster)
    // which is out of scope for this test. L2 still exercises the rogue-level compute path.
    const rogue = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Vex the Rogue' },
      })
      .then((r) => r.json());
    rogueCharId = rogue.id;

    // Stats: DEX 16 (+3) for finesse attacks
    await expectOk(
      'rogue-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${rogueCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 10, dex: 15, con: 12, int: 13, wis: 14, cha: 8 },
        },
      }),
    );

    // Set class to Rogue L2 (no subclass required until L3)
    // PHB p.96: L1-2 = 1d6 Sneak Attack dice.
    await expectOk(
      'rogue-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${rogueCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'rogue', source: 'PHB' },
          level: 2,
          skillChoices: ['stealth', 'acrobatics', 'deception', 'perception'],
        },
      }),
    );

    // Add rapier to inventory (finesse weapon — PHB p.149)
    await expectOk(
      'rogue-rapier',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${rogueCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'rapier', source: 'PHB' }, state: 'equipped' },
      }),
    );

    // Get rapier instanceId from sheet
    const rogueSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${rogueCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const rapier = rogueSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'rapier',
    );
    rapierInstanceId = rapier?.instanceId ?? '';

    // Create encounter with rogue as current combatant (highest initiative)
    const rogueEncounter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'Sneak Attack Test Encounter',
          combatants: [
            {
              name: 'Vex',
              kind: 'pc',
              characterId: rogueCharId,
              initiative: 20,
              hpCurrent: 20,
              hpMax: 20,
            },
            { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 7, hpMax: 7 },
          ],
        },
      })
      .then((r) => r.json());

    rogueEncounterId = rogueEncounter.id;
    rogueCombatantId = rogueEncounter.currentCombatantId;
    npcCombatantId = rogueEncounter.combatants.find(
      (c: { id: string }) => c.id !== rogueCombatantId,
    )?.id ?? '';

    // ── Fighter L1 character (non-rogue) ───────────────────────────────────────
    // For REQ-SA-DICE-01.5: non-rogue → no Sneak Attack rider regardless.
    const fighter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Aldric the Fighter (SA test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighter.id;

    await expectOk(
      'fighter-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 },
        },
      }),
    );

    await expectOk(
      'fighter-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );

    await expectOk(
      'fighter-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    const fighterSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const longsword = fighterSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'longsword',
    );
    longswordInstanceId = longsword?.instanceId ?? '';

    const fighterEncounter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'Fighter (non-rogue) SA test',
          combatants: [
            {
              name: 'Aldric',
              kind: 'pc',
              characterId: fighterCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 7, hpMax: 7 },
          ],
        },
      })
      .then((r) => r.json());

    fighterEncounterId = fighterEncounter.id;
    fighterCombatantId = fighterEncounter.currentCombatantId;
    npcForFighterId = fighterEncounter.combatants.find(
      (c: { id: string }) => c.id !== fighterCombatantId,
    )?.id ?? '';
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── SA-T1: runtimeDecisions round-trip + Sneak Attack appears in breakdown ────
  it(
    'SA-T1: Rogue L2 + rapier + {sneakAttackFirstThisTurn:true,sneakAttackSpatialAssert:true} → 200; damage.breakdown has Sneak Attack source with amount "1d6" (REQ-SA-API-01.2, REQ-SA-DICE-01)',
    async () => {
      // PHB p.96: L2 rogue = 1d6 Sneak Attack. ceil(2/2)=1 → 1d6.
      // Using spatial branch (no AdvantageMod → rollMode='normal'); assert spatial ally.
      // (No AdvantageMod registered → rollMode = 'normal', spatial branch fires.)
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${rogueEncounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: rogueCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: rapierInstanceId,
          runtimeDecisions: {
            sneakAttackFirstThisTurn: true,
            sneakAttackSpatialAssert: true,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // damage.breakdown must contain a Sneak Attack source
      const sneakSource = (body.damage?.breakdown as Array<{ label: string; amount: unknown }> | undefined)?.find(
        (s) => s.label === 'Sneak Attack',
      );
      expect(sneakSource).toBeDefined();
      expect(sneakSource!.amount).toBe('1d6'); // L2 rogue: ceil(2/2)=1 → 1d6
    },
  );

  // ── SA-T2: Non-rogue → no Sneak Attack source (REQ-SA-DICE-01.5) ─────────────
  it(
    'SA-T2: Fighter (non-rogue) + longsword + {sneakAttackFirstThisTurn:true} → 200; no Sneak Attack source in breakdown (REQ-SA-DICE-01.5)',
    async () => {
      // REQ-SA-DICE-01.5: rogueLevel=0 → rider NOT registered → no Sneak Attack source.
      // Fighter has no rogue class → rogueLevel = 0. Even with firstThisTurn asserted,
      // the rider is not registered → predicate never runs → no source in breakdown.
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${fighterEncounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcForFighterId,
          weaponInstanceId: longswordInstanceId,
          runtimeDecisions: {
            sneakAttackFirstThisTurn: true,
            sneakAttackSpatialAssert: true,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      const sneakSource = (body.damage?.breakdown as Array<{ label: string }> | undefined)?.find(
        (s) => s.label === 'Sneak Attack',
      );
      expect(sneakSource).toBeUndefined(); // no Sneak Attack for non-rogue
    },
  );

  // ── SA-T3: Backwards compat — omitting runtimeDecisions → unchanged shape ────
  it(
    'SA-T3: Existing caller omitting runtimeDecisions → 200; response shape identical (REQ-SA-API-01.1)',
    async () => {
      // REQ-SA-API-01.1: absence of runtimeDecisions must not error or change shape.
      // Fighter attack without runtimeDecisions — existing caller pattern.
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${fighterEncounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcForFighterId,
          weaponInstanceId: longswordInstanceId,
          // runtimeDecisions intentionally omitted
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Shape must still have toHit, damage, rollMode
      expect(body.toHit).toBeDefined();
      expect(body.damage).toBeDefined();
      expect(body.rollMode).toBeDefined();

      // No Sneak Attack source (fighter, no rogue levels)
      const sneakSource = (body.damage?.breakdown as Array<{ label: string }> | undefined)?.find(
        (s) => s.label === 'Sneak Attack',
      );
      expect(sneakSource).toBeUndefined();
    },
  );
});

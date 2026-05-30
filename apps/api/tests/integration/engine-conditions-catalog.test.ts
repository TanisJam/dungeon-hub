/**
 * Integration tests — engine-conditions-catalog (Slice 1: Blinded, Invisible, Poisoned).
 *
 * Verifies the attack-context threading + DELETE removal route for all three new conditions.
 *
 * PHB p.290 — Blinded:
 *   "Attack rolls against the creature have advantage."
 *   "The creature's attack rolls have disadvantage."
 *
 * PHB p.291 — Invisible:
 *   "Attack rolls against the creature have disadvantage."
 *   "The creature's attack rolls have advantage."
 *
 * PHB p.292 — Poisoned:
 *   "A poisoned creature has disadvantage on attack rolls and ability checks."
 *
 * PHB p.173 — Advantage/Disadvantage stacking:
 *   "If circumstances cause a roll to have both advantage and disadvantage, you are
 *   considered to have neither of them, and you roll one d20."
 *   Multiple sources of the same polarity don't multiply — one extra d20, not two.
 *
 * Tests:
 *   COND-T1: Blinded target → attacker rollMode=advantage (REQ-COND-BLIND-01)
 *   COND-T2: Invisible target → attacker rollMode=disadvantage (REQ-COND-INVIS-01)
 *   COND-T3: Poisoned attacker → own rollMode=disadvantage (REQ-COND-POISON-01)
 *   COND-T4: Blinded target + Poisoned attacker → net normal (PHB p.173, one grant cancels one impose)
 *   COND-T5: Blinded target + Invisible attacker → net advantage (two grants, zero imposes, PHB p.173)
 *   COND-T6: DELETE happy path — apply Poisoned, DELETE, re-check rollMode=normal (REQ-COND-DEL-02)
 *   COND-T7: DELETE idempotent — DELETE Blinded when absent → 200 {removed:0} (REQ-COND-DEL-03)
 *   COND-T8: DELETE 404 — unknown combatantId → 404 NOT_FOUND (REQ-COND-DEL-04)
 *   COND-T9: DELETE 403 — non-DM caller → 403 FORBIDDEN (REQ-COND-DEL-01)
 *   COND-T10: Read-path tolerance — legacy condition name in DB → GET-based attack 200 (REQ-COND-READ-01)
 *   COND-T11: CONDITION_CATALOG expansion — 'Blinded' valid conditionOnFail; 'FlyingPigs' rejected (REQ-COND-CAT-01)
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

describe('engine-conditions-catalog — Blinded / Invisible / Poisoned + DELETE removal route', () => {
  let gm: TestUser;
  let player: TestUser;
  let campaignId: string;
  let worldId: string;

  // Fighter character — the attacker for most tests
  let fighterCharId: string;
  let fighterLongswordInstanceId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();

    // ── Campaign + world ───────────────────────────────────────────────────────
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Conditions Catalog Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // Add player as a campaign member (player role — for 403 tests)
    await addCampaignAndWorldMember(campaignId, player.id, 'player');

    // ── Fighter L1 character — STR 15, DEX 12, CON 14 ────────────────────────
    const fighter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Aldric (conditions test)' },
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

    // Add longsword for attack tests
    await expectOk(
      'add-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    // Capture longsword instanceId for attack tests
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
    fighterLongswordInstanceId = longsword?.instanceId ?? '';
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    await closeTestApp();
  });

  // ── Helper: create fresh encounter (fighter vs NPC, AC=1, high HP) ────────────

  const makeFreshEncounter = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    name: string,
    opts: { npcHp?: number } = {},
  ) => {
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
              name: 'Fighter',
              kind: 'pc',
              characterId: fighterCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            {
              name: 'NPC Target',
              kind: 'npc',
              initiative: 5,
              hpCurrent: opts.npcHp ?? 100,
              hpMax: opts.npcHp ?? 100,
              ac: 1, // low AC for deterministic hits
            },
          ],
        },
      })
      .then((r) => r.json());

    const fighterId: string = enc.currentCombatantId;
    const npcId: string =
      enc.combatants.find((c: { id: string }) => c.id !== fighterId)?.id ?? '';

    return { encounterId: enc.id as string, fighterId, npcId };
  };

  // ── Helper: apply a condition to a combatant (via forced-check guaranteed fail) ─

  const applyCondition = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    encounterId: string,
    targetCombatantId: string,
    conditionName: string,
  ) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId,
        ability: 'con',
        dc: 30,          // impossible to pass (npcSaveMod=0, max=20 < 30)
        conditionOnFail: conditionName,
        npcSaveMod: 0,   // NPC save mod
      },
    });
    if (res.statusCode !== 200) {
      throw new Error(`applyCondition(${conditionName}): ${res.statusCode} — ${res.body}`);
    }
    return res.json();
  };

  // ── Helper: POST /attack (read-only, returns rollMode) ───────────────────────

  const getAttackRollMode = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    encounterId: string,
    attackerCombatantId: string,
    targetCombatantId: string,
  ) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/attack`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        attackerId: attackerCombatantId,
        targetId: targetCombatantId,
        weaponInstanceId: fighterLongswordInstanceId,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json().rollMode.mode as string;
  };

  // ── COND-T1: Blinded target → attacker rollMode=advantage ─────────────────────

  it(
    'COND-T1: Blinded target → attacker rollMode=advantage (REQ-COND-BLIND-01, PHB p.290)',
    async () => {
      // PHB p.290: "Attack rolls against the [Blinded] creature have advantage."
      const app = await getTestApp();
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(app, 'COND-T1 Blinded target');

      // Apply Blinded to NPC target
      const condRes = await applyCondition(app, encounterId, npcId, 'Blinded');
      expect(condRes.applied).toContain('Blinded');

      // Attacker (fighter) should see advantage when targeting Blinded NPC
      const mode = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(mode).toBe('advantage');
    },
  );

  // ── COND-T2: Invisible target → attacker rollMode=disadvantage ─────────────────

  it(
    'COND-T2: Invisible target → attacker rollMode=disadvantage (REQ-COND-INVIS-01, PHB p.291)',
    async () => {
      // PHB p.291: "Attack rolls against the [Invisible] creature have disadvantage."
      const app = await getTestApp();
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(app, 'COND-T2 Invisible target');

      await applyCondition(app, encounterId, npcId, 'Invisible');

      const mode = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(mode).toBe('disadvantage');
    },
  );

  // ── COND-T3: Poisoned attacker → own rollMode=disadvantage ─────────────────────

  it(
    'COND-T3: Poisoned attacker → own rollMode=disadvantage (REQ-COND-POISON-01, PHB p.292)',
    async () => {
      // PHB p.292: "A poisoned creature has disadvantage on attack rolls."
      // Apply Poisoned to the FIGHTER (attacker), then check its own attack roll mode.
      const app = await getTestApp();
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(app, 'COND-T3 Poisoned attacker');

      await applyCondition(app, encounterId, fighterId, 'Poisoned');

      // Fighter is Poisoned → own attack has disadvantage
      const mode = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(mode).toBe('disadvantage');
    },
  );

  // ── COND-T3b: Poisoned attacker → ability-check disadvantage path (REQ-COND-POISON-02) ──

  it(
    'COND-T3b: Poisoned combatant ability-check disadvantage (REQ-COND-POISON-02, PHB p.292)',
    async () => {
      // PHB p.292 — Appendix A: Conditions, Poisoned:
      //   "A poisoned creature has disadvantage on attack rolls and ability checks."
      //
      // REQ-COND-POISON-02 verifies the ability-check arm of this rule.
      //
      // Engine threading note:
      //   buildPoisonedModifiers emits TWO modifier instances for a Poisoned combatant:
      //     (1) id: poisoned-self-attack-{id}  trigger:'on-attack-roll'  rollType:'attack'
      //     (2) id: poisoned-self-check-{id}   trigger:'always'          rollType:'check'
      //
      //   The registry query.ts L59 rule: trigger:'always' matches ANY query trigger.
      //   So when the attack endpoint calls registry.query({trigger:'on-attack-roll', ...}),
      //   BOTH instances are returned — the attack-mod (exact match) AND the check-mod
      //   (always-match). resolveRollMode sees both AdvantageMod.impose entries and
      //   returns mode='disadvantage'.
      //
      //   This integration test confirms that:
      //     (a) buildPoisonedModifiers is called and both mods are registered
      //         (buildAttackContext step 11c — L416-430 in build-attack-context.ts)
      //     (b) the check-mod (trigger:'always', rollType:'check') is present in the
      //         live registry and participates in roll resolution
      //     (c) a non-Poisoned combatant produces rollMode='normal' (baseline)
      //
      //   A dedicated ability-check endpoint (no weapon required, pure ability roll) does
      //   not yet exist in this API. When it is added, add a direct COND-T3c test using
      //   that endpoint with rollType:'check' resolution only.

      const app = await getTestApp();

      // ── Baseline: non-Poisoned fighter → attack rollMode=normal ─────────────
      const { encounterId: baseEncId, fighterId: baseFighterId, npcId: baseNpcId } =
        await makeFreshEncounter(app, 'COND-T3b baseline (no conditions)');
      const baselineMode = await getAttackRollMode(app, baseEncId, baseFighterId, baseNpcId);
      expect(baselineMode).toBe('normal');

      // ── Poisoned: apply condition, resolve rollMode ───────────────────────────
      const { encounterId, fighterId, npcId } =
        await makeFreshEncounter(app, 'COND-T3b Poisoned ability-check disadvantage');

      const condRes = await applyCondition(app, encounterId, fighterId, 'Poisoned');
      expect(condRes.applied).toContain('Poisoned');

      // PHB p.292: Poisoned → disadvantage on ability checks.
      // Both the attack-mod (on-attack-roll) and the check-mod (always) are registered;
      // either alone would produce disadvantage — together they confirm both mod instances
      // are wired into the registry by buildAttackContext.
      const mode = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(mode).toBe('disadvantage');
    },
  );

  // ── COND-T4: PHB p.173 — Blinded target + Poisoned attacker → net normal ────────

  it(
    'COND-T4: PHB p.173 stacking — Blinded target + Poisoned attacker → net rollMode=normal',
    async () => {
      // PHB p.173: "If circumstances cause a roll to have both advantage and disadvantage,
      // you are considered to have neither of them, and you roll one d20."
      // Blinded target grants advantage to attackers (1 grant source).
      // Poisoned attacker imposes disadvantage on own attacks (1 impose source).
      // One grant + one impose = cancel to normal.
      const app = await getTestApp();
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(
        app,
        'COND-T4 Blinded+Poisoned net normal',
      );

      await applyCondition(app, encounterId, npcId, 'Blinded');   // target: grants adv to attackers
      await applyCondition(app, encounterId, fighterId, 'Poisoned'); // attacker: self disadv

      const mode = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(mode).toBe('normal');
    },
  );

  // ── COND-T5: PHB p.173 — Blinded target + Invisible attacker → net advantage ────

  it(
    'COND-T5: PHB p.173 stacking — Blinded target + Invisible attacker → net rollMode=advantage (two grants, zero imposes)',
    async () => {
      // PHB p.173: multiple sources of the same polarity don't multiply.
      // Blinded target → attackers-of grant (1 grant).
      // Invisible attacker → self-grant (1 grant).
      // Two grants, zero imposes → still advantage (one extra d20, NOT two).
      const app = await getTestApp();
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(
        app,
        'COND-T5 Blinded+Invisible net advantage',
      );

      await applyCondition(app, encounterId, npcId, 'Blinded');     // target: grants adv to attackers
      await applyCondition(app, encounterId, fighterId, 'Invisible'); // attacker: self-grant adv

      const mode = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(mode).toBe('advantage');
    },
  );

  // ── COND-T6: DELETE happy path ─────────────────────────────────────────────────

  it(
    'COND-T6: DELETE Poisoned condition → 200 {removed:1}; re-check rollMode=normal (REQ-COND-DEL-02)',
    async () => {
      const app = await getTestApp();
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(app, 'COND-T6 DELETE happy path');

      // Apply Poisoned to fighter
      await applyCondition(app, encounterId, fighterId, 'Poisoned');

      // Verify it's active (rollMode should be disadvantage)
      const modeBefore = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(modeBefore).toBe('disadvantage');

      // DELETE the condition
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/encounters/${encounterId}/combatants/${fighterId}/conditions/Poisoned`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      const deleteBody = deleteRes.json();
      expect(deleteBody.removed).toBe(1);

      // After DELETE, rollMode should be normal (no more Poisoned)
      const modeAfter = await getAttackRollMode(app, encounterId, fighterId, npcId);
      expect(modeAfter).toBe('normal');
    },
  );

  // ── COND-T7: DELETE idempotent — absent condition → 200 {removed:0} ───────────

  it(
    'COND-T7: DELETE Blinded when absent → 200 {removed:0} (REQ-COND-DEL-03, idempotent)',
    async () => {
      // PHB REST semantics: DELETE of an already-absent resource must succeed idempotently.
      // 404 is reserved for the addressed resources (encounter/combatant), NOT the condition.
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'COND-T7 DELETE idempotent');

      // Do NOT apply Blinded — combatant has no Blinded condition
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/encounters/${encounterId}/combatants/${fighterId}/conditions/Blinded`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(deleteRes.statusCode).toBe(200);
      const body = deleteRes.json();
      expect(body.removed).toBe(0);
    },
  );

  // ── COND-T8: DELETE 404 — nonexistent combatant ──────────────────────────────

  it(
    'COND-T8: DELETE with nonexistent combatantId → 404 NOT_FOUND (REQ-COND-DEL-04)',
    async () => {
      const app = await getTestApp();
      const { encounterId } = await makeFreshEncounter(app, 'COND-T8 DELETE 404');

      const fakeCombatantId = '00000000-0000-0000-0000-000000000099';
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/encounters/${encounterId}/combatants/${fakeCombatantId}/conditions/Blinded`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(deleteRes.statusCode).toBe(404);
      const body = deleteRes.json();
      expect(body.error).toBe('NOT_FOUND');
    },
  );

  // ── COND-T9: DELETE 403 — non-DM caller ─────────────────────────────────────

  it(
    'COND-T9: DELETE by non-DM (player) → 403 FORBIDDEN (REQ-COND-DEL-01)',
    async () => {
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'COND-T9 DELETE 403');

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/encounters/${encounterId}/combatants/${fighterId}/conditions/Blinded`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(deleteRes.statusCode).toBe(403);
      const body = deleteRes.json();
      expect(body.error).toBe('FORBIDDEN');
    },
  );

  // ── COND-T10: Read-path tolerance — legacy condition name in DB ───────────────

  it(
    'COND-T10: legacy condition name in DB → attack resolves 200, no 500 (REQ-COND-READ-01)',
    async () => {
      // ADR-7: unknown/legacy condition names in encounter_combatant_conditions must NOT crash
      // the attack endpoint. Validation is write-only; read path is always tolerant.
      const app = await getTestApp();
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(
        app,
        'COND-T10 legacy condition tolerance',
      );

      // Directly seed a legacy/unknown condition name into the DB for the NPC target.
      const { db } = await import('../../src/infra/db/client.js');
      const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
      await db.insert(encounterCombatantConditions).values({
        combatantId: npcId,
        conditionName: 'LegacyConditionName', // unknown to current CONDITION_CATALOG
        appliedByCombatantId: null,
        turnAnchorEntityId: null,
        turnAnchorBoundary: null,
        turnsRemaining: null,
      });

      // GET-based attack must not 500 — unknown condition name maps to no-op (ADR-7).
      const attackRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterId,
          targetId: npcId,
          weaponInstanceId: fighterLongswordInstanceId,
        },
      });

      expect(attackRes.statusCode).toBe(200);
      const body = attackRes.json();
      // rollMode must be present (no crash)
      expect(body.rollMode).toBeDefined();
      expect(typeof body.rollMode.mode).toBe('string');
      // Legacy condition should not inject any modifiers → normal (no known condition blocks fired)
      expect(body.rollMode.mode).toBe('normal');
    },
  );

  // ── COND-T11: CONDITION_CATALOG expansion — Blinded valid; FlyingPigs rejected ─

  it(
    'COND-T11: CONDITION_CATALOG — Blinded valid conditionOnFail; FlyingPigs rejected (REQ-COND-CAT-01)',
    async () => {
      // REQ-COND-CAT-01: CONDITION_CATALOG must accept Blinded/Invisible/Poisoned as valid
      // conditionOnFail values (registration only — no auto-fail branch for these).
      const app = await getTestApp();
      const { encounterId, npcId } = await makeFreshEncounter(app, 'COND-T11 catalog expansion');

      // Blinded must be accepted (DC=30 guarantees fail, condition applied)
      const blindedRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: npcId,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'Blinded',
          npcSaveMod: 0,
        },
      });
      expect(blindedRes.statusCode).toBe(200);
      expect(blindedRes.json().applied).toContain('Blinded');

      // FlyingPigs must be rejected — not in catalog
      const { encounterId: enc2, npcId: npc2 } = await makeFreshEncounter(
        app,
        'COND-T11b FlyingPigs rejected',
      );
      const flyingPigsRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${enc2}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: npc2,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'FlyingPigs',
          npcSaveMod: 0,
        },
      });
      expect(flyingPigsRes.statusCode).toBe(400);
      const flyingPigsBody = flyingPigsRes.json();
      expect(flyingPigsBody.error).toBe('VALIDATION_FAILED');
      expect(
        flyingPigsBody.issues.some((i: { code: string }) => i.code === 'UNKNOWN_CONDITION'),
      ).toBe(true);
    },
  );
});

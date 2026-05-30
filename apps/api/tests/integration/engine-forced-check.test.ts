/**
 * Integration tests — engine-forced-check (Slice 3a: Saving-Throw Pillar).
 *
 * Verifies POST /encounters/:id/actions/forced-check:
 *   REQ-UC-01: resolveTargetSave — PC derive, NPC caller-supplied, NPC absent → 400
 *   REQ-UC-02: performForcedCheck — rolled fail → dual-insert; rolled save → no insert;
 *              Stunned-STR/DEX auto-fail short-circuit; duplicate idempotent no-op
 *   REQ-API-01: thin route — Zod body, 200/400/404 response shapes
 *   REQ-CTX-01: attack vs Stunned target gets advantage (lights up attackers-of path)
 *
 * PHB p.179 — Saving Throws: success = total >= DC (no nat-20/nat-1 special cases).
 * PHB p.292 — Stunned: automatically fails STR/DEX saves; attack rolls have advantage.
 *
 * RED-first: tests written before route implementation.
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts
 * (GoTrue/Supabase intermittent — fail on main too).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

describe('engine-forced-check — POST /encounters/:id/actions/forced-check', () => {
  let gm: TestUser;

  let campaignId: string;
  let worldId: string;

  // Fighter character (L1, CON save NOT proficient — only STR+CON saves for fighter, but we test CON)
  let fighterCharId: string;

  // Shared encounter: fighter vs NPC goblin
  let baseEncounterId: string;
  let fighterCombatantId: string;
  let npcCombatantId: string;

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
        payload: { name: 'Forced Check Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // ── Fighter L1 character — CON+2 (score 14), STR+2 (score 15) ─────────────
    // Fighter: proficient in STR + CON saves (PHB p.72).
    // With pb=2 and CON+2: CON save total = +4 (mod+2 + pb+2).
    const fighter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Aldric (forced check test)' },
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

    // Add longsword for later attack tests
    await expectOk(
      'add-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    // ── Base encounter: fighter vs NPC goblin (initiative order: fighter first) ──
    const encounter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'Forced Check Base Encounter',
          combatants: [
            {
              name: 'Aldric',
              kind: 'pc',
              characterId: fighterCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            {
              name: 'Goblin',
              kind: 'npc',
              initiative: 5,
              hpCurrent: 20,
              hpMax: 20,
              ac: 13,
            },
          ],
        },
      })
      .then((r) => r.json());

    baseEncounterId = encounter.id;
    fighterCombatantId = encounter.currentCombatantId; // fighter has highest initiative
    npcCombatantId = encounter.combatants.find(
      (c: { id: string }) => c.id !== fighterCombatantId,
    )?.id ?? '';
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── Helper: create a fresh encounter for isolation ────────────────────────────

  const makeFreshEncounter = async (app: Awaited<ReturnType<typeof getTestApp>>, name: string) => {
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
              name: 'Aldric',
              kind: 'pc',
              characterId: fighterCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            {
              name: 'Goblin',
              kind: 'npc',
              initiative: 5,
              hpCurrent: 20,
              hpMax: 20,
              ac: 13,
            },
          ],
        },
      })
      .then((r) => r.json());
    const fighterId = enc.currentCombatantId;
    const npcId = enc.combatants.find((c: { id: string }) => c.id !== fighterId)?.id ?? '';
    return { encounterId: enc.id as string, fighterId: fighterId as string, npcId: npcId as string };
  };

  // ── FC-T1: PC target CON save fail → Stunned + Incapacitated dual-insert ───────

  it(
    'FC-T1: PC target CON save fail → Stunned + Incapacitated dual-insert (REQ-UC-02, ADR-4)',
    async () => {
      // PHB p.292: Stunned implies Incapacitated (dual-insert on fail).
      // Use DC=25 so the fighter (CON save +4 max = d20+4) needs ≥21 on d20 to succeed.
      // At DC=25 any d20 roll ≤ 20 means total ≤ 24 < 25 → fail (100% failure range for mock).
      // We can't control RNG in integration but DC=25 with a typical d20 makes fail likely.
      // Instead: DC=30 guarantees fail (max possible save = 20+4=24 < 30).
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'FC-T1 PC fail dual-insert');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 30, // impossible to pass (max total = 20+4 = 24 < 30)
          conditionOnFail: 'Stunned',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Target is not pre-Stunned and the save is CON (not STR/DEX), so it rolls.
      // DC=30 is unbeatable (max total = 20+4 = 24 < 30) → deterministically 'fail'.
      expect(body.outcome).toBe('fail');
      expect(body.save.success).toBe(false);
      // Dual-insert: both Stunned AND Incapacitated applied (PHB p.292).
      expect(body.applied).toContain('Stunned');
      expect(body.applied).toContain('Incapacitated');
    },
  );

  // ── FC-T2: PC target CON save success → no condition rows ─────────────────────

  it(
    'FC-T2: PC target CON save success → no conditions applied (REQ-UC-02)',
    async () => {
      // DC=1: any roll passes (d20+saveMod ≥ 1 always true since minimum = 1+mod).
      // Fighter CON save mod = +4 → total ≥ 5 for any d20 ≥ 1. Success guaranteed.
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'FC-T2 PC save success');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 1, // trivially easy DC — always succeeds
          conditionOnFail: 'Stunned',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.outcome).toBe('save');
      expect(body.save.success).toBe(true);
      expect(body.applied).toEqual([]);
    },
  );

  // ── FC-T3: NPC target with npcSaveMod → rolls normally ─────────────────────────

  it(
    'FC-T3: NPC target with npcSaveMod=+0 vs DC=30 → fail (REQ-UC-01 NPC path)',
    async () => {
      // NPC with npcSaveMod=+0, DC=30: impossible to pass (max 20+0=20 < 30).
      const app = await getTestApp();
      const { encounterId, npcId } = await makeFreshEncounter(app, 'FC-T3 NPC with saveMod');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: npcId,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'Stunned',
          npcSaveMod: 0,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.outcome).toBe('fail');
      expect(body.save.success).toBe(false);
      expect(body.applied).toContain('Stunned');
      expect(body.applied).toContain('Incapacitated');
    },
  );

  // ── FC-T4: NPC target without npcSaveMod → 400 NO_TARGET_SAVE ─────────────────

  it(
    'FC-T4: NPC target without npcSaveMod → 400 VALIDATION_FAILED issues=[{code:NO_TARGET_SAVE}] (REQ-UC-01)',
    async () => {
      // PHB p.179: NPC save modifier must be provided by caller (no character sheet).
      // Mirrors NO_TARGET_AC precedent (CLAUDE.md §6).
      const app = await getTestApp();
      const { encounterId, npcId } = await makeFreshEncounter(app, 'FC-T4 NPC no saveMod');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: npcId,
          ability: 'str',
          dc: 15,
          conditionOnFail: 'Stunned',
          // NO npcSaveMod
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues).toBeDefined();
      expect(body.issues.some((i: { code: string }) => i.code === 'NO_TARGET_SAVE')).toBe(true);
    },
  );

  // ── FC-T5: Stunned target STR save → auto-fail (PHB p.292) ─────────────────────

  it(
    'FC-T5: Stunned target STR save → auto-fail response (no d20), condition applied (PHB p.292)',
    async () => {
      // PHB p.292: "The creature automatically fails Strength and Dexterity saving throws."
      // This short-circuits BEFORE rolling; response has no d20/total fields.
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'FC-T5 Stunned STR auto-fail');

      // First: apply Stunned to the fighter via a guaranteed-fail CON check
      await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'Stunned',
        },
      });

      // Now target should be Stunned → STR save auto-fails
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'str',
          dc: 1,  // DC 1 would easily pass normally, but auto-fail overrides
          conditionOnFail: 'Stunned',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.outcome).toBe('autoFail');
      expect(body.reason).toBe('stunned-str-dex');
      // d20 field must NOT exist (no roll happened)
      expect(body.save).toBeUndefined();
    },
  );

  // ── FC-T6: Stunned target CON save → rolls normally (no auto-fail) ─────────────

  it(
    'FC-T6: Stunned target CON save → rolls normally (PHB p.292 — auto-fail only for STR/DEX)',
    async () => {
      // PHB p.292: auto-fail applies ONLY to STR and DEX.
      // CON save against DC=1 must roll (and succeed).
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'FC-T6 Stunned CON rolls');

      // Apply Stunned first
      await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'Stunned',
        },
      });

      // CON save at DC=1: auto-fail does NOT apply (CON, not STR/DEX)
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 1,
          conditionOnFail: 'Stunned',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Must have rolled (save or fail with d20 field), NOT autoFail
      expect(body.outcome).not.toBe('autoFail');
      expect(body.save).toBeDefined();
      expect(typeof body.save.d20).toBe('number');
    },
  );

  // ── FC-T7: Duplicate condition → idempotent no-op ──────────────────────────────

  it(
    'FC-T7: duplicate condition on fail → idempotent no-op (no new rows inserted, REQ-UC-02)',
    async () => {
      // Apply Stunned once (guaranteed fail with DC=30).
      // Apply Stunned again at DC=30 → Stunned already present, no new rows.
      // Both Stunned AND Incapacitated are already present, so applied=[] on second call.
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'FC-T7 duplicate idempotent');

      // First application
      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'Stunned',
        },
      });
      expect(first.statusCode).toBe(200);
      const firstBody = first.json();
      // Should have applied Stunned + Incapacitated
      expect(firstBody.applied).toContain('Stunned');
      expect(firstBody.applied).toContain('Incapacitated');

      // Second application — Stunned already present → auto-fail STR/DEX, but use CON
      // so we roll. Since Stunned already present and DC=30, it fails again.
      // Both Stunned and Incapacitated already exist → applied=[]
      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'Stunned',
        },
      });
      expect(second.statusCode).toBe(200);
      const secondBody = second.json();
      // No new conditions inserted — idempotent
      expect(secondBody.applied).toEqual([]);
    },
  );

  // ── FC-T8: Unknown conditionOnFail → 400 VALIDATION_FAILED ────────────────────

  it(
    'FC-T8: unknown conditionOnFail → 400 VALIDATION_FAILED (REQ-API-01)',
    async () => {
      // 'Grappled' is not in the 3a catalog (only 'Stunned' is valid).
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'FC-T8 unknown condition');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'str',
          dc: 15,
          conditionOnFail: 'Grappled', // not in 3a catalog
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues).toBeDefined();
      expect(body.issues.some((i: { code: string }) => i.code === 'UNKNOWN_CONDITION')).toBe(true);
    },
  );

  // ── FC-T9: Missing encounter → 404 NOT_FOUND ──────────────────────────────────

  it(
    'FC-T9: missing encounter → 404 NOT_FOUND (REQ-API-01)',
    async () => {
      const app = await getTestApp();
      const fakeEncounterId = '00000000-0000-0000-0000-000000000099';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${fakeEncounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterCombatantId,
          ability: 'con',
          dc: 15,
          conditionOnFail: 'Stunned',
        },
      });

      expect(res.statusCode).toBe(404);
    },
  );

  // ── FC-T10 [TOP RISK R1]: Attack vs Stunned target → advantage ─────────────────

  it(
    'FC-T10: attack vs Stunned target → rollMode=advantage (REQ-CTX-01, PHB p.292 — lights up attackers-of path)',
    async () => {
      // PHB p.292: "Attack rolls against the creature have advantage."
      // This test lights up the previously-dead attackers-of registry path.
      // buildProneModifiers existed but had zero production call sites before this slice.
      // buildStunnedModifiers is the first production wiring; this test confirms it end-to-end.
      const app = await getTestApp();

      // Create fresh encounter
      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'FC-T10 attack vs Stunned target advantage',
            combatants: [
              {
                name: 'Aldric',
                kind: 'pc',
                characterId: fighterCharId,
                initiative: 20,
                hpCurrent: 12,
                hpMax: 12,
              },
              {
                name: 'Stunned Goblin',
                kind: 'npc',
                initiative: 5,
                hpCurrent: 50,
                hpMax: 50,
                ac: 1, // AC=1 so any hit lands
              },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = enc.currentCombatantId;
      const targetId: string = enc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';

      // Apply Stunned to the NPC target (guaranteed fail: DC=30, npcSaveMod=0)
      const condRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${enc.id}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: targetId,
          ability: 'con',
          dc: 30,
          conditionOnFail: 'Stunned',
          npcSaveMod: 0,
        },
      });
      expect(condRes.statusCode).toBe(200);
      expect(condRes.json().applied).toContain('Stunned');

      // Get fighter's longsword instanceId
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
      const longswordInstanceId = longsword?.instanceId ?? '';
      expect(longswordInstanceId).not.toBe('');

      // POST /attack (read-only) against the Stunned target — rollMode must be 'advantage'
      const attackRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${enc.id}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId,
          targetId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(attackRes.statusCode).toBe(200);
      const attackBody = attackRes.json();

      // PHB p.292 — attack rolls against Stunned have advantage.
      // REQ-CTX-01: rollMode.mode must be 'advantage' when target is Stunned.
      // The /attack route returns rollMode as a RollModeResult object {mode, breakdown}.
      expect(attackBody.rollMode.mode).toBe('advantage');
    },
  );

  // ── FC-T11: Legacy combatant with no conditions loads fine ─────────────────────

  it(
    'FC-T11: legacy combatant with no condition rows loads fine (read-tolerance, CLAUDE.md §11)',
    async () => {
      // Combatants created before the conditions table existed have zero condition rows.
      // attack against such a target must succeed without error.
      const app = await getTestApp();

      // The base encounter was created before any conditions were applied — clean combatants.
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
      const longswordInstanceId = longsword?.instanceId ?? '';

      // Use a fresh encounter for isolation
      const { encounterId, fighterId, npcId } = await makeFreshEncounter(
        app,
        'FC-T11 legacy no-conditions read-tolerance',
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterId,
          targetId: npcId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // No conditions → normal roll mode (not advantage).
      // The /attack route returns rollMode as a RollModeResult object {mode, breakdown}.
      expect(body.rollMode.mode).toBe('normal');
    },
  );

  // ── FC-T12: Well-formed request — response shape ───────────────────────────────

  it(
    'FC-T12: response shape — save outcome has all required fields (REQ-API-01)',
    async () => {
      // DC=1 → always succeeds for fighter CON save.
      const app = await getTestApp();
      const { encounterId, fighterId } = await makeFreshEncounter(app, 'FC-T12 response shape');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: fighterId,
          ability: 'con',
          dc: 1,
          conditionOnFail: 'Stunned',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.outcome).toBe('save');
      expect(typeof body.save.d20).toBe('number');
      expect(Array.isArray(body.save.d20All)).toBe(true);
      expect(typeof body.save.saveMod).toBe('number');
      expect(body.save.dc).toBe(1);
      expect(typeof body.save.total).toBe('number');
      expect(body.save.success).toBe(true);
      expect(Array.isArray(body.applied)).toBe(true);
      expect(body.applied).toEqual([]);
    },
  );
});

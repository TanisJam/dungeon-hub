/**
 * Integration tests — engine-ability-check (B6: ability check surface).
 *
 * Verifies POST /encounters/:id/actions/ability-check:
 *   CHECK-T1:  PC bare STR success (DC=1 → always passes)
 *   CHECK-T2a: PC bare STR fail (DC=30 → always fails)
 *   CHECK-T2b: PC Athletics proficient — checkMod=4 (abilityMod+2 + PB+2, PHB p.175)
 *   CHECK-T2c: PC Athletics not-proficient — checkMod=2 (abilityMod+2 only, PHB p.174)
 *   CHECK-T3:  NPC with provided npcCheckMod → checkMod used directly
 *   CHECK-T3b: NPC without npcCheckMod → 400 NO_ACTOR_CHECK
 *   CHECK-T4:  Raging barbarian, ability=str → advantage (d20All.length===2, PHB p.48)
 *   CHECK-T4b: Raging barbarian, Athletics (STR) → advantage (d20All.length===2, REQ-SKILL-01)
 *   CHECK-T5:  Raging barbarian, ability=dex → normal (d20All.length===1, PHB p.48 — STR only)
 *   CHECK-T6:  Caller rollMode=disadvantage wins over rage advantage
 *   CHECK-T7:  Non-GM → 403 FORBIDDEN
 *
 * PHB p.174 — Ability Checks: success = total >= DC (no nat-20/nat-1 exception).
 * PHB p.175 — Skill Checks: ability modifier + proficiency bonus if proficient.
 * PHB p.48  — Rage: "advantage on Strength checks...while raging."
 *              REQ-SKILL-01: Athletics is a Strength check; rage advantage applies.
 *
 * REQ-HYGIENE-01: unconditional kind/outcome guards.
 * REQ-HYGIENE-03: no fixture-setup statusCode assertions.
 * REQ-HYGIENE-05: no retry loops — deterministic DC values; d20All.length is RNG-independent.
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-ability-check — POST /encounters/:id/actions/ability-check', () => {
  let gm: TestUser;
  let u2: TestUser; // non-GM for CHECK-T7

  let campaignId: string;
  let worldId: string;

  // ── Barbarian L1: STR 15 (+2), CON 14 (+2), DEX 10 (+0), WIS 12, CHA 13
  // With Athletics skill chosen (proficient) → Athletics checkMod = +2 (mod) + 2 (PB) = +4.
  // No-skill STR check: checkMod = +2 (abilityMod only, PHB p.174).
  let barbarianCharId: string;

  // ── Fighter L1: for CHECK-T2c (Athletics NOT proficient, PHB p.175)
  // Fighter skill choices: ['perception', 'intimidation'] — NOT Athletics.
  // STR mod = +2 → Athletics check mod = +2 (no PB, not proficient).
  let fighterCharId: string;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  /** Insert 'Raging' condition directly into DB (for test setup). */
  const setRaging = async (combatantId: string, turnsRemaining = 10): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
    await db.insert(encounterCombatantConditions).values({
      combatantId,
      conditionName: 'Raging',
      appliedByCombatantId: combatantId,
      turnAnchorEntityId: combatantId,
      turnAnchorBoundary: 'end',
      turnsRemaining,
    });
  };

  /**
   * Create a fresh encounter: actor (PC or NPC) vs NPC goblin.
   * Returns encounterId + actorCombatantId (the combatant we make ability checks on).
   */
  const makeFreshEncounter = async (
    name: string,
    opts: {
      characterId?: string | null;
      kind?: 'pc' | 'npc';
    } = {},
  ) => {
    const app = await getTestApp();
    const kind = opts.kind ?? 'pc';
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name,
          combatants: [
            kind === 'pc'
              ? {
                  name: 'Actor',
                  kind: 'pc',
                  characterId: opts.characterId ?? barbarianCharId,
                  initiative: 20,
                  hpCurrent: 20,
                  hpMax: 20,
                }
              : {
                  name: 'Actor',
                  kind: 'npc',
                  initiative: 20,
                  hpCurrent: 20,
                  hpMax: 20,
                  ac: 13,
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

    const actorCombatantId = enc.currentCombatantId as string;
    return {
      encounterId: enc.id as string,
      actorCombatantId,
    };
  };

  /** POST ability-check helper. */
  const doAbilityCheck = async (
    encounterId: string,
    payload: {
      actorCombatantId: string;
      ability: string;
      dc: number;
      skill?: string;
      npcCheckMod?: number;
      rollMode?: string;
    },
    token?: string,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/ability-check`,
      headers: { authorization: `Bearer ${token ?? gm.accessToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  // ── beforeAll ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();
    u2 = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Engine Ability Check Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId as string;

    // ── Barbarian L1: STR 15 (+2), CON 14, DEX 10, WIS 12, CHA 13
    // Skills: athletics (proficient) + animal-handling. PB=2.
    // Athletics checkMod = +2 (STR) + 2 (PB) = +4.
    // Bare STR checkMod = +2 (STR mod only).
    const barbarianChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Barbarian (ability check test)' },
      })
      .then((r) => r.json());
    barbarianCharId = barbarianChar.id as string;

    await expectOk(
      'barbarian-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${barbarianCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 },
        },
      }),
    );
    await expectOk(
      'barbarian-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${barbarianCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'barbarian', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'animal handling'],
        },
      }),
    );

    // ── Fighter L1: STR 15 (+2), skills: perception + intimidation (NOT Athletics)
    // Bare STR check = +2. Athletics check (NOT proficient) = +2 (no PB).
    const fighterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Fighter (ability check test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighterChar.id as string;

    await expectOk(
      'fighter-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 },
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
          skillChoices: ['perception', 'intimidation'],
        },
      }),
    );
  });

  afterAll(async () => {
    await deleteTestUser(gm.id);
    await deleteTestUser(u2.id);
    await closeTestApp();
  });

  // ── CHECK-T1: PC bare STR success (DC=1) ─────────────────────────────────────

  it('CHECK-T1: PC bare STR check vs DC=1 → outcome=success (PHB p.174)', async () => {
    // PHB p.174: success = total >= DC. DC=1 is trivially easy (min d20=1, STR mod=+2, total≥3 always).
    // No skill → bare STR check. checkMod = +2 (STR ability modifier only).
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T1');

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 1,
    });

    expect(result.statusCode).toBe(200);
    // REQ-HYGIENE-01: unconditional outcome assertion (DC=1 guarantees success).
    expect(result.body.outcome).toBe('success');
    expect(result.body.check.success).toBe(true);
    expect(result.body.check.dc).toBe(1);
    // d20All has exactly 1 entry (normal rollMode, no advantage).
    expect(result.body.check.d20All).toHaveLength(1);
    expect(result.body.check.rollMode).toBe('normal');
    // REQ-ROUTE-03: NO crit field in response.
    expect('crit' in result.body.check).toBe(false);
  });

  // ── CHECK-T2a: PC bare STR fail (DC=30) ──────────────────────────────────────

  it('CHECK-T2a: PC bare STR check vs DC=30 → outcome=fail (PHB p.174)', async () => {
    // DC=30 is unbeatable: max possible = d20(20) + STR mod(+2) = 22 < 30.
    // REQ-HYGIENE-01: unconditional fail assertion.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T2a');

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 30,
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.outcome).toBe('fail');
    expect(result.body.check.success).toBe(false);
    expect(result.body.check.dc).toBe(30);
    expect(result.body.check.d20All).toHaveLength(1);
    // REQ-ROUTE-03: NO crit field.
    expect('crit' in result.body.check).toBe(false);
  });

  // ── CHECK-T2b: PC Athletics proficient — checkMod=4 ──────────────────────────

  it('CHECK-T2b: PC Athletics (proficient) check mod = +4 (abilityMod+2 + PB+2, PHB p.175)', async () => {
    // PHB p.175: skill check = ability modifier + proficiency bonus if proficient.
    // Barbarian L1: STR 15 → mod+2. PB=2. Athletics proficient → checkMod = +2+2 = +4.
    // DC=30 − checkMod=4 = still unbeatable (max 20+4=24 < 30). DC=1 is trivially easy.
    // Use DC=1 so total assertion is deterministic.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T2b');

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 1,
      skill: 'athletics',
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.outcome).toBe('success');
    // checkMod must be +4: abilityMod(+2) + PB(+2) (barbarian is proficient in Athletics).
    // This is the primary assertion for REQ-GATHER-03 (skill proficiency adds PB).
    expect(result.body.check.checkMod).toBe(4);
    expect(result.body.check.d20All).toHaveLength(1);
    expect(result.body.check.rollMode).toBe('normal');
  });

  // ── CHECK-T2c: PC Athletics not-proficient — checkMod=2 ──────────────────────

  it('CHECK-T2c: PC Athletics (NOT proficient) check mod = +2 (abilityMod only, PHB p.174)', async () => {
    // PHB p.174: bare ability check = ability modifier only (no PB for non-proficient skill).
    // Fighter L1: STR 15 → mod+2. NOT proficient in Athletics. checkMod = +2 (no PB).
    // REQ-GATHER-02: bare ability + skill non-proficient → abilityMod only.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T2c', {
      characterId: fighterCharId,
    });

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 1,
      skill: 'athletics',
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.outcome).toBe('success');
    // checkMod must be +2: abilityMod(+2) only — fighter is NOT proficient in Athletics.
    expect(result.body.check.checkMod).toBe(2);
    expect(result.body.check.d20All).toHaveLength(1);
  });

  // ── CHECK-T3: NPC with provided npcCheckMod ───────────────────────────────────

  it('CHECK-T3: NPC actor with npcCheckMod=0 vs DC=30 → outcome=fail, checkMod=0', async () => {
    // REQ-GATHER-01: NPC arm uses caller-supplied npcCheckMod directly.
    // checkMod=0, DC=30: max total = 20+0=20 < 30 → deterministic fail.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T3', {
      kind: 'npc',
    });

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 30,
      npcCheckMod: 0,
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.outcome).toBe('fail');
    expect(result.body.check.checkMod).toBe(0);
    expect(result.body.check.d20All).toHaveLength(1);
  });

  // ── CHECK-T3b: NPC without npcCheckMod → 400 NO_ACTOR_CHECK ──────────────────

  it('CHECK-T3b: NPC actor without npcCheckMod → 400 VALIDATION_FAILED NO_ACTOR_CHECK', async () => {
    // REQ-GATHER-01: NPC with null npcCheckMod → NO_ACTOR_CHECK (no crash, no default).
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T3b', {
      kind: 'npc',
    });

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 15,
      // npcCheckMod intentionally omitted → performAbilityCheck gets null → NO_ACTOR_CHECK
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    const codes: string[] = (result.body.issues as Array<{ code: string }>).map((i) => i.code);
    // S3 → exact assertion: exactly one issue expected on NPC-no-mod path (REQ-HYGIENE-01 precision).
    expect(codes).toEqual(['NO_ACTOR_CHECK']);
  });

  // ── CHECK-T4: Raging barbarian STR → advantage (d20All.length===2) ────────────

  it('CHECK-T4: Raging barbarian STR check → rollMode=advantage (d20All.length===2, PHB p.48)', async () => {
    // PHB p.48: "While raging, you have advantage on Strength checks."
    // B6 REQ-RAGE-01: rage emit 1 has trigger:'on-check' + checkAbility:'str' predicate leaf.
    // When raging + ability=str: registry.query({trigger:'on-check'}) returns advantage instance.
    // resolveRollMode upgrades 'normal' → 'advantage'.
    // d20All.length === 2 is RNG-independent — always true with advantage rollMode.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T4');

    // Set Raging condition directly (mirrors engine-rage.test.ts setRaging pattern).
    await setRaging(actorCombatantId);

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 1, // DC=1 ensures success even if low roll wins; focus is rollMode assertion
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.outcome).toBe('success');
    // REQ-HYGIENE-01: d20All.length assertion is unconditional (always 2 with advantage).
    expect(result.body.check.d20All).toHaveLength(2);
    expect(result.body.check.rollMode).toBe('advantage');
  });

  // ── CHECK-T4b: Raging barbarian Athletics (STR) → advantage ──────────────────

  it('CHECK-T4b: Raging barbarian Athletics skill check → advantage (REQ-SKILL-01, PHB p.48+p.175)', async () => {
    // PHB p.175: Athletics is a Strength check. PHB p.48: rage gives advantage on Strength checks.
    // REQ-SKILL-01: when skill='athletics', governing ability='str' → checkAbility:'str' leaf fires.
    // The rage checkAbility:str predicate must match for Athletics checks (PHB p.175 + p.48).
    // d20All.length === 2 → advantage applied via checkAbility:'str' leaf.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T4b');

    await setRaging(actorCombatantId);

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 1,
      skill: 'athletics',
    });

    expect(result.statusCode).toBe(200);
    // checkMod = +4 (proficient) but the key assertion is advantage (d20All.length===2).
    expect(result.body.check.d20All).toHaveLength(2);
    expect(result.body.check.rollMode).toBe('advantage');
  });

  // ── CHECK-T5: Raging barbarian DEX → normal (d20All.length===1) ──────────────

  it('CHECK-T5: Raging barbarian DEX check → normal rollMode (d20All.length===1, PHB p.48)', async () => {
    // PHB p.48: rage gives advantage on Strength checks ONLY.
    // DEX check while raging: checkAbility:'str' leaf returns false (ability=dex) →
    // advantage instance NOT matched by registry.query → rollMode stays 'normal'.
    // d20All.length === 1 → no advantage applied. RNG-independent assertion.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T5');

    await setRaging(actorCombatantId);

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'dex',
      dc: 1,
    });

    expect(result.statusCode).toBe(200);
    // PHB p.48: DEX check gets NO advantage from rage. d20All must have exactly 1 entry.
    expect(result.body.check.d20All).toHaveLength(1);
    expect(result.body.check.rollMode).toBe('normal');
  });

  // ── CHECK-T6: Caller rollMode=disadvantage wins over rage advantage ───────────

  it('CHECK-T6: Raging barbarian STR + rollMode=disadvantage → disadvantage wins (caller-wins)', async () => {
    // REQ-GATHER-10 (caller-wins-on-explicit): explicit caller rollMode overrides rage advantage.
    // Raging + STR: rage would grant advantage → d20All.length=2 with rollMode=advantage.
    // But caller passes rollMode=disadvantage → resolveRollMode returns disadvantage unchanged.
    // The upgrade from 'normal' only fires; since caller passed explicit 'disadvantage', upgrade
    // is skipped. Final rollMode must be 'disadvantage', d20All.length=2.
    // DC=30 ensures we observe the fail (disadvantage with DC=30 is unbeatable).
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T6');

    await setRaging(actorCombatantId);

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      dc: 30, // unbeatable even with disadvantage (max = 20+2=22 < 30)
      rollMode: 'disadvantage',
    });

    expect(result.statusCode).toBe(200);
    // Caller's explicit disadvantage wins over rage advantage (caller-wins semantic).
    expect(result.body.check.rollMode).toBe('disadvantage');
    // d20All.length=2 because disadvantage also rolls 2 dice (keeps lower).
    expect(result.body.check.d20All).toHaveLength(2);
    // W3 → direct outcome assertion (result.body.check has no 'outcome' field per REQ-ROUTE-03).
    expect(result.body.outcome).toBe('fail');
  });

  // ── CHECK-T7: Non-GM → 403 FORBIDDEN ─────────────────────────────────────────

  it('CHECK-T7: non-GM caller → 403 FORBIDDEN (REQ-ROUTE-01)', async () => {
    // REQ-ROUTE-01: POST /ability-check is GM-only. u2 is not a campaign member at all.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T7');

    const result = await doAbilityCheck(
      encounterId,
      {
        actorCombatantId,
        ability: 'str',
        dc: 10,
      },
      u2.accessToken,
    );

    expect(result.statusCode).toBe(403);
    expect(result.body.error).toBe('FORBIDDEN');
  });

  // ── CHECK-T9: PHB p.175 variant — caller ability is authoritative (decision #2163) ──────────────

  it('CHECK-T9: PHB p.175 variant — STR (Intimidation) on raging barbarian → rage advantage fires (decision #2163)', async () => {
    // PHB p.175 Variant: Skills with Different Abilities — caller ability is authoritative (decision #2163).
    // "The DM might ask for a Charisma (Intimidation) check but let you use Strength instead."
    // When the DM calls STR (Intimidation): caller passes ability='str', skill='intimidation'.
    // ctx.check.ability = 'str' (set from actor.ability, NOT coerced from SKILL_TO_ABILITY).
    // Rage's checkAbility:'str' leaf evaluates ctx.check.ability — sees 'str' → fires advantage.
    // Result: rollMode='advantage', d20All.length=2. Zero production behavior change vs B6 impl.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('CHECK-T9');

    await setRaging(actorCombatantId);

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'str',
      skill: 'intimidation', // CHA skill per default PHB table — but caller says STR (variant)
      dc: 1,
    });

    expect(result.statusCode).toBe(200);
    // PHB p.175 Variant: Skills with Different Abilities — caller ability is authoritative (decision #2163).
    // Rage advantage fires because ctx.check.ability='str' matches checkAbility:'str' leaf.
    expect(result.body.check.rollMode).toBe('advantage');
    expect(result.body.check.d20All).toHaveLength(2);
  });
});

// ── CHECK-T8: Regression canary — Gate A/B deletion preserves save-advantage paths ──────────────
//
// After deleting the imperative Gates A/B from perform-forced-check.ts, the forced-check route
// must still grant advantage on DEX saves (dangerSense saveAbility:'dex') and STR saves
// (rage emit 2 saveAbility:'str'). These test the declarative predicate path via ctx.save.ability.
//
// This is a separate describe block to isolate the regression concern from the ability-check surface.
//
// PHB p.48: "advantage on Strength checks and Strength saving throws" (rage)
//           "advantage on Dexterity saving throws" (danger sense, L2+)
// B6 D5: Gates A/B deleted; ctx.save.ability field populated in resolve-target-save.ts.

describe('CHECK-T8: Gate deletion regression canary — forced-check save-advantage paths', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  /** Insert 'Raging' condition directly into DB. */
  const setRaging = async (combatantId: string, turnsRemaining = 10): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
    await db.insert(encounterCombatantConditions).values({
      combatantId,
      conditionName: 'Raging',
      appliedByCombatantId: combatantId,
      turnAnchorEntityId: combatantId,
      turnAnchorBoundary: 'end',
      turnsRemaining,
    });
  };

  /**
   * Create a Barbarian PC at the given level and return a fresh encounter.
   * Stats: STR 15 (+2), DEX 14 (+2). DC=1 always succeeds.
   */
  const makeBarbarianEncounter = async (label: string, level: number) => {
    const app = await getTestApp();

    const charRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: `Barbarian CHECK-T8 (${label})` },
      })
      .then((r) => r.json());
    const charId = charRes.id as string;

    await expectOk(
      `${label}: stats`,
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 } },
      }),
    );
    await expectOk(
      `${label}: class`,
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { class: { slug: 'barbarian', source: 'PHB' }, level, skillChoices: ['athletics', 'animal handling'] },
      }),
    );

    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: `CHECK-T8 ${label}`,
          combatants: [
            { name: 'Barbarian', kind: 'pc', characterId: charId, initiative: 20, hpCurrent: 20, hpMax: 20 },
            { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 20, hpMax: 20, ac: 13 },
          ],
        },
      })
      .then((r) => r.json());

    const barbarianCombatantId = enc.currentCombatantId as string;
    return { encounterId: enc.id as string, barbarianCombatantId, charId };
  };

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'CHECK-T8 Gate Regression Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId as string;
  });

  afterAll(async () => {
    await deleteTestUser(gm.id);
  });

  it('CHECK-T8a: Barbarian L2, DEX save vs DC=1 → rollMode=advantage (saveAbility:dex leaf fires, PHB p.48)', async () => {
    // PHB p.48: "Danger Sense — advantage on Dexterity saving throws" (L2+).
    // B6 D5: Gate A deleted. dangerSenseRuleDoc predicate now has saveAbility:'dex' leaf.
    // resolve-target-save.ts spreads ctx.save.ability='dex' → leaf returns true → advantage granted.
    // d20All.length===2 is RNG-independent (always 2 with advantage).
    const app = await getTestApp();
    const { encounterId, barbarianCombatantId } = await makeBarbarianEncounter('T8a-DEX-L2', 2);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId: barbarianCombatantId,
        ability: 'dex',
        dc: 1, // DC=1 guarantees success; focus is rollMode
        conditionOnFail: 'Blinded',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe('save'); // DC=1 always passes
    // REQ-HYGIENE-01: unconditional advantage assertion post-Gate-A deletion.
    expect(body.save.d20All).toHaveLength(2);
    expect(body.save.rollMode).toBe('advantage');
  });

  it('CHECK-T8b: Raging barbarian L1, STR save vs DC=1 → rollMode=advantage (saveAbility:str leaf fires, PHB p.48)', async () => {
    // PHB p.48: "While raging, you have advantage on...Strength saving throws."
    // B6 D5: Gate B deleted. rage emit 2 predicate now has saveAbility:'str' leaf.
    // resolve-target-save.ts spreads ctx.save.ability='str' → leaf returns true → advantage granted.
    const app = await getTestApp();
    const { encounterId, barbarianCombatantId } = await makeBarbarianEncounter('T8b-STR-Raging', 1);

    await setRaging(barbarianCombatantId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId: barbarianCombatantId,
        ability: 'str',
        dc: 1,
        conditionOnFail: 'Blinded',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe('save'); // DC=1 always passes
    // REQ-HYGIENE-01: unconditional advantage assertion post-Gate-B deletion.
    expect(body.save.d20All).toHaveLength(2);
    expect(body.save.rollMode).toBe('advantage');
  });

  it('CHECK-T8c: Barbarian L1, DEX save vs DC=1 → rollMode=normal (no false-positive from dangerSense L2 threshold)', async () => {
    // B6 D5: Gate A deletion must not cause false-positives for L1 barbarians.
    // The barbarianLevel>=2 registration guard in perform-forced-check.ts is PRESERVED.
    // L1 barbarian: compiledDangerSense not registered → no advantage.
    const app = await getTestApp();
    const { encounterId, barbarianCombatantId } = await makeBarbarianEncounter('T8c-DEX-L1', 1);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId: barbarianCombatantId,
        ability: 'dex',
        dc: 1,
        conditionOnFail: 'Blinded',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe('save');
    // L1 barbarian does NOT get danger-sense advantage — no false positive.
    expect(body.save.d20All).toHaveLength(1);
    expect(body.save.rollMode).toBe('normal');
  });
});

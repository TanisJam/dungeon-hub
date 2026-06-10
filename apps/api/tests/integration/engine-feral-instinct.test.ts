/**
 * Integration tests — engine-feral-instinct (B7: Feral Instinct initiative surface).
 *
 * Verifies POST /encounters/:id/actions/roll-initiative:
 *
 * Unit (ctx-build site RED gate, REQ-HYGIENE-06):
 *   CTX-U1: barbarianLevel=7 → compiledFeralInstinct + registry + resolveRollMode → 'advantage'
 *   CTX-U2: barbarianLevel=6 → resolveRollMode → 'normal'
 *   CTX-U3: non-barbarian (level=0) → resolveRollMode → 'normal'
 *
 * Integration:
 *   FI-T1:  PC barbarian L7 not raging → advantage (d20All.length===2, PHB p.50)
 *   FI-T2:  PC barbarian L6 → normal (d20All.length===1)
 *   FI-T3:  PC non-barbarian → normal (d20All.length===1)
 *   FI-T4:  NPC with npcInitiativeMod → normal roll at provided mod
 *   FI-T5:  NPC without npcInitiativeMod → 400 NO_ACTOR_INITIATIVE
 *   FI-T6:  Encounter not active → 409 ENCOUNTER_NOT_ACTIVE (NOT 400)
 *   FI-T7:  Non-GM caller → 403 FORBIDDEN
 *   FI-T8:  Caller rollMode override on non-barbarian → advantage honored (DM authority)
 *   FI-T9:  Two-way no-leak:
 *             (a) Raging L7 barbarian DEX ability-check gets NO Feral Instinct advantage
 *             (b) Raging L6 barbarian roll-initiative gets NO rage STR-check advantage (normal)
 *   FI-T10: Persistence — initiative column updated after successful roll
 *   FI-T11: Non-raging L7 barbarian → Feral Instinct fires (no predicate requirement)
 *
 * PHB p.50  — Feral Instinct: "advantage on initiative rolls" (barbarian level 7).
 * PHB p.189 — Initiative = Dexterity check, ordering number only (no DC, no success/fail).
 * PHB p.173 — Advantage: roll 2d20, keep highest.
 *
 * REQ-HYGIENE-01: unconditional kind/outcome guards (no toContain, no if-wrapping).
 * REQ-HYGIENE-03: no fixture-setup statusCode assertions.
 * REQ-HYGIENE-05: no RNG retry loops — initiative has no auto-outcome (PHB p.174).
 * REQ-LEAK-01/02: trigger isolation — Feral Instinct on initiative only; rage on check only.
 * REQ-PERSIST-01: PATCH encounter_combatants.initiative = roll.total.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import {
  compileRule,
  createInMemoryRegistry,
  resolveRollMode,
  feralInstinctRuleDoc,
} from '@dungeon-hub/domain/engine';

// ── CTX-BUILD UNIT TESTS (RED gate, REQ-HYGIENE-06) ─────────────────────────
// These must FAIL before roll-combatant-initiative.ts is written.
// They test the ctx-build site logic in isolation: build registry with feralInstinct
// instance, query on-initiative trigger, resolve roll mode.

describe('feralInstinct ctx-build site (unit, RED gate — REQ-HYGIENE-06)', () => {
  const compiledFeralInstinct = compileRule(feralInstinctRuleDoc);

  /**
   * Simulate the ctx-build + registration + query + resolveRollMode that
   * roll-combatant-initiative.ts will perform for the PC arm.
   * barbarianLevel: if >= 7, register the feralInstinct advantage emit.
   */
  function resolveInitiativeRollMode(
    charId: string,
    barbarianLevel: number,
    callerRollMode: 'normal' | 'advantage' | 'disadvantage',
  ): 'normal' | 'advantage' | 'disadvantage' {
    const registry = createInMemoryRegistry();
    const ctx = { self: { id: charId as string & { readonly _brand: 'EntityId' }, conditions: [] }, activeConditions: [] };

    if (barbarianLevel >= 7 && callerRollMode === 'normal') {
      const instances = compiledFeralInstinct.build({ barbarianId: charId });
      for (const i of instances.filter((i) => i.def.kind === 'advantage')) {
        registry.register(i);
      }
    }

    const gatherMods = registry.query({
      trigger: 'on-initiative',
      self: charId as string & { readonly _brand: 'EntityId' },
      ctx,
    });
    const rollModeResult = resolveRollMode(gatherMods, ctx);
    return rollModeResult.mode as 'normal' | 'advantage' | 'disadvantage';
  }

  // ── CTX-U1: barbarianLevel=7 → advantage ─────────────────────────────────

  it('CTX-U1: barbarianLevel=7, callerRollMode=normal → resolveRollMode returns advantage (REQ-GATHER-03)', () => {
    // PHB p.50: barbarian level >= 7 → Feral Instinct → advantage on initiative.
    // The ctx-build site must register feralInstinct instances and get advantage back.
    const mode = resolveInitiativeRollMode('char-test-1', 7, 'normal');
    expect(mode).toBe('advantage');
  });

  // ── CTX-U2: barbarianLevel=6 → normal ────────────────────────────────────

  it('CTX-U2: barbarianLevel=6, callerRollMode=normal → resolveRollMode returns normal (gate not met)', () => {
    // PHB p.50: "By 7th level" — level 6 does NOT qualify for Feral Instinct.
    // No feralInstinct instances registered → rollMode stays normal.
    const mode = resolveInitiativeRollMode('char-test-2', 6, 'normal');
    expect(mode).toBe('normal');
  });

  // ── CTX-U3: non-barbarian (level=0) → normal ──────────────────────────────

  it('CTX-U3: non-barbarian (barbarianLevel=0), callerRollMode=normal → resolveRollMode returns normal', () => {
    // No barbarian class → barbarianLevel = 0 → no feralInstinct registered.
    const mode = resolveInitiativeRollMode('char-test-3', 0, 'normal');
    expect(mode).toBe('normal');
  });
});

// ── INTEGRATION TESTS (FI-T*) ────────────────────────────────────────────────

describe('engine-feral-instinct — POST /encounters/:id/actions/roll-initiative', () => {
  let gm: TestUser;
  let u2: TestUser; // non-GM for FI-T7

  let campaignId: string;
  let worldId: string;

  // ── Barbarian L7: DEX 14 (+2), used for FI-T1, FI-T9, FI-T11
  let barbarianL7CharId: string;
  // ── Barbarian L6: DEX 14 (+2), used for FI-T2, FI-T9b
  let barbarianL6CharId: string;
  // ── Non-barbarian (fighter L10): DEX 14 (+2), used for FI-T3, FI-T8
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
   * Create a fresh ACTIVE encounter with an actor (PC or NPC) vs NPC goblin.
   * Returns encounterId + actorCombatantId (the combatant we roll initiative on).
   */
  const makeFreshEncounter = async (
    name: string,
    opts: {
      characterId?: string | null;
      kind?: 'pc' | 'npc';
      status?: 'draft';
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
                  characterId: opts.characterId ?? barbarianL7CharId,
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
    const encounterId = enc.id as string;

    // By default make it active (POST creates in active status based on existing pattern).
    // If status='draft' we use a special encounter that hasn't been started yet.
    // Looking at existing tests: encounters are created active by default.

    return { encounterId, actorCombatantId };
  };

  /** POST roll-initiative helper. */
  const doRollInitiative = async (
    encounterId: string,
    payload: {
      combatantId: string;
      npcInitiativeMod?: number;
      rollMode?: string;
    },
    token?: string,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/roll-initiative`,
      headers: { authorization: `Bearer ${token ?? gm.accessToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  /** POST ability-check helper (for FI-T9 leak test). */
  const doAbilityCheck = async (
    encounterId: string,
    payload: {
      actorCombatantId: string;
      ability: string;
      dc: number;
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
        payload: { name: 'Engine Feral Instinct Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId as string;

    // ── Barbarian L7: STR 15 (+2), DEX 14 (+2), CON 13 (+1)
    // Initiative checkMod = +2 (DEX mod only, PHB p.189, no proficiency).
    // Feral Instinct fires at L7 (PHB p.50).
    // Uses PATCH to set data directly — bypasses PUT /class subclass guard for L7
    // (same pattern as engine-concentration-break-damage.test.ts:349).
    const barbarianL7Char = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Barbarian L7 (feral instinct test)' },
      })
      .then((r) => r.json());
    barbarianL7CharId = barbarianL7Char.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${barbarianL7CharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'barbarian',
              source: 'PHB',
              level: 7,
              hitDie: 'd12',
              subclass: null,
              savingThrows: ['str', 'con'],
              armorProficiencies: ['light', 'medium', 'shield'],
              weaponProficiencies: ['simple', 'martial'],
              toolProficiencies: [],
              skillChoices: ['athletics', 'animal-handling'],
            },
          ],
          baseStats: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 },
        },
      },
    });

    // ── Barbarian L6: DEX 14 (+2) — below Feral Instinct threshold
    // Uses PATCH to bypass subclass guard for L6.
    const barbarianL6Char = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Barbarian L6 (feral instinct test)' },
      })
      .then((r) => r.json());
    barbarianL6CharId = barbarianL6Char.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${barbarianL6CharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'barbarian',
              source: 'PHB',
              level: 6,
              hitDie: 'd12',
              subclass: null,
              savingThrows: ['str', 'con'],
              armorProficiencies: ['light', 'medium', 'shield'],
              weaponProficiencies: ['simple', 'martial'],
              toolProficiencies: [],
              skillChoices: ['athletics', 'animal-handling'],
            },
          ],
          baseStats: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 },
        },
      },
    });

    // ── Fighter L10: DEX 14 (+2) — non-barbarian
    // Uses PATCH to bypass subclass guard for L10 fighter.
    const fighterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Fighter L10 (feral instinct test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighterChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${fighterCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'fighter',
              source: 'PHB',
              level: 10,
              hitDie: 'd10',
              subclass: null,
              savingThrows: ['str', 'con'],
              armorProficiencies: ['all', 'shield'],
              weaponProficiencies: ['simple', 'martial'],
              toolProficiencies: [],
              skillChoices: ['perception', 'intimidation'],
            },
          ],
          baseStats: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 },
        },
      },
    });
  });

  afterAll(async () => {
    await deleteTestUser(gm.id);
    await deleteTestUser(u2.id);
    await closeTestApp();
  });

  // ── FI-T1: PC barbarian L7 not raging → Feral Instinct advantage ──────────

  it('FI-T1: PC barbarian L7 not raging → 200, d20All.length===2, rollMode=advantage (PHB p.50)', async () => {
    // PHB p.50: barbarian level >= 7 → advantage on initiative rolls.
    // Not raging: Feral Instinct fires unconditionally (no predicate — REQ-LEAK-03).
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T1', {
      characterId: barbarianL7CharId,
    });

    const result = await doRollInitiative(encounterId, { combatantId: actorCombatantId });

    expect(result.statusCode).toBe(200);
    // REQ-HYGIENE-01: unconditional exact assertions (no toContain, no if-wrapping).
    expect(result.body.initiative.d20All.length).toBe(2); // advantage → 2 dice
    expect(result.body.initiative.rollMode).toBe('advantage');
    // Total = d20 (kept, max of 2) + checkMod (DEX mod).
    expect(result.body.initiative.total).toBe(
      result.body.initiative.d20 + result.body.initiative.checkMod,
    );
    // REQ-ROUTE-03: NO success or dc or crit in response.
    expect('success' in result.body.initiative).toBe(false);
    expect('dc' in result.body.initiative).toBe(false);
    expect('crit' in result.body.initiative).toBe(false);
  });

  // ── FI-T2: PC barbarian L6 → normal roll ──────────────────────────────────

  it('FI-T2: PC barbarian L6 → 200, d20All.length===1, rollMode=normal (gate not met)', async () => {
    // PHB p.50: "By 7th level" — level 6 does NOT qualify.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T2', {
      characterId: barbarianL6CharId,
    });

    const result = await doRollInitiative(encounterId, { combatantId: actorCombatantId });

    expect(result.statusCode).toBe(200);
    expect(result.body.initiative.d20All.length).toBe(1); // normal → 1 die
    expect(result.body.initiative.rollMode).toBe('normal');
  });

  // ── FI-T3: PC non-barbarian → normal roll ─────────────────────────────────

  it('FI-T3: PC non-barbarian (fighter L10) → 200, d20All.length===1, rollMode=normal', async () => {
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T3', {
      characterId: fighterCharId,
    });

    const result = await doRollInitiative(encounterId, { combatantId: actorCombatantId });

    expect(result.statusCode).toBe(200);
    expect(result.body.initiative.d20All.length).toBe(1);
    expect(result.body.initiative.rollMode).toBe('normal');
  });

  // ── FI-T4: NPC with npcInitiativeMod → normal roll at provided mod ─────────

  it('FI-T4: NPC with npcInitiativeMod=3 → 200, checkMod===3, d20All.length===1, rollMode=normal', async () => {
    // PHB p.189: NPC initiative uses caller-supplied modifier (no registry gather for NPCs).
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T4', {
      kind: 'npc',
    });

    const result = await doRollInitiative(encounterId, {
      combatantId: actorCombatantId,
      npcInitiativeMod: 3,
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.initiative.checkMod).toBe(3);
    expect(result.body.initiative.d20All.length).toBe(1);
    expect(result.body.initiative.rollMode).toBe('normal');
  });

  // ── FI-T5: NPC without npcInitiativeMod → 400 NO_ACTOR_INITIATIVE ─────────

  it('FI-T5: NPC without npcInitiativeMod → 400 VALIDATION_FAILED, issues=[{code:NO_ACTOR_INITIATIVE}]', async () => {
    // REQ-GATHER-01: NPC without npcInitiativeMod → NO_ACTOR_INITIATIVE issue.
    // REQ-HYGIENE-01: exact toEqual on issues array (NOT toContain — B6 S3 style #2155).
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T5', {
      kind: 'npc',
    });

    const result = await doRollInitiative(encounterId, {
      combatantId: actorCombatantId,
      // npcInitiativeMod intentionally absent
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues).toEqual([{ code: 'NO_ACTOR_INITIATIVE' }]);
  });

  // ── FI-T6: ENCOUNTER_NOT_ACTIVE → 409 ─────────────────────────────────────

  it('FI-T6: encounter not active → 409 ENCOUNTER_NOT_ACTIVE (NOT 400, REQ-ROUTE-04)', async () => {
    // B6 S1 lesson: encounter-state errors MUST be 409, not 400 (consistent with sibling routes).
    // Create encounter, then set it to 'completed' directly in DB (mirrors engine-pass-turn.test.ts:173).
    const app = await getTestApp();

    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'FI-T6 (completed)',
          combatants: [
            {
              name: 'Actor',
              kind: 'pc',
              characterId: barbarianL7CharId,
              initiative: 20,
              hpCurrent: 20,
              hpMax: 20,
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

    const encounterId = enc.id as string;
    const actorCombatantId = enc.currentCombatantId as string;

    // Set status to 'completed' directly in DB (no close endpoint; mirrors pass-turn test pattern).
    const { db: testDb } = await import('../../src/infra/db/client.js');
    const { encounters: encountersTable } = await import('../../src/infra/db/schema.js');
    const { eq: eqFn } = await import('drizzle-orm');
    await testDb
      .update(encountersTable)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eqFn(encountersTable.id, encounterId));

    const result = await doRollInitiative(encounterId, { combatantId: actorCombatantId });

    expect(result.statusCode).toBe(409);
    expect(result.body.error).toBe('ENCOUNTER_NOT_ACTIVE');
  });

  // ── FI-T7: Non-GM caller → 403 FORBIDDEN ──────────────────────────────────

  it('FI-T7: non-GM caller → 403 FORBIDDEN (REQ-ROUTE-01)', async () => {
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T7', {
      characterId: barbarianL7CharId,
    });

    const result = await doRollInitiative(
      encounterId,
      { combatantId: actorCombatantId },
      u2.accessToken, // non-GM token
    );

    expect(result.statusCode).toBe(403);
    expect(result.body.error).toBe('FORBIDDEN');
  });

  // ── FI-T8: Caller rollMode override → advantage honored ───────────────────

  it('FI-T8: caller rollMode=advantage on non-barbarian → 200, d20All.length===2, rollMode=advantage', async () => {
    // REQ-ROUTE-05: DM-supplied rollMode overrides registry-resolved mode.
    // Fighter has no Feral Instinct — would normally roll normal.
    // DM forces advantage → 2 dice.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T8', {
      characterId: fighterCharId,
    });

    const result = await doRollInitiative(encounterId, {
      combatantId: actorCombatantId,
      rollMode: 'advantage',
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.initiative.d20All.length).toBe(2); // DM override → advantage
    expect(result.body.initiative.rollMode).toBe('advantage');
  });

  // ── FI-T9: Two-way no-leak ────────────────────────────────────────────────

  it('FI-T9a: raging L7 barbarian DEX ability-check gets NO Feral Instinct advantage (REQ-LEAK-01)', async () => {
    // REQ-LEAK-01: 'on-initiative' emits MUST NOT fire on 'on-check' queries.
    // Feral Instinct has trigger:'on-initiative' → not gathered by performAbilityCheck.
    // Rage has trigger:'on-check' + checkAbility:'str' → fires only on STR checks.
    // DEX check → no rage advantage (STR-only), no Feral Instinct advantage.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T9a', {
      characterId: barbarianL7CharId,
    });
    await setRaging(actorCombatantId);

    const result = await doAbilityCheck(encounterId, {
      actorCombatantId,
      ability: 'dex',
      dc: 1,
    });

    expect(result.statusCode).toBe(200);
    // Feral Instinct MUST NOT fire on DEX ability check → normal roll, 1 die.
    expect(result.body.check.d20All.length).toBe(1);
    expect(result.body.check.rollMode).toBe('normal');
  });

  it('FI-T9b: raging L6 barbarian roll-initiative gets NO rage STR-check advantage (REQ-LEAK-02)', async () => {
    // REQ-LEAK-02: 'on-check' emits from rage MUST NOT fire on 'on-initiative' query.
    // L6 barbarian has no Feral Instinct (level < 7).
    // Rage has trigger:'on-check' → not gathered by roll-combatant-initiative.
    // Result: normal roll (1 die) — proves rage STR advantage doesn't leak into initiative.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T9b', {
      characterId: barbarianL6CharId,
    });
    await setRaging(actorCombatantId);

    const result = await doRollInitiative(encounterId, { combatantId: actorCombatantId });

    expect(result.statusCode).toBe(200);
    // Rage advantage (on-check) MUST NOT fire on initiative query → normal roll, 1 die.
    expect(result.body.initiative.d20All.length).toBe(1);
    expect(result.body.initiative.rollMode).toBe('normal');
  });

  // ── FI-T10: Persistence — initiative column updated ────────────────────────

  it('FI-T10: initiative column updated after FI-T1 equivalent call (REQ-PERSIST-01)', async () => {
    // REQ-PERSIST-01: PATCH encounter_combatants.initiative = roll.total.
    // Falsification: re-read DB row and assert it equals the response total.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T10', {
      characterId: barbarianL7CharId,
    });

    const result = await doRollInitiative(encounterId, { combatantId: actorCombatantId });
    expect(result.statusCode).toBe(200);

    const responseTotal = result.body.initiative.total as number;

    // Re-read the DB row to confirm the PATCH happened (not just response echo).
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatants } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');

    const [row] = await db
      .select({ initiative: encounterCombatants.initiative })
      .from(encounterCombatants)
      .where(eq(encounterCombatants.id, actorCombatantId))
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.initiative).toBe(responseTotal);
  });

  // ── FI-T11: Non-raging L7 barbarian → Feral Instinct fires ───────────────

  it('FI-T11: non-raging L7 barbarian → d20All.length===2, rollMode=advantage (REQ-LEAK-03)', async () => {
    // REQ-LEAK-03: Feral Instinct fires WITHOUT active Raging condition.
    // No predicate on the rule doc — the level gate is registration-time only.
    // PHB p.50: "you have advantage on initiative rolls" — no rage prerequisite.
    const { encounterId, actorCombatantId } = await makeFreshEncounter('FI-T11', {
      characterId: barbarianL7CharId,
    });
    // Explicitly NOT calling setRaging — combatant has no Raging condition.

    const result = await doRollInitiative(encounterId, { combatantId: actorCombatantId });

    expect(result.statusCode).toBe(200);
    expect(result.body.initiative.d20All.length).toBe(2); // Feral Instinct fires
    expect(result.body.initiative.rollMode).toBe('advantage');
  });
});

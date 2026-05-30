/**
 * TDD tests for resolveWeaponAttack — STRICT TDD (RED first, per engine-action-pipeline SDD).
 *
 * Each scenario was declared RED against the 'not implemented' stub; production code
 * was written only after confirming test failure.
 *
 * PHB references inline per scenario.
 */
import { describe, it, expect } from 'vitest';
import { resolveWeaponAttack, type WeaponAttackInput } from './resolve-weapon-attack.js';
import { createInMemoryRegistry } from '../registry/query.js';
import { buildBlessModifiers } from '../rules/bless.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EntityId } from '../types.js';

// ── Shared test helpers ───────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

const FIGHTER_ID = eid('fighter-1');
const WIZARD_ID = eid('wizard-1');
const ROGUE_ID = eid('rogue-1');
const ARCHER_ID = eid('archer-1');
const TARGET_ID = eid('target-1');

/** Minimal valid weapon (longsword — melee, no finesse, no magic). */
const LONGSWORD = {
  kind: 'melee' as const,
  properties: [] as string[],
  magicBonus: 0,
  damageDice: '1d8',
  damageType: 'slashing',
};

/** Rapier — finesse, melee. */
const RAPIER = {
  kind: 'melee' as const,
  properties: ['finesse'],
  magicBonus: 0,
  damageDice: '1d6',
  damageType: 'piercing',
};

/** Greatsword — melee, no finesse. */
const GREATSWORD = {
  kind: 'melee' as const,
  properties: [],
  magicBonus: 0,
  damageDice: '2d6',
  damageType: 'slashing',
};

/** Shortbow — ranged. */
const SHORTBOW = {
  kind: 'ranged' as const,
  properties: [],
  magicBonus: 0,
  damageDice: '1d6',
  damageType: 'piercing',
};

function makeCtx(selfId: EntityId, activeConditions: import('../context.js').ConditionRef[] = []) {
  return {
    self: { id: selfId, conditions: activeConditions },
    activeConditions,
    target: { id: TARGET_ID, conditions: [] },
    attacker: { id: selfId, conditions: activeConditions },
  };
}

function makeEmptyRegistry() {
  return createInMemoryRegistry();
}

// ── Scenario 1.1 — proficient_martial_attack ──────────────────────────────────

describe('resolveWeaponAttack — Scenario 1.1: proficient_martial_attack', () => {
  it(
    'Fighter STR+3, pb 2, longsword proficient → toHit.value = +5; breakdown has ability(+3) and proficiency(+2) — PHB p.194',
    () => {
      // PHB p.194: attack roll bonus = ability modifier + proficiency bonus (if proficient)
      // Fighter: STR 16 (mod+3), proficiency bonus 2, longsword (proficient), no magic.
      const registry = makeEmptyRegistry();
      const ctx = makeCtx(FIGHTER_ID);
      const input: WeaponAttackInput = {
        self: FIGHTER_ID,
        ctx,
        registry,
        strMod: 3,
        dexMod: 1,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: LONGSWORD,
      };

      const result = resolveWeaponAttack(input);

      expect(result.toHit.value).toBe(5); // +3 ability + 2 prof
      const labels = result.toHit.breakdown.map((s) => s.label);
      const amounts = result.toHit.breakdown.map((s) => s.amount);
      // Breakdown must include base (ability 3) and proficiency (2)
      expect(amounts).toContain(3); // ability
      expect(amounts).toContain(2); // proficiency
      // Labels hint at sources (implementation may vary in label text)
      expect(labels.some((l) => /abilit|base|str/i.test(l))).toBe(true);
    },
  );
});

// ── Scenario 1.2 — nonproficient_no_pb ───────────────────────────────────────

describe('resolveWeaponAttack — Scenario 1.2: nonproficient_no_pb (REQ-ATK-PROF-01)', () => {
  it(
    'Wizard STR+0, pb 2, greatsword NOT proficient → toHit.value = 0; NO proficiency source — PHB p.146-149',
    () => {
      // PHB p.146-149: without proficiency, the proficiency bonus is NOT added.
      // Wizard: STR 10 (mod+0), proficiency bonus 2, greatsword (NOT in weapon profs).
      // Critical ADR-3 guard: if pb is passed as 6th resolveStat arg, this will yield +2 (WRONG).
      const registry = makeEmptyRegistry();
      const ctx = makeCtx(WIZARD_ID);
      const input: WeaponAttackInput = {
        self: WIZARD_ID,
        ctx,
        registry,
        strMod: 0,
        dexMod: 0,
        proficiencyBonus: 2,
        isProficient: false, // Wizard not proficient with greatsword
        weapon: GREATSWORD,
      };

      const result = resolveWeaponAttack(input);

      // Must be exactly 0 — no ability mod (+0), no proficiency (+0)
      expect(result.toHit.value).toBe(0);
      // Breakdown must NOT contain a +2 proficiency entry
      const profEntry = result.toHit.breakdown.find(
        (s) => typeof s.amount === 'number' && s.amount === 2,
      );
      expect(profEntry).toBeUndefined();
    },
  );
});

// ── Scenario 2.1 — finesse_uses_better_ability ───────────────────────────────

describe('resolveWeaponAttack — Scenario 2.1: finesse_uses_dex_when_higher (REQ-ATK-ABILITY-01)', () => {
  it(
    'Rogue STR+0, DEX+3, rapier (finesse), proficient pb 2 → toHit.value = +5, DEX chosen — PHB p.147',
    () => {
      // PHB p.147 — Finesse: "use your choice of your Strength or Dexterity modifier".
      // Slice B default: max(STR, DEX). DEX+3 > STR+0 → DEX is chosen.
      const registry = makeEmptyRegistry();
      const ctx = makeCtx(ROGUE_ID);
      const input: WeaponAttackInput = {
        self: ROGUE_ID,
        ctx,
        registry,
        strMod: 0,
        dexMod: 3,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: RAPIER,
      };

      const result = resolveWeaponAttack(input);

      expect(result.toHit.value).toBe(5); // DEX+3 + pb+2
      // Breakdown must include +3 ability (from DEX)
      const abilitySource = result.toHit.breakdown.find(
        (s) => typeof s.amount === 'number' && s.amount === 3,
      );
      expect(abilitySource).toBeDefined();
    },
  );

  it(
    'Ranged weapon (shortbow) uses DEX modifier, not STR — PHB p.194',
    () => {
      // PHB p.194: ranged attacks use DEX.
      const registry = makeEmptyRegistry();
      const ctx = makeCtx(ARCHER_ID);
      const input: WeaponAttackInput = {
        self: ARCHER_ID,
        ctx,
        registry,
        strMod: 2,
        dexMod: 1,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: SHORTBOW,
      };

      const result = resolveWeaponAttack(input);

      // DEX+1 + pb+2 = +3 (NOT STR+2+pb+2=+6)
      expect(result.toHit.value).toBe(3);
    },
  );
});

// ── Scenario 4.1 — bless_delta_composes ──────────────────────────────────────

describe('resolveWeaponAttack — Scenario 4.1: bless_delta_composes (REQ-ATK-DELTA-01)', () => {
  it(
    'Fighter STR+3, pb 2, proficient + Bless active → breakdown includes ability(+3), proficiency(+2), Bless(+1d4) — PHB p.211',
    () => {
      // PHB p.211 — Bless: "whenever the target makes an attack roll … add a d4 to the roll".
      // Bless +1d4 NumMod on stat 'attack-roll', trigger 'always', scoped to FIGHTER_ID.
      const registry = makeEmptyRegistry();
      const blessToken = 'bless-token-test-1';
      const caster = eid('cleric-1');
      const blessMods = buildBlessModifiers(caster, [FIGHTER_ID], blessToken);
      for (const m of blessMods) registry.register(m);

      const ctx = makeCtx(FIGHTER_ID);
      const input: WeaponAttackInput = {
        self: FIGHTER_ID,
        ctx,
        registry,
        strMod: 3,
        dexMod: 1,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: LONGSWORD,
      };

      const result = resolveWeaponAttack(input);

      // Flat numeric base: 3 (ability) + 2 (prof) = 5
      expect(result.toHit.value).toBe(5); // flat value; Bless dice is recorded but not summed
      // Breakdown must have a '1d4' dice entry (Bless)
      const blessEntry = result.toHit.breakdown.find((s) => s.amount === '1d4');
      expect(blessEntry).toBeDefined();
      // Flat entries
      const amounts = result.toHit.breakdown.map((s) => s.amount);
      expect(amounts).toContain(3); // ability
      expect(amounts).toContain(2); // proficiency
    },
  );
});

// ── Scenario 5.1 — prone_gives_disadvantage ──────────────────────────────────

describe('resolveWeaponAttack — Scenario 5.1: prone_gives_disadvantage (REQ-ATK-ROLLMODE-01)', () => {
  it(
    'Attacker has Prone AdvantageMod (impose) → rollMode.mode = "disadvantage" — PHB p.190',
    () => {
      // PHB p.190 — Prone: "attack rolls made by a prone creature have disadvantage".
      // Simulate Prone via a direct AdvantageMod instance (impose) in the registry.
      const registry = makeEmptyRegistry();

      // Self-scoped prone: the attacker's own attack rolls → disadvantage.
      const proneInstance: ModifierInstance = {
        id: iid('prone-self-fighter'),
        label: 'Prone',
        def: { kind: 'advantage', mode: 'impose', rollType: 'attack' },
        scope: {
          owner: FIGHTER_ID,
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
      };
      registry.register(proneInstance);

      const ctx = makeCtx(FIGHTER_ID);
      const input: WeaponAttackInput = {
        self: FIGHTER_ID,
        ctx,
        registry,
        strMod: 3,
        dexMod: 1,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: LONGSWORD,
      };

      const result = resolveWeaponAttack(input);

      expect(result.rollMode.mode).toBe('disadvantage');
    },
  );

  it(
    'One advantage + one disadvantage simultaneously → rollMode.mode = "normal" (PHB p.173 cancellation)',
    () => {
      // PHB p.173 — "If circumstances cause a roll to have both advantage and disadvantage,
      // you are considered to have neither of them, regardless of how many circumstances
      // grant advantage or impose disadvantage."
      const registry = makeEmptyRegistry();

      const advInstance: ModifierInstance = {
        id: iid('advantage-instance'),
        label: 'Advantage Source',
        def: { kind: 'advantage', mode: 'grant', rollType: 'attack' },
        scope: {
          owner: FIGHTER_ID,
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
      };
      const disInstance: ModifierInstance = {
        id: iid('disadvantage-instance'),
        label: 'Prone',
        def: { kind: 'advantage', mode: 'impose', rollType: 'attack' },
        scope: {
          owner: FIGHTER_ID,
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
      };
      registry.register(advInstance);
      registry.register(disInstance);

      const ctx = makeCtx(FIGHTER_ID);
      const input: WeaponAttackInput = {
        self: FIGHTER_ID,
        ctx,
        registry,
        strMod: 3,
        dexMod: 1,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: LONGSWORD,
      };

      const result = resolveWeaponAttack(input);

      expect(result.rollMode.mode).toBe('normal');
    },
  );
});

// ── Scenario 6.1 — full_phase_progression ────────────────────────────────────

describe('resolveWeaponAttack — Scenario 6.1: full_phase_progression (REQ-ATK-PHASE-01)', () => {
  it(
    'Valid input → result.action.phase = "RESOLVED" after 5× advancePhase calls (DECLARED→RESOLVED)',
    () => {
      // REQ-ATK-PHASE-01: drives DECLARED → TO_HIT → ON_HIT → DAMAGE → ON_DAMAGE_APPLIED → RESOLVED.
      const registry = makeEmptyRegistry();
      const ctx = makeCtx(FIGHTER_ID);
      const input: WeaponAttackInput = {
        self: FIGHTER_ID,
        ctx,
        registry,
        strMod: 3,
        dexMod: 1,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: LONGSWORD,
      };

      const result = resolveWeaponAttack(input);

      expect(result.action.phase).toBe('RESOLVED');
      expect(result.action.type).toBe('attack');
    },
  );
});

// ── Scenario 7.1 — damage_is_structured_not_rolled ───────────────────────────

describe('resolveWeaponAttack — Scenario 7.1: damage_is_structured_not_rolled (REQ-ATK-DMG-01, ADR-6)', () => {
  it(
    'Longsword STR+3 → damage.dice = "1d8"; flatMods has ability +3; no rolled numeric value',
    () => {
      // ADR-6: damage is RETURN-ONLY — no RNG. Returns structured expression.
      // The caller (UI/DM tool) performs the dice roll.
      const registry = makeEmptyRegistry();
      const ctx = makeCtx(FIGHTER_ID);
      const input: WeaponAttackInput = {
        self: FIGHTER_ID,
        ctx,
        registry,
        strMod: 3,
        dexMod: 1,
        proficiencyBonus: 2,
        isProficient: true,
        weapon: LONGSWORD,
      };

      const result = resolveWeaponAttack(input);

      expect(result.damage.dice).toBe('1d8');
      // flatMods must include ability modifier +3
      const abilityMod = result.damage.flatMods.find(
        (s) => typeof s.amount === 'number' && s.amount === 3,
      );
      expect(abilityMod).toBeDefined();
      // No random numeric roll value in result
      expect(typeof (result.damage as unknown as { rolledValue?: unknown }).rolledValue).toBe(
        'undefined',
      );
    },
  );
});

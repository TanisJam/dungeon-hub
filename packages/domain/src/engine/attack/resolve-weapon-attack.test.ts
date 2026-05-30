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
import { buildOnHitDamageRider } from '../rules/on-hit-damage-rider.js';
import { hasRollMode } from '../predicate/ast.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EvaluationContext } from '../context.js';
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

// ── Scenario ON_HIT: onhit_rider_composes (REQ-ONHIT-COMPOSE-01.1) ────────────

describe('resolveWeaponAttack — Scenario ONHIT-1: onhit_rider_composes (REQ-ONHIT-COMPOSE-01)', () => {
  it(
    "On-hit '1d6' rider registered → damage.breakdown contains Source{label=\"Hunter's Mark\", amount='1d6'} with provenance — PHB p.251",
    () => {
      // PHB p.251 — Hunter's Mark: "+1d6 damage to the marked target on a hit".
      // REQ-ONHIT-COMPOSE-01.1: breakdown must contain the Source with label, amount:'1d6',
      // and non-empty provenance (modifierId or origin).
      // CRITICAL: assert provenance CONTENT, not just array length.
      const registry = makeEmptyRegistry();
      const rider = buildOnHitDamageRider(FIGHTER_ID, TARGET_ID, '1d6', "Hunter's Mark");
      for (const m of rider) registry.register(m);

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

      // Must find a breakdown Source with the rider's label and dice amount
      const riderSource = result.damage.breakdown.find((s) => s.label === "Hunter's Mark");
      expect(riderSource).toBeDefined();
      expect(riderSource!.amount).toBe('1d6');

      // Provenance: modifierId or origin must be present and non-empty
      const hasProvenance =
        (riderSource!.modifierId !== undefined && String(riderSource!.modifierId).length > 0) ||
        (riderSource!.origin !== undefined);
      expect(hasProvenance).toBe(true);
    },
  );
});

// ── Scenario ONHIT-2: no_rider_no_source (REQ-ONHIT-NORIDER-01.1) ────────────

describe('resolveWeaponAttack — Scenario ONHIT-2: no_rider_no_source (REQ-ONHIT-NORIDER-01)', () => {
  it(
    'No on-hit rider registered → breakdown has NO on-hit Source; ability-mod Source still present (regression guard)',
    () => {
      // REQ-ONHIT-NORIDER-01.1: no on-hit modifier means no on-hit Source in breakdown.
      // Also a regression guard: the ability-mod Source (from DAMAGE assembly) must still be present.
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

      // Breakdown must NOT contain any Source with "Hunter's Mark" or on-hit provenance
      const onHitSource = result.damage.breakdown.find(
        (s) => s.label === "Hunter's Mark",
      );
      expect(onHitSource).toBeUndefined();

      // Regression: ability-mod Source (+3) must still be present
      const abilitySource = result.damage.breakdown.find(
        (s) => typeof s.amount === 'number' && s.amount === 3,
      );
      expect(abilitySource).toBeDefined();
    },
  );
});

// ── Scenario ONHIT-3: stat_filter_negative (CRITICAL gate — REQ-ONHIT-COMPOSE-01) ──

describe('resolveWeaponAttack — Scenario ONHIT-3: stat_filter_negative (CRITICAL stat-filter gate)', () => {
  it(
    "On-hit NumMod with stat='toHit' (not 'damage') must NOT appear in damage.breakdown — stat-filter guard",
    () => {
      // CRITICAL: the ON_HIT compose MUST filter to def.stat==='damage' explicitly.
      // An on-hit mod with a different stat (e.g. 'toHit', 'attack-roll') must NOT leak
      // into damage.breakdown. Without the filter this test fails.
      // Design ref: sdd/engine-action-pipeline-onhit/design — ADR-3, stat filter.
      const registry = makeEmptyRegistry();

      // Deliberately register an on-hit mod with stat='attack-roll' (not 'damage')
      const offStatInstance: ModifierInstance = {
        id: iid('on-hit-off-stat'),
        label: 'Off-stat on-hit mod',
        def: {
          kind: 'num',
          op: 'add',
          value: 5,
          stat: 'attack-roll',
          category: 'untyped',
        },
        scope: {
          owner: FIGHTER_ID,
          // ids:[FIGHTER_ID] (the querying self) so the instance PASSES axis-match and the
          // test actually reaches the stat-filter — it must be excluded by def.stat!=='damage',
          // NOT by axis-mismatch. With ids:[TARGET_ID] the test would pass for the wrong reason.
          target: { axis: 'entities', ids: [FIGHTER_ID] },
          trigger: 'on-hit',
        },
      };
      registry.register(offStatInstance);

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

      // The off-stat on-hit mod must NOT appear in damage.breakdown
      const leakedSource = result.damage.breakdown.find(
        (s) => s.label === 'Off-stat on-hit mod',
      );
      expect(leakedSource).toBeUndefined();
    },
  );
});

// ── Scenario ONHIT-4: no_double_count (REQ-ONHIT-CONVENTION-01.1) ─────────────

describe('resolveWeaponAttack — Scenario ONHIT-4: no_double_count (REQ-ONHIT-CONVENTION-01)', () => {
  it(
    "On-hit '1d6' damage mod appears EXACTLY ONCE in damage.breakdown (structural double-count guard)",
    () => {
      // REQ-ONHIT-CONVENTION-01.1: the ON_HIT query (trigger:'on-hit') and the DAMAGE
      // resolveStat query (trigger:'always') are MUTUALLY EXCLUSIVE by query.ts:59.
      // A trigger:'on-hit' mod is invisible to the 'always' query — structural guarantee.
      // This test asserts the outcome: exactly ONE Source for the rider, not two.
      const registry = makeEmptyRegistry();
      const rider = buildOnHitDamageRider(FIGHTER_ID, TARGET_ID, '1d6', "Hunter's Mark");
      for (const m of rider) registry.register(m);

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

      // Count how many Sources are attributable to "Hunter's Mark"
      const riderSources = result.damage.breakdown.filter((s) => s.label === "Hunter's Mark");
      expect(riderSources).toHaveLength(1); // EXACTLY once, not twice
    },
  );
});

// ── Scenario ONHIT-5: full_phase_still_resolves (REQ-ATK-PHASE-01.1 regression) ─

describe('resolveWeaponAttack — Scenario ONHIT-5: full_phase_still_resolves (REQ-ATK-PHASE-01.1)', () => {
  it(
    'No rider → action.phase="RESOLVED"; result shape has exactly {action,toHit,damage,rollMode}; damage has exactly {dice,flatMods,breakdown}',
    () => {
      // REQ-ATK-PHASE-01.1: regression guard — ON_HIT insertion must not break phase flow
      // or add extra fields to WeaponAttackResult / damage.
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

      // WeaponAttackResult shape: exactly {action, toHit, damage, rollMode}
      const topKeys = Object.keys(result).sort();
      expect(topKeys).toEqual(['action', 'damage', 'rollMode', 'toHit']);

      // damage shape: exactly {dice, flatMods, breakdown}
      const damageKeys = Object.keys(result.damage).sort();
      expect(damageKeys).toEqual(['breakdown', 'dice', 'flatMods']);
    },
  );
});

// ── Scenario ONHIT-6: damage_structured_not_rolled with rider (REQ-ONHIT-READONLY-01.1) ─

describe('resolveWeaponAttack — Scenario ONHIT-6: damage_structured_not_rolled with rider (REQ-ONHIT-READONLY-01)', () => {
  it(
    "With '1d6' rider: damage.dice is weapon dice '1d8'; rider breakdown Source amount is DiceExpr '1d6', not a number",
    () => {
      // REQ-ONHIT-READONLY-01.1: no dice are rolled inside resolveWeaponAttack.
      // damage.dice stays weapon dice only (not concatenated with rider).
      // Rider appears as breakdown Source with DiceExpr amount — not a resolved integer.
      const registry = makeEmptyRegistry();
      const rider = buildOnHitDamageRider(FIGHTER_ID, TARGET_ID, '1d6', "Hunter's Mark");
      for (const m of rider) registry.register(m);

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

      // damage.dice = weapon dice (1d8), NOT modified by rider
      expect(result.damage.dice).toBe('1d8');

      // Rider Source amount is DiceExpr '1d6' (string), not a rolled integer
      const riderSource = result.damage.breakdown.find((s) => s.label === "Hunter's Mark");
      expect(riderSource).toBeDefined();
      expect(typeof riderSource!.amount).toBe('string');
      expect(riderSource!.amount).toBe('1d6');
    },
  );
});

// ── Scenario SA-CTX-01: enriched_ctx_resolvedRollMode_present_at_on_hit ─────────
// REQ-SA-ROLLMODE-CTX-01.1 — enrichedCtx wiring

describe('resolveWeaponAttack — Scenario SA-CTX-01: enriched_ctx_resolvedRollMode_present_at_on_hit', () => {
  it(
    'Rider with hasRollMode("advantage") predicate is INCLUDED when attack has advantage — REQ-SA-ROLLMODE-CTX-01.1',
    () => {
      // This test is the load-bearing RED → GREEN for the enrichedCtx change.
      // WITHOUT the enrichedCtx fix: resolvedRollMode is absent in ctx passed to ON_HIT
      // → hasRollMode returns false → rider excluded → test FAILS.
      // WITH the enrichedCtx fix: resolvedRollMode = 'advantage' in ON_HIT ctx → rider included.
      //
      // Setup: register an on-hit rider with a hasRollMode('advantage') predicate.
      // Give the attacker an AdvantageMod so rollMode resolves to 'advantage'.
      // After resolveWeaponAttack, the rider's Source must appear in damage.breakdown.
      // PHB p.173 — advantage roll mode; PHB p.96 — Sneak Attack advantage branch.
      const registry = createInMemoryRegistry();

      // AdvantageMod → rollMode = 'advantage'
      const advInstance: ModifierInstance = {
        id: iid('adv-mod-1'),
        label: 'Test Advantage',
        def: { kind: 'advantage', mode: 'grant', rollType: 'attack' },
        scope: {
          owner: ROGUE_ID,
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
      };
      registry.register(advInstance);

      // On-hit rider gated on hasRollMode('advantage')
      const rider: ModifierInstance = {
        id: iid('advantage-gated-rider'),
        label: 'Advantage Gated Rider',
        def: { kind: 'num', op: 'add', value: '2d6', stat: 'damage', category: 'untyped' },
        scope: {
          owner: ROGUE_ID,
          target: { axis: 'entities', ids: [ROGUE_ID] },
          trigger: 'on-hit',
        },
        predicate: hasRollMode('advantage'),
      };
      registry.register(rider);

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

      // rollMode must be 'advantage'
      expect(result.rollMode.mode).toBe('advantage');

      // Rider Source MUST appear in breakdown (only passes with enrichedCtx)
      const riderSource = result.damage.breakdown.find((s) => s.label === 'Advantage Gated Rider');
      expect(riderSource).toBeDefined();
      expect(riderSource!.amount).toBe('2d6');
    },
  );
});

// ── Scenario SA-CTX-02: original_ctx_not_mutated ─────────────────────────────
// REQ-SA-ROLLMODE-CTX-01.2 — enrichedCtx does NOT mutate the input ctx

describe('resolveWeaponAttack — Scenario SA-CTX-02: original_ctx_not_mutated', () => {
  it(
    'Input ctx does NOT gain resolvedRollMode after resolveWeaponAttack — REQ-SA-ROLLMODE-CTX-01.2',
    () => {
      // The enrichedCtx is a COPY (plain spread). The input ctx must remain unchanged.
      // If ctx is mutated in-place, this test fails.
      const registry = createInMemoryRegistry();

      // AdvantageMod to produce a non-normal rollMode (so enrichedCtx has content)
      const advInstance: ModifierInstance = {
        id: iid('adv-mod-2'),
        label: 'Test Advantage 2',
        def: { kind: 'advantage', mode: 'grant', rollType: 'attack' },
        scope: {
          owner: FIGHTER_ID,
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
      };
      registry.register(advInstance);

      const ctx: EvaluationContext = makeCtx(FIGHTER_ID);

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

      resolveWeaponAttack(input);

      // ctx must NOT have resolvedRollMode after the call
      expect('resolvedRollMode' in ctx).toBe(false);
    },
  );
});

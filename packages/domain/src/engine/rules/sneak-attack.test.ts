/**
 * TDD tests for buildSneakAttackRider — STRICT TDD (RED first, per engine-sneak-attack SDD).
 *
 * PHB p.96 — Sneak Attack:
 *   "Once per turn, you can deal an extra 1d6 damage to one creature you hit with
 *   an attack if you have advantage on the attack roll. The attack must use a
 *   finesse or a ranged weapon. You don't need advantage on the attack roll if
 *   another enemy of the target is within 5 feet of it, that enemy isn't
 *   incapacitated, and you don't have disadvantage on the attack roll."
 * PHB p.147 — Finesse property.
 * PHB p.173 — Advantage/Disadvantage mechanics.
 */
import { describe, it, expect } from 'vitest';
import { buildSneakAttackRider } from './sneak-attack.js';
import { resolveWeaponAttack, type WeaponAttackInput } from '../attack/resolve-weapon-attack.js';
import { createInMemoryRegistry } from '../registry/query.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

const ROGUE_ID = eid('rogue-1');
const TARGET_ID = eid('target-1');

/** Rapier — finesse, melee. PHB p.149. */
const RAPIER = {
  kind: 'melee' as const,
  properties: ['finesse'],
  magicBonus: 0,
  damageDice: '1d6' as const,
  damageType: 'piercing',
};

/** Shortbow — ranged. PHB p.149. */
const SHORTBOW = {
  kind: 'ranged' as const,
  properties: [] as string[],
  magicBonus: 0,
  damageDice: '1d6' as const,
  damageType: 'piercing',
};

/** Longsword — melee, NO finesse. PHB p.149. */
const LONGSWORD = {
  kind: 'melee' as const,
  properties: [] as string[],
  magicBonus: 0,
  damageDice: '1d8' as const,
  damageType: 'slashing',
};

/**
 * Makes a minimal ctx for the test, accepting runtimeDecisions and weaponInUse overrides.
 */
function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    self: { id: ROGUE_ID, conditions: [] },
    activeConditions: [],
    target: { id: TARGET_ID, conditions: [] },
    attacker: { id: ROGUE_ID, conditions: [] },
    ...overrides,
  };
}

/**
 * Registers an AdvantageMod to produce the given roll mode.
 */
function registerRollMode(
  registry: ReturnType<typeof createInMemoryRegistry>,
  selfId: EntityId,
  mode: 'grant' | 'impose',
) {
  const inst: ModifierInstance = {
    id: iid(`rollmode-${mode}-${selfId}`),
    label: mode === 'grant' ? 'Test Advantage' : 'Test Disadvantage',
    def: { kind: 'advantage', mode, rollType: 'attack' },
    scope: {
      owner: selfId,
      target: { axis: 'self' },
      trigger: 'on-attack-roll',
    },
  };
  registry.register(inst);
}

/**
 * Builds a minimal WeaponAttackInput with the given registry/ctx/weapon.
 */
function makeInput(
  registry: ReturnType<typeof createInMemoryRegistry>,
  ctx: EvaluationContext,
  weapon: typeof RAPIER | typeof SHORTBOW | typeof LONGSWORD,
): WeaponAttackInput {
  return {
    self: ROGUE_ID,
    ctx,
    registry,
    strMod: 0,
    dexMod: 3, // DEX rogue
    proficiencyBonus: 2,
    isProficient: true,
    weapon,
  };
}

// ── Phase 1E: Factory shape test ──────────────────────────────────────────────

describe('buildSneakAttackRider — factory shape (REQ-SA-COMPOSE-01.1)', () => {
  it(
    'returns array of 1 instance with correct NumMod def, scope, label, and predicate — PHB p.96',
    () => {
      // REQ-SA-COMPOSE-01.1: factory emits 1 ModifierInstance, NumMod{op:add, value:dice,
      // stat:damage, category:untyped}, scope.trigger=on-hit, scope.target.ids=[attackerId],
      // label='Sneak Attack', predicate present.
      const dice = '2d6';
      const instances = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);

      expect(instances).toHaveLength(1);
      const inst = instances[0]!;

      // Modifier def shape
      expect(inst.def.kind).toBe('num');
      if (inst.def.kind === 'num') {
        expect(inst.def.op).toBe('add');
        expect(inst.def.value).toBe(dice);
        expect(inst.def.stat).toBe('damage');
        expect(inst.def.category).toBe('untyped');
      }

      // Scope
      expect(inst.scope.trigger).toBe('on-hit');
      expect(inst.scope.target.axis).toBe('entities');
      if (inst.scope.target.axis === 'entities') {
        // CRITICAL: ids=[attackerId] NOT [targetId] — mirrors buildOnHitDamageRider
        expect(inst.scope.target.ids).toEqual([ROGUE_ID]);
        expect(inst.scope.target.ids).not.toContain(TARGET_ID);
      }

      // Label
      expect(inst.label).toBe('Sneak Attack');

      // Predicate present (the AND tree)
      expect(inst.predicate).toBeDefined();
    },
  );
});

// ── Phase 1F: 8-gate end-to-end scenarios ────────────────────────────────────
//
// Each gate uses resolveWeaponAttack end-to-end:
//   register rider → call resolve → assert breakdown CONTAINS or EXCLUDES
//   the Sneak Attack source by label + amount.
// All tests are RED before enrichedCtx wiring is complete.

// Gate 1: Advantage + finesse + firstThisTurn=true → HAS Sneak Attack
describe('Sneak Attack — Gate 1: advantage branch fires (REQ-SA-ADV-01.1)', () => {
  it(
    'L3 rogue, advantage, finesse weapon, firstThisTurn=true → breakdown HAS Source{label:Sneak Attack, amount:2d6} — PHB p.96/p.173',
    () => {
      // PHB p.96: Sneak Attack eligibility — advantage + finesse weapon.
      // PHB p.173: advantage when multiple grant sources.
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'grant'); // → advantage

      const dice = '2d6'; // L3 rogue: ceil(3/2)=2 → 2d6
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: { sneakAttackFirstThisTurn: true },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      expect(result.rollMode.mode).toBe('advantage');
      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeDefined();
      expect(sneakSource!.amount).toBe('2d6');
    },
  );
});

// Gate 2: Spatial branch — no advantage + spatialAssert + no disadvantage → HAS
describe('Sneak Attack — Gate 2: spatial branch fires (REQ-SA-SPATIAL-01.1)', () => {
  it(
    'Rogue, normal roll, spatialAssert=true, firstThisTurn=true → breakdown HAS Sneak Attack — PHB p.96',
    () => {
      // PHB p.96: "You don't need advantage if another enemy of the target is within 5ft…"
      // Spatial branch: runtimeDecision sneakAttackSpatialAssert=true + NOT(disadvantage).
      const registry = createInMemoryRegistry();
      // No roll mode mods → 'normal'

      const dice = '1d6'; // L1-2 rogue → 1d6 (using L1 for simplicity)
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: {
          sneakAttackFirstThisTurn: true,
          sneakAttackSpatialAssert: true,
        },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      expect(result.rollMode.mode).toBe('normal');
      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeDefined();
      expect(sneakSource!.amount).toBe('1d6');
    },
  );
});

// Gate 3: No spatial assert + no advantage → ABSENT
describe('Sneak Attack — Gate 3: no spatial assert, no advantage → ABSENT (REQ-SA-SPATIAL-01.3)', () => {
  it(
    'Rogue, normal roll, sneakAttackSpatialAssert NOT asserted → no Sneak Attack — PHB p.96',
    () => {
      // PHB p.96: both branches require either advantage OR spatial assertion.
      // Without either, rider is excluded.
      const registry = createInMemoryRegistry();
      // No roll mode mods → 'normal'

      const dice = '2d6';
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: {
          sneakAttackFirstThisTurn: true,
          // sneakAttackSpatialAssert intentionally absent
        },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeUndefined();
    },
  );
});

// Gate 4: Non-finesse melee + advantage → ABSENT (weapon gate fails)
describe('Sneak Attack — Gate 4: non-finesse melee, advantage → ABSENT (REQ-SA-WEAPON-01.3)', () => {
  it(
    'Rogue with longsword (no finesse, not ranged) + advantage + firstThisTurn=true → no Sneak Attack — PHB p.96',
    () => {
      // PHB p.96: "The attack must use a finesse or a ranged weapon."
      // Longsword is melee, no finesse → weapon gate fails.
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'grant'); // → advantage

      const dice = '2d6';
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: [] }, // no finesse!
        runtimeDecisions: { sneakAttackFirstThisTurn: true },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, LONGSWORD));

      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeUndefined();
    },
  );
});

// Gate 5: Disadvantage + spatialAssert → ABSENT (disadvantage blocks spatial branch)
describe('Sneak Attack — Gate 5: disadvantage + spatialAssert → ABSENT (REQ-SA-SPATIAL-01.2)', () => {
  it(
    'Rogue, disadvantage, spatialAssert=true, firstThisTurn=true → no Sneak Attack — PHB p.96',
    () => {
      // PHB p.96: spatial branch requires "you don't have disadvantage on the attack roll".
      // NOT(hasRollMode disadvantage) must be true.
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'impose'); // → disadvantage

      const dice = '2d6';
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: {
          sneakAttackFirstThisTurn: true,
          sneakAttackSpatialAssert: true,
        },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      expect(result.rollMode.mode).toBe('disadvantage');
      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeUndefined();
    },
  );
});

// Gate 6: firstThisTurn absent → ABSENT (once-per-turn gate)
describe('Sneak Attack — Gate 6: firstThisTurn absent → ABSENT (REQ-SA-ONCE-01.1)', () => {
  it(
    'Rogue with advantage + finesse but sneakAttackFirstThisTurn NOT asserted → no Sneak Attack — PHB p.96',
    () => {
      // PHB p.96: "Once per Turn." Engine requires caller to assert firstThisTurn.
      // If not asserted, the runtimeDecision leaf returns false → rider excluded.
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'grant'); // → advantage

      const dice = '2d6';
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: {
          // sneakAttackFirstThisTurn intentionally absent
        },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeUndefined();
    },
  );
});

// Gate 7: Multiclass rogue L2 / fighter L3 → amount '1d6' (REQ-SA-DICE-01.4)
describe('Sneak Attack — Gate 7: multiclass rogue L2 → amount 1d6 (REQ-SA-DICE-01.4)', () => {
  it(
    'Rogue L2 + Fighter L3 (rogueLevel=2, sneakAttackDice=1d6) + advantage + finesse → HAS Source{amount:1d6} — PHB p.96',
    () => {
      // PHB p.96: ceil(2/2)=1 → 1d6. Use-case computes rogueLevel;
      // factory receives the pre-computed dice string.
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'grant'); // → advantage

      const dice = '1d6'; // ceil(2/2)d6 = 1d6
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: { sneakAttackFirstThisTurn: true },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeDefined();
      expect(sneakSource!.amount).toBe('1d6');
    },
  );
});

// Gate 8: L5 rogue + ranged weapon + advantage → amount '3d6' (REQ-SA-WEAPON-01.2)
describe('Sneak Attack — Gate 8: L5 rogue + ranged + advantage → amount 3d6 (REQ-SA-WEAPON-01.2)', () => {
  it(
    'L5 rogue (sneakAttackDice=3d6), advantage, shortbow (ranged) → HAS Source{amount:3d6} — PHB p.96',
    () => {
      // PHB p.96: ceil(5/2)=3 → 3d6. Ranged weapon gate fires (weaponKind('ranged')).
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'grant'); // → advantage

      const dice = '3d6'; // ceil(5/2)d6 = 3d6
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'ranged', properties: [] }, // ranged, no finesse needed
        runtimeDecisions: { sneakAttackFirstThisTurn: true },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, SHORTBOW));

      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeDefined();
      expect(sneakSource!.amount).toBe('3d6');
    },
  );
});

// REQ-SA-READONLY-01.1: sneak attack source is a DiceExpr (string), not an integer
describe('Sneak Attack — Readonly guard (REQ-SA-READONLY-01.1)', () => {
  it(
    'Sneak Attack source amount is string "2d6" (DiceExpr), not a resolved integer — PHB p.96',
    () => {
      // REQ-SA-READONLY-01.1: no dice rolled inside resolveWeaponAttack.
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'grant'); // → advantage

      const dice = '2d6';
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: { sneakAttackFirstThisTurn: true },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      const sneakSource = result.damage.breakdown.find((s) => s.label === 'Sneak Attack');
      expect(sneakSource).toBeDefined();
      // Must be a string DiceExpr, NOT a resolved integer
      expect(typeof sneakSource!.amount).toBe('string');
      expect(sneakSource!.amount).toBe('2d6');
    },
  );
});

// Double-count guard: rider appears EXACTLY ONCE
describe('Sneak Attack — double-count guard (Slice-2 invariant)', () => {
  it(
    'Sneak Attack source appears EXACTLY ONCE in damage.breakdown — structural double-count guard',
    () => {
      // Mirrors ONHIT-4: trigger:on-hit is invisible to resolveStat always-query (query.ts:59).
      const registry = createInMemoryRegistry();
      registerRollMode(registry, ROGUE_ID, 'grant'); // → advantage

      const dice = '2d6';
      const rider = buildSneakAttackRider(ROGUE_ID, TARGET_ID, dice);
      for (const m of rider) registry.register(m);

      const ctx = makeCtx({
        weaponInUse: { kind: 'melee', properties: ['finesse'] },
        runtimeDecisions: { sneakAttackFirstThisTurn: true },
      });

      const result = resolveWeaponAttack(makeInput(registry, ctx, RAPIER));

      const sneakSources = result.damage.breakdown.filter((s) => s.label === 'Sneak Attack');
      expect(sneakSources).toHaveLength(1); // exactly once
    },
  );
});

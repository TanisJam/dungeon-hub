/**
 * TDD tests for rageRuleDoc — DSL authoring of Rage (Barbarian).
 *
 * PHB p.48 — Rage (Barbarian):
 *   "You have advantage on Strength checks and Strength saving throws."
 *   "When you make a melee weapon attack using Strength, you gain a bonus to
 *    the damage roll that increases as you gain levels as a barbarian."
 *     - Level 1–8:  +2
 *     - Level 9–15: +3
 *     - Level 16+:  +4
 *   "You have resistance to bludgeoning, piercing, and slashing damage."
 *   Rages per long rest: 2/3/4/5/6/unlimited (PHB p.48 table).
 *
 * Parity oracle: buildRageModifiers (legacy hardcoded builder — IMMUTABLE, never touched).
 *
 * RED→GREEN cycles:
 *   T-07: schema-valid + compile (RED — file doesn't exist yet)
 *   T-08: 7-emit count + per-kind assertions (GREEN — implement rageRuleDoc)
 *   T-11: parity assertions (RED — write exhaustive parity tests)
 *   T-12: verify parity passes (GREEN — rageRuleDoc IS the implementation)
 *
 * REQ-RAGE-DOC-01..08, REQ-RAGE-COMPILE-01..06, REQ-PARITY-01..06, REQ-LEGACY-01..03
 */
import { describe, it, expect } from 'vitest';
import { RuleDocSchema } from '../authoring/schema.js';
import { compileRule } from '../authoring/compile.js';
import { rageRuleDoc } from './rage.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

const RAGER_ID = 'char-001' as EntityId;

// PHB p.48 rage bonus table
// L1-8: +2, L9-15: +3, L16+: +4
function levelToBonus(level: number): 2 | 3 | 4 {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

// ── Compile the rageRuleDoc at the test boundary tier ────────────────────────

function buildRage(ragerId: EntityId, rageBonus: number, rageCount: number): ModifierInstance[] {
  return compileRule(rageRuleDoc).build({ ragerId, rageBonus, rageCount });
}

// ── Scenario S-08: rageRuleDoc is schema-valid (REQ-RAGE-DOC-08) ─────────────

describe('rageRuleDoc — schema validity (REQ-RAGE-DOC-08)', () => {
  it('RuleDocSchema.safeParse(rageRuleDoc) returns success:true', () => {
    // REQ-RAGE-DOC-08: authored rule MUST be valid against RuleDocSchema.
    // PHB p.48 — Rage (Barbarian)
    const result = RuleDocSchema.safeParse(rageRuleDoc);
    expect(result.success).toBe(true);
  });

  it('rageRuleDoc has id:rage and source:PHB p.48 (REQ-RAGE-DOC-01)', () => {
    expect(rageRuleDoc.id).toBe('rage');
    expect(rageRuleDoc.source).toBe('PHB p.48');
  });

  it('rageRuleDoc declares 3 params: ragerId, rageBonus, rageCount (REQ-RAGE-DOC-02)', () => {
    // PHB p.48 — ragerId identifies the barbarian; rageBonus and rageCount are
    // caller-computed (DSL has no arithmetic; level table is in the use-case).
    expect(rageRuleDoc.params).toHaveLength(3);
    const names = rageRuleDoc.params.map((p) => p.name);
    expect(names).toContain('ragerId');
    expect(names).toContain('rageBonus');
    expect(names).toContain('rageCount');
    const ragerParam = rageRuleDoc.params.find((p) => p.name === 'ragerId');
    expect(ragerParam?.type).toBe('EntityId');
    const bonusParam = rageRuleDoc.params.find((p) => p.name === 'rageBonus');
    expect(bonusParam?.type).toBe('number');
    const countParam = rageRuleDoc.params.find((p) => p.name === 'rageCount');
    expect(countParam?.type).toBe('number');
  });
});

// ── Scenario S-09: 7 emits (REQ-RAGE-COMPILE-01, REQ-RAGE-DOC-07) ────────────

describe('rageRuleDoc — compile + build: 7 emits total (REQ-RAGE-COMPILE-01..02)', () => {
  it('S-09: compile(rageRuleDoc).build({ragerId, rageBonus:2, rageCount:2}) returns 7 instances', () => {
    // REQ-RAGE-COMPILE-02: exactly 7 modifier instances
    const instances = buildRage(RAGER_ID, 2, 2);
    expect(instances).toHaveLength(7);
  });
});

// ── S-10: 2 AdvantageMods (REQ-RAGE-DOC-03, REQ-RAGE-COMPILE-03) ─────────────

describe('rageRuleDoc — AdvantageMod emits (REQ-RAGE-DOC-03, REQ-RAGE-COMPILE-03)', () => {
  it('produces exactly 2 AdvantageMod instances with mode:grant', () => {
    // REQ-RAGE-COMPILE-03, PHB p.48 — "advantage on Strength checks and saves"
    const instances = buildRage(RAGER_ID, 2, 2);
    const adv = instances.filter((i) => i.def.kind === 'advantage');
    expect(adv).toHaveLength(2);
    for (const inst of adv) {
      expect(inst.def.kind).toBe('advantage');
      if (inst.def.kind === 'advantage') {
        expect(inst.def.mode).toBe('grant');
      }
    }
  });

  it('has both check and save rollTypes on AdvantageMods', () => {
    // PHB p.48 — "advantage on Strength CHECKS and Strength SAVING THROWS"
    const instances = buildRage(RAGER_ID, 2, 2);
    const adv = instances.filter((i) => i.def.kind === 'advantage');
    const rollTypes = adv.map((i) => (i.def.kind === 'advantage' ? i.def.rollType : ''));
    expect(rollTypes).toContain('check');
    expect(rollTypes).toContain('save');
  });

  it('AdvantageMods have scope.owner === ragerId (REQ-RAGE-COMPILE-03)', () => {
    // REQ-RAGE-COMPILE-03
    const instances = buildRage(RAGER_ID, 2, 2);
    const adv = instances.filter((i) => i.def.kind === 'advantage');
    for (const inst of adv) {
      expect(inst.scope.owner).toBe(RAGER_ID);
    }
  });

  it('AdvantageMods use target:{axis:self} (ADR-4a: modern self-axis convention)', () => {
    // ADR-4a: axis:'self' is the established convention for self-targeting emits.
    // All 4 existing self-effect rules use it. query.ts:67 resolves axis:'self' as
    // owner===self — RUNTIME-EQUIVALENT to legacy entities:[ragerId] (same entity set).
    const instances = buildRage(RAGER_ID, 2, 2);
    const adv = instances.filter((i) => i.def.kind === 'advantage');
    for (const inst of adv) {
      expect(inst.scope.target.axis).toBe('self');
    }
  });

  it('AdvantageMods have hasCondition:Raging predicate (REQ-RAGE-DOC-03)', () => {
    // PHB p.48 — advantage applies while Raging
    const instances = buildRage(RAGER_ID, 2, 2);
    const adv = instances.filter((i) => i.def.kind === 'advantage');
    for (const inst of adv) {
      expect(inst.predicate).toBeDefined();
      // predicate is {op:'query', q:{kind:'hasCondition', entity:'self', condition:'Raging'}}
      const pred = inst.predicate as { op: string; q?: { kind: string; condition?: string } };
      expect(pred.op).toBe('query');
      expect(pred.q?.kind).toBe('hasCondition');
      expect(pred.q?.condition).toBe('Raging');
    }
  });
});

// ── S-11: NumMod (REQ-RAGE-DOC-04, REQ-RAGE-COMPILE-04) ──────────────────────

describe('rageRuleDoc — NumMod emit (REQ-RAGE-DOC-04, REQ-RAGE-COMPILE-04)', () => {
  it('S-11: produces exactly 1 NumMod with stat:damage, op:add, value:3 (rageBonus:3)', () => {
    // REQ-RAGE-COMPILE-04, PHB p.48 — damage bonus melee weapon attacks
    // R-COERCE trap: {rageBonus} compiles to STRING '3'; Number() coercion required.
    const instances = buildRage(RAGER_ID, 3, 3);
    const nums = instances.filter((i) => i.def.kind === 'num');
    expect(nums).toHaveLength(1);
    const num = nums[0]!;
    expect(num.def.kind).toBe('num');
    if (num.def.kind === 'num') {
      expect(num.def.stat).toBe('damage');
      expect(num.def.op).toBe('add');
      // R-COERCE: compile.ts substituteString calls String(value), so '3' not 3.
      expect(Number(num.def.value)).toBe(3);
      expect(num.def.category).toBe('untyped');
    }
  });

  it('NumMod has AND predicate with weaponKind:melee + hasCondition:Raging (REQ-RAGE-DOC-04)', () => {
    // PHB p.48 — "+[bonus] to MELEE WEAPON ATTACKs"; also requires Raging
    // DSL improvement: predicate moved INTO the rule (legacy bare NumMod, use-case wraps it).
    const instances = buildRage(RAGER_ID, 2, 2);
    const num = instances.find((i) => i.def.kind === 'num')!;
    expect(num.predicate).toBeDefined();
    const pred = num.predicate as { op: string; nodes?: Array<{ op: string; q?: { kind: string } }> };
    expect(pred.op).toBe('and');
    const nodes = pred.nodes ?? [];
    expect(nodes.some((n) => n.q?.kind === 'weaponKind')).toBe(true);
    expect(nodes.some((n) => n.q?.kind === 'hasCondition')).toBe(true);
  });

  it('NumMod uses target:{axis:self} (ADR-4a)', () => {
    const instances = buildRage(RAGER_ID, 2, 2);
    const num = instances.find((i) => i.def.kind === 'num')!;
    expect(num.scope.target.axis).toBe('self');
  });

  it('S-11a: NumMod scope.trigger is on-damage (W-01 / REQ-RAGE-DOC-04)', () => {
    // PHB p.48 — rage damage bonus applies to the DAMAGE ROLL of a melee weapon
    // attack, not the attack roll itself. Design (ADR-4, Emit 6) overrides
    // REQ-RAGE-DOC-04 trigger:'on-attack-roll' with trigger:'on-damage' because
    // the bonus resolves at damage resolution time, not at the attack roll step.
    // This assertion locks that design decision.
    const instances = buildRage(RAGER_ID, 2, 2);
    const num = instances.find((i) => i.def.kind === 'num')!;
    expect(num.scope.trigger).toBe('on-damage');
  });

  it('S-15a: NumMod value at L1 — bonus:2 (REQ-CHAR-01a, PHB p.48)', () => {
    // PHB p.48: L1–8 rage damage bonus is +2.
    // R-COERCE: {rageBonus} compiles to the STRING '2' (compile.ts:67 String(value));
    // Number()-coerce the compiled value for comparison.
    const compiled = buildRage(RAGER_ID, levelToBonus(1), 2); // bonus:2 for L1

    const compiledNum = compiled.find((i) => i.def.kind === 'num')!;
    expect(compiledNum).toBeDefined();

    if (compiledNum.def.kind === 'num') {
      // R-COERCE: coerce to number
      expect(Number(compiledNum.def.value)).toBe(2);
    }
  });
});

// ── S-10: ResistMods (REQ-RAGE-DOC-05, REQ-RAGE-COMPILE-05) ─────────────────

describe('rageRuleDoc — ResistMod emits (REQ-RAGE-DOC-05, REQ-RAGE-COMPILE-05)', () => {
  it('S-10: produces exactly 3 ResistMod instances, one per damage type', () => {
    // PHB p.48 — "resistance to bludgeoning, piercing, and slashing damage"
    // REQ-RAGE-COMPILE-05
    const instances = buildRage(RAGER_ID, 2, 2);
    const resist = instances.filter((i) => i.def.kind === 'resist');
    expect(resist).toHaveLength(3);
  });

  it('ResistMods cover bludgeoning, piercing, slashing with mode:half (PHB p.48)', () => {
    const instances = buildRage(RAGER_ID, 2, 2);
    const resist = instances.filter((i) => i.def.kind === 'resist');
    const damageTypes = resist.map((i) => (i.def.kind === 'resist' ? i.def.damageType : ''));
    expect(damageTypes).toContain('bludgeoning');
    expect(damageTypes).toContain('piercing');
    expect(damageTypes).toContain('slashing');
    for (const inst of resist) {
      if (inst.def.kind === 'resist') {
        expect(inst.def.mode).toBe('half');
      }
    }
  });

  it('ResistMods use target:{axis:self} (ADR-4a)', () => {
    const instances = buildRage(RAGER_ID, 2, 2);
    const resist = instances.filter((i) => i.def.kind === 'resist');
    for (const inst of resist) {
      expect(inst.scope.target.axis).toBe('self');
    }
  });
});

// ── S-12: UsageMod (REQ-RAGE-DOC-06, REQ-RAGE-COMPILE-06) ───────────────────

describe('rageRuleDoc — UsageMod emit (REQ-RAGE-DOC-06, REQ-RAGE-COMPILE-06)', () => {
  it('S-12: produces exactly 1 UsageMod with pool:count, count:4, resetOn:long-rest', () => {
    // PHB p.48 — rages per long rest; shape-only (no evaluator in Batch 1)
    // R-COERCE: {rageCount} compiles to STRING; Number() coercion required.
    const instances = buildRage(RAGER_ID, 2, 4);
    const usage = instances.filter((i) => i.def.kind === 'usage');
    expect(usage).toHaveLength(1);
    const u = usage[0]!;
    expect(u.def.kind).toBe('usage');
    if (u.def.kind === 'usage') {
      expect(u.def.pool).toBe('count');
      // R-COERCE: count is the string '4' after template substitution
      expect(Number((u.def as { pool: string; count?: unknown }).count)).toBe(4);
      expect(u.def.resetOn).toBe('long-rest');
    }
  });
});

// ── REQ-CHAR-* characterization tests (converted from REQ-PARITY-*, REQ-PARITY-CONV-01) ────

describe('rageRuleDoc — REQ-CHAR-01: NumMod value at level tiers (PHB p.48)', () => {
  // PHB p.48 — Rage Damage column: +2 (L1-8), +3 (L9-15), +4 (L16+)
  it('REQ-CHAR-01a: rageBonus:2 → exactly 1 NumMod with value===2 (L1-8 tier)', () => {
    // PHB p.48 — Rage Damage column: +2 (L1-8), +3 (L9-15), +4 (L16+)
    const compiled = buildRage(RAGER_ID, levelToBonus(1), 2);
    const nums = compiled.filter((i) => i.def.kind === 'num' && i.def.stat === 'damage');
    expect(nums).toHaveLength(1);
    const num = nums[0]!;
    if (num.def.kind === 'num') {
      expect(Number(num.def.value)).toBe(2);
    }
  });

  it('REQ-CHAR-01b: rageBonus:3 → exactly 1 NumMod with value===3 (L9-15 tier)', () => {
    // PHB p.48 — Rage Damage column: +2 (L1-8), +3 (L9-15), +4 (L16+)
    const compiled = buildRage(RAGER_ID, levelToBonus(9), 2);
    const nums = compiled.filter((i) => i.def.kind === 'num' && i.def.stat === 'damage');
    expect(nums).toHaveLength(1);
    const num = nums[0]!;
    if (num.def.kind === 'num') {
      expect(Number(num.def.value)).toBe(3);
    }
  });

  it('REQ-CHAR-01c: rageBonus:4 → exactly 1 NumMod with value===4 (L16+ tier)', () => {
    // PHB p.48 — Rage Damage column: +2 (L1-8), +3 (L9-15), +4 (L16+)
    const compiled = buildRage(RAGER_ID, levelToBonus(16), 2);
    const nums = compiled.filter((i) => i.def.kind === 'num' && i.def.stat === 'damage');
    expect(nums).toHaveLength(1);
    const num = nums[0]!;
    if (num.def.kind === 'num') {
      expect(Number(num.def.value)).toBe(4);
    }
  });
});

describe('rageRuleDoc — REQ-CHAR-02: ResistMods (PHB p.48)', () => {
  it('REQ-CHAR-02: exactly 3 ResistMods with mode:half covering bludgeoning/piercing/slashing, target:self', () => {
    // PHB p.48 — While raging you have resistance to bludgeoning, piercing, and slashing damage
    const compiled = buildRage(RAGER_ID, 2, 2);
    const resist = compiled.filter((i) => i.def.kind === 'resist');
    expect(resist).toHaveLength(3);
    const damageTypes = new Set(
      resist.map((i) => (i.def.kind === 'resist' ? i.def.damageType : '')),
    );
    expect(damageTypes).toEqual(new Set(['bludgeoning', 'piercing', 'slashing']));
    for (const inst of resist) {
      if (inst.def.kind === 'resist') {
        expect(inst.def.mode).toBe('half');
      }
      expect(inst.scope.target.axis).toBe('self');
    }
  });
});

describe('rageRuleDoc — REQ-CHAR-03: AdvantageMods (PHB p.48)', () => {
  it('REQ-CHAR-03: exactly 2 AdvantageMods with rollTypes check+save, target:self', () => {
    // PHB p.48 — While raging you have advantage on Strength checks and Strength saving throws
    const compiled = buildRage(RAGER_ID, 2, 2);
    const adv = compiled.filter((i) => i.def.kind === 'advantage');
    expect(adv).toHaveLength(2);
    const rollTypes = new Set(
      adv.map((i) => (i.def.kind === 'advantage' ? i.def.rollType : '')),
    );
    expect(rollTypes).toEqual(new Set(['check', 'save']));
    for (const inst of adv) {
      expect(inst.scope.target.axis).toBe('self');
    }
  });
});

describe('rageRuleDoc — REQ-CHAR-04: all emits carry target:{axis:self} (PHB p.48)', () => {
  it('REQ-CHAR-04: every modifier instance in build output has target:{axis:self}', () => {
    // PHB p.48 — rage bonus, resistance, and advantage apply to the rager (self)
    const compiled = buildRage(RAGER_ID, 2, 2);
    for (const inst of compiled) {
      expect(inst.scope.target.axis).toBe('self');
    }
  });
});

describe('rageRuleDoc — REQ-CHAR-DIVERGENCE: STR-divergence documented (ADR-5)', () => {
  it('REQ-CHAR-DIVERGENCE: advantage predicate is hasCondition (NOT usesAbility) — STR fix deferred to Batch 2', () => {
    // PHB p.48 restricts advantage to STR checks/saves; the DSL lacks usesAbility WorldQuery.
    // This documents the shared divergence (STR fix deferred to Batch 2).
    const compiled = buildRage(RAGER_ID, 2, 2);
    const compiledAdv = compiled.filter((i) => i.def.kind === 'advantage');
    for (const inst of compiledAdv) {
      const pred = inst.predicate as { op?: string; q?: { kind?: string } } | undefined;
      if (pred?.op === 'query') {
        expect(pred.q?.kind).not.toBe('usesAbility');
      }
    }
  });
});


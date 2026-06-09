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
import { buildRageModifiers } from '../rules/rage.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

const RAGER_ID = 'char-001' as EntityId;

// PHB p.48 rage bonus table (mirrors legacy rageBonus helper in rules/rage.ts)
function levelToBonus(level: number): 2 | 3 | 4 {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

// PHB p.48 rages per long rest table (L1-8: 2, L9-11: 3, L12-15: 4, L16-19: 5/6, L20: unlimited)
// For parity purposes use the same count boundaries as the bonus table:
//   L1-8: 2 rages, L9-15: 3 rages, L16+: 4 rages (simplified for shape-only test)
function levelToCount(level: number): number {
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

// ── T-11 / T-12: Parity tests (REQ-PARITY-01..06) ────────────────────────────

describe('rageRuleDoc — parity vs buildRageModifiers (REQ-PARITY-01..06)', () => {
  // PHB p.48 restricts advantage to STR checks/saves; both old and new share this
  // divergence (usesAbility WorldQuery absent) — see TODO inline in rageRuleDoc.
  // S-17: document the shared divergence explicitly.

  it('S-13: AdvantageMod channel parity at L1 — count, def, owner (REQ-PARITY-01, REQ-PARITY-02)', () => {
    // REQ-PARITY-02: parity is BEHAVIORAL on target (axis:'self' vs entities:[ragerId]).
    // query.ts:67: axis:'self' resolves as owner===self; under owner=ragerId both
    // collapse to the same entity set {ragerId}. Do NOT byte-compare target.
    // PHB p.48 — advantage on Strength checks and saves.
    const legacy = buildRageModifiers(1, RAGER_ID);
    if (!legacy.ok) throw new Error('legacy build failed');
    const compiled = buildRage(RAGER_ID, 2, 2);

    const legacyAdv = legacy.instances;
    const compiledAdv = compiled.filter((i) => i.def.kind === 'advantage');

    // Count parity
    expect(compiledAdv).toHaveLength(legacyAdv.length);
    expect(compiledAdv).toHaveLength(2);

    // def kind/mode parity
    for (const legInst of legacyAdv) {
      const matchCompiled = compiledAdv.find(
        (ci) =>
          ci.def.kind === legInst.def.kind &&
          ci.def.kind === 'advantage' &&
          legInst.def.kind === 'advantage' &&
          ci.def.rollType === legInst.def.rollType,
      );
      expect(matchCompiled, `No matching compiled AdvantageMod for rollType:${legInst.def.kind === 'advantage' ? legInst.def.rollType : '?'}`).toBeDefined();
    }

    // rollType set parity: {check, save}
    const compiledRollTypes = new Set(
      compiledAdv.map((i) => (i.def.kind === 'advantage' ? i.def.rollType : '')),
    );
    const legacyRollTypes = new Set(
      legacyAdv.map((i) => (i.def.kind === 'advantage' ? i.def.rollType : '')),
    );
    expect(compiledRollTypes).toEqual(legacyRollTypes);

    // Owner parity
    for (const inst of compiledAdv) {
      expect(inst.scope.owner).toBe(RAGER_ID);
    }

    // Target normalization (REQ-PARITY-02, R-TARGET-NORM):
    // authored uses axis:'self', legacy uses axis:'entities', ids:[ragerId].
    // Both resolve to entity set {ragerId} under owner=ragerId (query.ts:67).
    // Normalize and compare:
    function normalizeTargetToEntitySet(inst: ModifierInstance, ownerId: EntityId): Set<string> {
      const target = inst.scope.target;
      if (target.axis === 'self') {
        // axis:'self' resolves as owner===self at query time (query.ts:67)
        return new Set([inst.scope.owner as string]);
      }
      if (target.axis === 'entities') {
        return new Set(target.ids.map(String));
      }
      return new Set([ownerId as string]);
    }

    for (let i = 0; i < compiledAdv.length; i++) {
      const compTarget = normalizeTargetToEntitySet(compiledAdv[i]!, RAGER_ID);
      const legTarget = normalizeTargetToEntitySet(legacyAdv[i]!, RAGER_ID);
      expect(compTarget).toEqual(legTarget);
    }
  });

  it('S-14: ResistMod channel parity at L1 — count + damageType set + mode (REQ-PARITY-04)', () => {
    // PHB p.48 — bludgeoning/piercing/slashing resistance (level-independent).
    // Parity is on the def payload (kind/damageType/mode), NOT the envelope
    // (authored adds self-scope+predicate; legacy resistMods are bare).
    const legacy = buildRageModifiers(1, RAGER_ID);
    if (!legacy.ok) throw new Error('legacy build failed');
    const compiled = buildRage(RAGER_ID, 2, 2);

    const legacyResist = legacy.resistMods;
    const compiledResist = compiled.filter((i) => i.def.kind === 'resist');

    // Count parity
    expect(compiledResist).toHaveLength(legacyResist.length);
    expect(compiledResist).toHaveLength(3);

    // damageType set equality (order-independent)
    const compiledDmgTypes = new Set(
      compiledResist.map((i) => (i.def.kind === 'resist' ? i.def.damageType : '')),
    );
    const legacyDmgTypes = new Set(legacyResist.map((r) => r.damageType));
    expect(compiledDmgTypes).toEqual(legacyDmgTypes);

    // mode equality: all half
    for (const inst of compiledResist) {
      if (inst.def.kind === 'resist') {
        expect(inst.def.mode).toBe('half');
      }
    }
    for (const r of legacyResist) {
      expect(r.mode).toBe('half');
    }
  });

  it('S-15: NumMod value parity at L9 — bonus:3 (REQ-PARITY-03, REQ-PARITY-06)', () => {
    // PHB p.48: L9–15 bonus is +3.
    // R-COERCE: compiled def.value is STRING '3'; legacy numMod.value is NUMBER 3.
    // Parity assertion MUST Number()-coerce the compiled value.
    const level = 9;
    const bonus = levelToBonus(level);
    const legacy = buildRageModifiers(level, RAGER_ID);
    if (!legacy.ok) throw new Error('legacy build failed');
    const compiled = buildRage(RAGER_ID, bonus, levelToCount(level));

    const compiledNum = compiled.find((i) => i.def.kind === 'num')!;
    expect(compiledNum).toBeDefined();

    if (compiledNum.def.kind === 'num') {
      // R-COERCE: coerce both sides to compare numerically
      expect(Number(compiledNum.def.value)).toBe(legacy.numMod.value);
      expect(compiledNum.def.stat).toBe(legacy.numMod.stat);
      expect(compiledNum.def.op).toBe(legacy.numMod.op);
    }

    // NumMod predicate asymmetry (REQ-PARITY-03, documented difference):
    // legacy numMod is BARE (no predicate — use-case wraps it with MELEE+STR predicate)
    // authored embeds weaponKind:melee + hasCondition:Raging predicate (DSL improvement)
    expect(legacy.numMod).not.toHaveProperty('predicate');
    expect(compiledNum.predicate).toBeDefined();
  });

  it('S-16: NumMod value parity at L16 — bonus:4 (REQ-PARITY-06)', () => {
    // PHB p.48: L16+ bonus is +4.
    const level = 16;
    const bonus = levelToBonus(level);
    const legacy = buildRageModifiers(level, RAGER_ID);
    if (!legacy.ok) throw new Error('legacy build failed');
    const compiled = buildRage(RAGER_ID, bonus, levelToCount(level));

    const compiledNum = compiled.find((i) => i.def.kind === 'num')!;
    if (compiledNum.def.kind === 'num') {
      expect(Number(compiledNum.def.value)).toBe(legacy.numMod.value);
      expect(Number(compiledNum.def.value)).toBe(4);
    }
  });

  it('S-17: inherited STR-divergence — both lack usesAbility filter (REQ-PARITY-05)', () => {
    // PHB p.48 restricts advantage to STR checks/saves; both old and new share this
    // divergence (usesAbility WorldQuery absent) — see TODO inline in rageRuleDoc.
    const legacy = buildRageModifiers(1, RAGER_ID);
    if (!legacy.ok) throw new Error('legacy build failed');
    const compiled = buildRage(RAGER_ID, 2, 2);

    const legacyAdv = legacy.instances;
    const compiledAdv = compiled.filter((i) => i.def.kind === 'advantage');

    // Neither should have a usesAbility filter (both share the STR-divergence)
    for (const inst of legacyAdv) {
      // Legacy advantage instances have no predicate at all
      expect(inst.predicate).toBeUndefined();
    }

    // Compiled instances DO have a hasCondition:Raging predicate (DSL improvement)
    // but NOT a usesAbility filter (shared divergence)
    for (const inst of compiledAdv) {
      const pred = inst.predicate as { op?: string; q?: { kind?: string } } | undefined;
      // The predicate is hasCondition, NOT usesAbility
      if (pred?.op === 'query') {
        expect(pred.q?.kind).not.toBe('usesAbility');
      }
    }
  });
});

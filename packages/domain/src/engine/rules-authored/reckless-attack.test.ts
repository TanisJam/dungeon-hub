/**
 * TDD tests for recklessAttackRuleDoc — DSL authoring of Reckless Attack (Barbarian).
 *
 * PHB p.48 — Reckless Attack (Barbarian):
 *   "When you make your first attack on your turn, you can decide to attack recklessly.
 *    Doing so gives you advantage on melee weapon attack rolls using Strength during
 *    this turn, but attack rolls against you have advantage until the start of your next turn."
 *
 * RED→GREEN cycles:
 *   T3.1: RED — file does not exist yet
 *   T3.2: GREEN — implement recklessAttackRuleDoc
 *
 * REQ-RECKLESS-01, REQ-RECKLESS-02, SCENARIO-06..09.
 */
import { describe, it, expect } from 'vitest';
import { RuleDocSchema } from '../authoring/schema.js';
import { compileRule } from '../authoring/compile.js';
import { evaluatePredicate } from '../predicate/evaluate.js';
import { recklessAttackRuleDoc } from './reckless-attack.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

const RECKLESS_ID = 'char-barb-001' as EntityId;

function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    self: { id: RECKLESS_ID, conditions: [] },
    activeConditions: [],
    ...overrides,
  };
}

// ── Schema validity ───────────────────────────────────────────────────────────

describe('recklessAttackRuleDoc — schema validity', () => {
  it('RuleDocSchema.safeParse(recklessAttackRuleDoc) returns success:true (SCENARIO-22 baseline)', () => {
    // REQ-RECKLESS-01/02: authored rule MUST be valid against RuleDocSchema.
    const result = RuleDocSchema.safeParse(recklessAttackRuleDoc);
    expect(result.success).toBe(true);
  });

  it('has id:reckless-attack and source cites PHB p.48', () => {
    expect(recklessAttackRuleDoc.id).toBe('reckless-attack');
    expect(recklessAttackRuleDoc.source).toContain('PHB p.48');
  });

  it('declares 1 param: recklessId (EntityId)', () => {
    expect(recklessAttackRuleDoc.params).toHaveLength(1);
    expect(recklessAttackRuleDoc.params[0]!.name).toBe('recklessId');
    expect(recklessAttackRuleDoc.params[0]!.type).toBe('EntityId');
  });
});

// ── Emit count and shape ──────────────────────────────────────────────────────

describe('recklessAttackRuleDoc — emit count and shape', () => {
  it('has exactly 2 emits', () => {
    expect(recklessAttackRuleDoc.emits).toHaveLength(2);
  });

  it('emit[0] is advantage/grant on attack-roll, axis:self (SCENARIO-06 — REQ-RECKLESS-01)', () => {
    // PHB p.48: "you can decide to attack recklessly...advantage on melee weapon attack rolls
    //            using Strength during this turn"
    const emit = recklessAttackRuleDoc.emits[0]!;
    expect(emit.def.kind).toBe('advantage');
    if (emit.def.kind === 'advantage') {
      expect(emit.def.mode).toBe('grant');
      expect(emit.def.rollType).toBe('attack');
    }
    expect(emit.scope.trigger).toBe('on-attack-roll');
    expect(emit.scope.target.axis).toBe('self');
  });

  it('emit[1] is advantage/impose on attack-roll, axis:attackers-of (SCENARIO-08 — REQ-RECKLESS-02)', () => {
    // PHB p.48: "attack rolls against you have advantage until the start of your next turn"
    const emit = recklessAttackRuleDoc.emits[1]!;
    expect(emit.def.kind).toBe('advantage');
    if (emit.def.kind === 'advantage') {
      expect(emit.def.mode).toBe('impose');
      expect(emit.def.rollType).toBe('attack');
    }
    expect(emit.scope.trigger).toBe('on-attack-roll');
    expect(emit.scope.target.axis).toBe('attackers-of');
  });
});

// ── Grant predicate: AND[hasCondition:RecklessAttacking, usesAbility:str, weaponKind:melee] ──

describe('recklessAttackRuleDoc — grant predicate (SCENARIO-06, SCENARIO-07)', () => {
  it('grant emit predicate contains AND node (SCENARIO-06)', () => {
    const emit = recklessAttackRuleDoc.emits[0]!;
    expect(emit.predicate).toBeDefined();
    const pred = emit.predicate as { op: string };
    expect(pred.op).toBe('and');
  });

  it('grant predicate nodes include hasCondition:RecklessAttacking (SCENARIO-06)', () => {
    const emit = recklessAttackRuleDoc.emits[0]!;
    const pred = emit.predicate as { op: string; nodes?: Array<{ op: string; q?: { kind: string; condition?: string; ability?: string; is?: string } }> };
    const nodes = pred.nodes ?? [];
    expect(nodes.some((n) => n.q?.kind === 'hasCondition' && n.q?.condition === 'RecklessAttacking')).toBe(true);
  });

  it('grant predicate nodes include usesAbility:str (SCENARIO-06)', () => {
    const emit = recklessAttackRuleDoc.emits[0]!;
    const pred = emit.predicate as { op: string; nodes?: Array<{ op: string; q?: { kind: string; ability?: string } }> };
    const nodes = pred.nodes ?? [];
    expect(nodes.some((n) => n.q?.kind === 'usesAbility' && n.q?.ability === 'str')).toBe(true);
  });

  it('grant predicate nodes include weaponKind:melee (SCENARIO-06)', () => {
    const emit = recklessAttackRuleDoc.emits[0]!;
    const pred = emit.predicate as { op: string; nodes?: Array<{ op: string; q?: { kind: string; is?: string } }> };
    const nodes = pred.nodes ?? [];
    expect(nodes.some((n) => n.q?.kind === 'weaponKind' && n.q?.is === 'melee')).toBe(true);
  });

  it('SCENARIO-07: grant predicate evaluates false when abilityUsed is dex (DEX finesse — no reckless advantage)', () => {
    // PHB p.48: "advantage on melee weapon attack rolls using Strength" — DEX finesse → NOT included
    const compiled = compileRule(recklessAttackRuleDoc);
    const instances = compiled.build({ recklessId: RECKLESS_ID });
    const grantInstance = instances.find((i) => i.def.kind === 'advantage' && i.def.kind === 'advantage' && 'mode' in i.def && i.def.mode === 'grant')!;
    expect(grantInstance).toBeDefined();
    expect(grantInstance.predicate).toBeDefined();

    // ctx: has RecklessAttacking, weapon is melee finesse but DEX wins
    const ctx = makeCtx({
      activeConditions: [{ name: 'RecklessAttacking' }],
      weaponInUse: { kind: 'melee', properties: ['finesse'], abilityUsed: 'dex' },
    });
    const result = evaluatePredicate(grantInstance.predicate!, ctx);
    expect(result).toBe(false);
  });

  it('SCENARIO-06: grant predicate evaluates true when STR melee + RecklessAttacking', () => {
    // PHB p.48: STR melee attack while RecklessAttacking → grant advantage
    const compiled = compileRule(recklessAttackRuleDoc);
    const instances = compiled.build({ recklessId: RECKLESS_ID });
    const grantInstance = instances.find((i) => i.def.kind === 'advantage' && 'mode' in i.def && i.def.mode === 'grant')!;
    expect(grantInstance).toBeDefined();
    expect(grantInstance.predicate).toBeDefined();

    const ctx = makeCtx({
      activeConditions: [{ name: 'RecklessAttacking' }],
      weaponInUse: { kind: 'melee', properties: [], abilityUsed: 'str' },
    });
    const result = evaluatePredicate(grantInstance.predicate!, ctx);
    expect(result).toBe(true);
  });
});

// ── Impose predicate: hasCondition:RecklessAttacking (NO usesAbility) ─────────

describe('recklessAttackRuleDoc — impose predicate (SCENARIO-08, SCENARIO-09)', () => {
  it('impose emit predicate is hasCondition:RecklessAttacking (SCENARIO-08)', () => {
    // PHB p.48: "attack rolls against you have advantage" — ALL attacks, no usesAbility gate
    const emit = recklessAttackRuleDoc.emits[1]!;
    expect(emit.predicate).toBeDefined();
    // predicate can be a direct query or AND[query] — either way: hasCondition, NOT usesAbility
    const pred = emit.predicate as { op: string; q?: { kind: string; condition?: string }; nodes?: Array<{ q?: { kind: string } }> };
    const hasConditionPresent =
      (pred.op === 'query' && pred.q?.kind === 'hasCondition') ||
      (pred.op === 'and' && pred.nodes?.some((n) => n.q?.kind === 'hasCondition'));
    expect(hasConditionPresent).toBe(true);
  });

  it('impose predicate does NOT contain usesAbility node (SCENARIO-08 — all attacks, no STR gate)', () => {
    // PHB p.48: attacks AGAINST the barbarian have advantage — any ability, any weapon
    const emit = recklessAttackRuleDoc.emits[1]!;
    const pred = emit.predicate as { op: string; q?: { kind: string }; nodes?: Array<{ q?: { kind: string } }> };
    const usesAbilityPresent =
      (pred.op === 'query' && pred.q?.kind === 'usesAbility') ||
      (pred.op === 'and' && pred.nodes?.some((n) => n.q?.kind === 'usesAbility'));
    expect(usesAbilityPresent).toBe(false);
  });

  it('SCENARIO-09: impose predicate evaluates false when RecklessAttacking not active', () => {
    // PHB p.48: impose only applies while barbarian declared reckless
    const compiled = compileRule(recklessAttackRuleDoc);
    const instances = compiled.build({ recklessId: RECKLESS_ID });
    const imposeInstance = instances.find((i) => i.def.kind === 'advantage' && 'mode' in i.def && i.def.mode === 'impose')!;
    expect(imposeInstance).toBeDefined();
    expect(imposeInstance.predicate).toBeDefined();

    const ctx = makeCtx({
      activeConditions: [], // NO RecklessAttacking condition
    });
    const result = evaluatePredicate(imposeInstance.predicate!, ctx);
    expect(result).toBe(false);
  });

  it('SCENARIO-08: impose predicate evaluates true when RecklessAttacking active', () => {
    const compiled = compileRule(recklessAttackRuleDoc);
    const instances = compiled.build({ recklessId: RECKLESS_ID });
    const imposeInstance = instances.find((i) => i.def.kind === 'advantage' && 'mode' in i.def && i.def.mode === 'impose')!;
    expect(imposeInstance).toBeDefined();
    expect(imposeInstance.predicate).toBeDefined();

    const ctx = makeCtx({
      activeConditions: [{ name: 'RecklessAttacking' }],
    });
    const result = evaluatePredicate(imposeInstance.predicate!, ctx);
    expect(result).toBe(true);
  });
});

/**
 * TDD tests for dangerSenseRuleDoc — DSL authoring of Danger Sense (Barbarian).
 *
 * PHB p.48 — Danger Sense (Barbarian):
 *   "At 2nd level, you gain an uncanny sense of when things nearby aren't as they should be,
 *    giving you an edge when you dodge away from danger. You have advantage on Dexterity saving
 *    throws against effects that you can see, such as traps and spells. To gain this benefit,
 *    you can't be blinded, deafened, or incapacitated."
 *
 * RUNTIME NOTE: The dangerSenseRuleDoc is runtime-inert this batch — no save-gather step
 * in performForcedCheck. The doc is compiled and tested here for shape correctness.
 * See follow-up SDD: engine-save-advantage-gather.
 * DIV-02: "effects you can see" is approximated as !Blinded (no canSeeEffect predicate).
 * DIV-03: DEX-save targeting expressed via rollType:'save' only (no per-ability save rollType).
 *
 * RED→GREEN cycles:
 *   T3.3: RED — file does not exist yet
 *   T3.4: GREEN — implement dangerSenseRuleDoc
 *
 * REQ-DS-01, SCENARIO-18..20.
 */
import { describe, it, expect } from 'vitest';
import { RuleDocSchema } from '../authoring/schema.js';
import { compileRule } from '../authoring/compile.js';
import { evaluatePredicate } from '../predicate/evaluate.js';
import { dangerSenseRuleDoc } from './danger-sense.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

const BARB_ID = 'char-barb-002' as EntityId;

function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    self: { id: BARB_ID, conditions: [] },
    activeConditions: [],
    ...overrides,
  };
}

// ── Schema validity ───────────────────────────────────────────────────────────

describe('dangerSenseRuleDoc — schema validity', () => {
  it('RuleDocSchema.safeParse(dangerSenseRuleDoc) returns success:true', () => {
    // REQ-DS-01: authored rule MUST be valid against RuleDocSchema.
    const result = RuleDocSchema.safeParse(dangerSenseRuleDoc);
    expect(result.success).toBe(true);
  });

  it('has id:danger-sense and source cites PHB p.48', () => {
    expect(dangerSenseRuleDoc.id).toBe('danger-sense');
    expect(dangerSenseRuleDoc.source).toContain('PHB p.48');
  });
});

// ── SCENARIO-18: emit shape ───────────────────────────────────────────────────

describe('dangerSenseRuleDoc — SCENARIO-18: emit shape assertions (REQ-DS-01)', () => {
  it('has exactly 1 emit', () => {
    // REQ-DS-01: 1 emit only
    expect(dangerSenseRuleDoc.emits).toHaveLength(1);
  });

  it('emit[0].trigger === on-save (SCENARIO-18)', () => {
    expect(dangerSenseRuleDoc.emits[0]!.scope.trigger).toBe('on-save');
  });

  it('emit[0].scope.target.axis === self (SCENARIO-18)', () => {
    expect(dangerSenseRuleDoc.emits[0]!.scope.target.axis).toBe('self');
  });

  it('emit[0].def is advantage/grant/save (SCENARIO-18)', () => {
    // REQ-DS-01: advantage/grant, rollType:'save'
    const emit = dangerSenseRuleDoc.emits[0]!;
    expect(emit.def.kind).toBe('advantage');
    if (emit.def.kind === 'advantage') {
      expect(emit.def.mode).toBe('grant');
      expect(emit.def.rollType).toBe('save');
    }
  });

  it('predicate includes NOT-Blinded, NOT-Deafened, NOT-Incapacitated (SCENARIO-18)', () => {
    // PHB p.48: "you can't be blinded, deafened, or incapacitated"
    const emit = dangerSenseRuleDoc.emits[0]!;
    expect(emit.predicate).toBeDefined();
    const pred = emit.predicate!;

    // Helper: flatten all condition names from NOT(hasCondition:X) nodes
    function collectNotConditions(p: unknown): string[] {
      const node = p as { op?: string; node?: unknown; nodes?: unknown[]; q?: { kind?: string; condition?: string } };
      if (node.op === 'not' && node.node) {
        const inner = node.node as { op?: string; q?: { kind?: string; condition?: string } };
        if (inner.op === 'query' && inner.q?.kind === 'hasCondition' && inner.q?.condition) {
          return [inner.q.condition];
        }
      }
      if (node.op === 'and' && node.nodes) {
        return node.nodes.flatMap((n) => collectNotConditions(n));
      }
      return [];
    }

    const notConditions = collectNotConditions(pred);
    expect(notConditions).toContain('Blinded');
    expect(notConditions).toContain('Deafened');
    expect(notConditions).toContain('Incapacitated');
  });
});

// ── Predicate evaluation ──────────────────────────────────────────────────────

describe('dangerSenseRuleDoc — predicate evaluation (SCENARIO-19, SCENARIO-20)', () => {
  it('SCENARIO-19: Blinded condition → predicate false', () => {
    // PHB p.48: "you can't be blinded" → danger sense suppressed
    const compiled = compileRule(dangerSenseRuleDoc);
    const instances = compiled.build({ barbarianId: BARB_ID });
    expect(instances).toHaveLength(1);
    const inst = instances[0]!;
    expect(inst.predicate).toBeDefined();

    const ctx = makeCtx({
      activeConditions: [{ name: 'Blinded' }],
    });
    expect(evaluatePredicate(inst.predicate!, ctx)).toBe(false);
  });

  it('SCENARIO-20: no impairing conditions + DEX save ctx → predicate true', () => {
    // PHB p.48: "you can't be blinded, deafened, or incapacitated"
    // B6 amendment: ctx.save.ability must be 'dex' (saveAbility:dex node added in REQ-RAGE-03).
    // Without ctx.save, the new leaf returns false (fail-closed — D2). Must provide DEX save ctx.
    const compiled = compileRule(dangerSenseRuleDoc);
    const instances = compiled.build({ barbarianId: BARB_ID });
    const inst = instances[0]!;
    expect(inst.predicate).toBeDefined();

    const ctx = makeCtx({
      activeConditions: [],
      save: { ability: 'dex' }, // B6: must provide DEX save context for saveAbility:dex to pass
    });
    expect(evaluatePredicate(inst.predicate!, ctx)).toBe(true);
  });

  it('Deafened condition → predicate false', () => {
    // PHB p.48: "you can't be ... deafened"
    const compiled = compileRule(dangerSenseRuleDoc);
    const inst = compiled.build({ barbarianId: BARB_ID })[0]!;
    const ctx = makeCtx({ activeConditions: [{ name: 'Deafened' }] });
    expect(evaluatePredicate(inst.predicate!, ctx)).toBe(false);
  });

  it('Incapacitated condition → predicate false', () => {
    // PHB p.48: "you can't be ... incapacitated"
    const compiled = compileRule(dangerSenseRuleDoc);
    const inst = compiled.build({ barbarianId: BARB_ID })[0]!;
    const ctx = makeCtx({ activeConditions: [{ name: 'Incapacitated' }] });
    expect(evaluatePredicate(inst.predicate!, ctx)).toBe(false);
  });
});

// ── B6: Danger Sense saveAbility:dex amendment (REQ-RAGE-03, D5) ────────────

describe('dangerSenseRuleDoc — B6 amendment: saveAbility:dex AND-node (REQ-RAGE-03, D5)', () => {
  it('DS-emit1 (RED→GREEN): predicate MUST contain saveAbility:dex node (REQ-RAGE-03, PHB p.48)', () => {
    // PHB p.48: "advantage on Dexterity saving throws" — saveAbility:dex gates DEX saves only.
    // D5: AND[!Blinded, !Deafened, !Incapacitated, saveAbility:dex] (new leaf added to existing cluster).
    // Gate A in perform-forced-check.ts (ability==='dex') will be deleted after this leaf is live.
    // RED: current danger-sense.ts has no saveAbility leaf — this test fails until amended.
    const emit = dangerSenseRuleDoc.emits[0]!;
    expect(emit.predicate).toBeDefined();

    // Walk the predicate tree to find a saveAbility:dex node
    function hasSaveAbilityDex(pred: unknown): boolean {
      const node = pred as { op?: string; q?: { kind?: string; ability?: string }; nodes?: unknown[]; node?: unknown };
      if (node.op === 'query' && node.q?.kind === 'saveAbility' && node.q?.ability === 'dex') return true;
      if (node.op === 'and' && node.nodes) return node.nodes.some(hasSaveAbilityDex);
      if (node.op === 'not' && node.node) return hasSaveAbilityDex(node.node);
      return false;
    }

    expect(hasSaveAbilityDex(emit.predicate)).toBe(true);
  });

  it('DS-predicate is still op:and with NOT-Blinded, NOT-Deafened, NOT-Incapacitated (regression)', () => {
    // B6 amendment must NOT remove the existing condition guards (PHB p.48)
    const emit = dangerSenseRuleDoc.emits[0]!;
    const pred = emit.predicate!;

    function collectNotConditions(p: unknown): string[] {
      const node = p as { op?: string; node?: unknown; nodes?: unknown[]; q?: { kind?: string; condition?: string } };
      if (node.op === 'not' && node.node) {
        const inner = node.node as { op?: string; q?: { kind?: string; condition?: string } };
        if (inner.op === 'query' && inner.q?.kind === 'hasCondition' && inner.q?.condition) {
          return [inner.q.condition];
        }
      }
      if (node.op === 'and' && node.nodes) return node.nodes.flatMap((n) => collectNotConditions(n));
      return [];
    }

    const notConditions = collectNotConditions(pred);
    expect(notConditions).toContain('Blinded');
    expect(notConditions).toContain('Deafened');
    expect(notConditions).toContain('Incapacitated');
  });
});

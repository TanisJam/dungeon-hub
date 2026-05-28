/**
 * Tests for compileRule — engine/authoring/compile.ts
 *
 * REQ-COMPILE-01: compileRule — YAML rule to ModifierInstance factory.
 *
 * compileRule(rule: RuleDoc) → CompiledRule
 * CompiledRule.build(params: RuleParams) → ModifierInstance[]
 *
 * Scenarios:
 *   (a) ID from idTemplate slot substitution ({ruleId}-{role}-{owner}-{target})
 *   (b) 2-emit rule (Cloak of Protection) → array length 2
 *   (c) array-param fan-out → N instances for N-element array (mirrors Bless per-target)
 *   (d) escape-hatch rule → {escaped:true, handlerRef} and build() throws EscapeHatchNotImplemented
 */
import { describe, it, expect } from 'vitest';
import { compileRule, EscapeHatchNotImplemented } from './compile.js';
import { parseRule } from './parse.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal valid num rule with one emit and a single EntityId param */
function makeSimpleNumRule() {
  const parsed = parseRule({
    id: 'resilient-con',
    source: 'PHB 168',
    params: [{ name: 'owner', type: 'EntityId' }],
    emits: [
      {
        def: { kind: 'proficiency', domain: 'save', ref: 'con' },
        scope: {
          owner: '{owner}',
          target: { axis: 'self' },
          trigger: 'always',
        },
        idTemplate: '{ruleId}-save-{owner}-{owner}',
      },
    ],
    testCases: [],
  });
  if (!parsed.ok) throw new Error('Test setup failed: ' + JSON.stringify(parsed.issues));
  return parsed.rule;
}

/** Cloak-like rule with 2 emits (AC + saving-throw) */
function makeTwoEmitRule() {
  const parsed = parseRule({
    id: 'cloak-of-protection',
    source: 'DMG 159',
    params: [{ name: 'owner', type: 'EntityId' }],
    emits: [
      {
        def: { kind: 'num', op: 'add', value: 1, stat: 'ac', category: 'item' },
        scope: { owner: '{owner}', target: { axis: 'self' }, trigger: 'always' },
        idTemplate: '{ruleId}-ac-{owner}',
      },
      {
        def: { kind: 'num', op: 'add', value: 1, stat: 'saving-throw', category: 'item' },
        scope: { owner: '{owner}', target: { axis: 'self' }, trigger: 'always' },
        idTemplate: '{ruleId}-save-{owner}',
      },
    ],
    testCases: [],
  });
  if (!parsed.ok) throw new Error('Test setup failed: ' + JSON.stringify(parsed.issues));
  return parsed.rule;
}

/** Bless-like rule with array fan-out (targetIds: EntityId[]) */
function makeArrayFanOutRule() {
  const parsed = parseRule({
    id: 'bless-like',
    source: 'PHB 219',
    params: [
      { name: 'casterId', type: 'EntityId' },
      { name: 'targetIds', type: 'EntityId[]' },
    ],
    emits: [
      {
        def: { kind: 'num', op: 'add', value: '1d4', stat: 'attack-roll', category: 'untyped' },
        scope: {
          owner: '{casterId}',
          target: { axis: 'entities', ids: '{targetIds}' },
          trigger: 'always',
        },
        idTemplate: '{ruleId}-attack-{casterId}-{targetId}',
      },
    ],
    testCases: [],
  });
  if (!parsed.ok) throw new Error('Test setup failed: ' + JSON.stringify(parsed.issues));
  return parsed.rule;
}

/** Escape-hatch rule */
function makeEscapeRule() {
  const parsed = parseRule({
    id: 'counterspell-fire',
    source: 'PHB 228',
    params: [{ name: 'owner', type: 'EntityId' }],
    emits: [
      {
        def: { kind: 'noop' },
        scope: { owner: '{owner}', target: { axis: 'self' }, trigger: 'always' },
      },
    ],
    escape: { handler: 'counterspell.fire' },
    testCases: [],
  });
  if (!parsed.ok) throw new Error('Test setup failed: ' + JSON.stringify(parsed.issues));
  return parsed.rule;
}

// ── Scenario (a): ID from idTemplate slot substitution ────────────────────────

describe('compileRule — ID template substitution (REQ-COMPILE-01 / Scenario: Factory produces correct instance)', () => {
  it('produces a ModifierInstance whose id is substituted from idTemplate', () => {
    // REQ-COMPILE-01: id = '{ruleId}-save-{owner}-{owner}' with owner='char-1'
    // Expected: id = 'resilient-con-save-char-1-char-1'
    const rule = makeSimpleNumRule();
    const compiled = compileRule(rule);

    expect(compiled.escaped).toBe(false);

    const instances = compiled.build({ owner: 'char-1' });
    expect(instances).toHaveLength(1);
    expect(instances[0]!.id).toBe('resilient-con-save-char-1-char-1');
    expect(instances[0]!.def.kind).toBe('proficiency');
  });
});

// ── Scenario (b): 2-emit rule → array length 2 ────────────────────────────────

describe('compileRule — multi-emit rule (REQ-COMPILE-01 / Scenario: Multi-modifier returns multiple)', () => {
  it('returns ModifierInstance[] of length 2 for a 2-emit Cloak-like rule', () => {
    // REQ-COMPILE-01: Cloak declares 2 emits → 2 instances
    const rule = makeTwoEmitRule();
    const compiled = compileRule(rule);

    expect(compiled.escaped).toBe(false);
    const instances = compiled.build({ owner: 'char-1' });
    expect(instances).toHaveLength(2);
    expect(instances[0]!.def.kind).toBe('num');
    expect(instances[1]!.def.kind).toBe('num');
  });
});

// ── Scenario (c): array-param fan-out ─────────────────────────────────────────

describe('compileRule — array-param fan-out (REQ-COMPILE-01 / Scenario: Array fan-out produces N instances)', () => {
  it('produces 3 instances for a 3-element targetIds array (mirrors Bless per-target)', () => {
    // REQ-COMPILE-01: one emit with EntityId[] param → N instances for N targets
    const rule = makeArrayFanOutRule();
    const compiled = compileRule(rule);

    expect(compiled.escaped).toBe(false);
    const instances = compiled.build({
      casterId: 'caster',
      targetIds: ['ally-A', 'ally-B', 'ally-C'],
    });
    expect(instances).toHaveLength(3);
    // Each instance should be scoped to its individual target
    const targetIds = instances.map((inst) => {
      const scope = inst.scope.target;
      return scope.axis === 'entities' ? scope.ids[0] : undefined;
    });
    expect(targetIds).toContain('ally-A');
    expect(targetIds).toContain('ally-B');
    expect(targetIds).toContain('ally-C');
  });
});

// ── Scenario (d): escape-hatch rule ───────────────────────────────────────────

describe('compileRule — escape hatch (REQ-COMPILE-01 / Scenario: Escape-hatch rule flagged + build throws)', () => {
  it('returns { escaped: true, handlerRef } and build() throws EscapeHatchNotImplemented', () => {
    // REQ-COMPILE-01: compiler NEVER fabricates handler behavior.
    // Escape-hatch rule → stub + flag; build() throws EscapeHatchNotImplemented.
    const rule = makeEscapeRule();
    const compiled = compileRule(rule);

    expect(compiled.escaped).toBe(true);
    expect(compiled.handlerRef).toBe('counterspell.fire');
    expect(() => compiled.build({ owner: 'char-1' })).toThrow(EscapeHatchNotImplemented);
  });
});

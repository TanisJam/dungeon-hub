/**
 * Tests for generateTestStub — engine/authoring/testgen.ts
 *
 * REQ-TESTGEN-01: generateTestStub — author-supplied testCases to Vitest file.
 *
 * generateTestStub(rule: RuleDoc) → string  (pure function — no file IO)
 *
 * The generated file mirrors bless.test.ts style:
 *   - // RED SENTINEL comment block (test fails before builder exists)
 *   - // PHB {source} inline comment on each it()
 *   - JSON.parse(JSON.stringify(...)) round-trip assertion
 *
 * Scenarios:
 *   (a) output contains // RED SENTINEL
 *   (b) output contains // PHB {source} as inline comment
 *   (c) output contains JSON.parse(JSON.stringify round-trip assertion
 */
import { describe, it, expect } from 'vitest';
import { generateTestStub } from './testgen.js';
import { parseRule } from './parse.js';

// ── Helper: build a minimal valid RuleDoc with testCases ─────────────────────

function makeRuleWithTestCase() {
  const parsed = parseRule({
    id: 'resilient-con',
    source: 'PHB 168',
    ruleText: 'gain proficiency in Con saving throws',
    params: [{ name: 'owner', type: 'EntityId' }],
    emits: [
      {
        def: { kind: 'proficiency', domain: 'save', ref: 'con' },
        scope: { owner: '{owner}', target: { axis: 'self' }, trigger: 'always' },
        idTemplate: '{ruleId}-save-{owner}',
        label: 'Resilient (Constitution)',
      },
    ],
    testCases: [
      {
        description: 'Con save proficiency appears in breakdown',
        params: { owner: 'char-1' },
        expectedInstances: [{ def: { kind: 'proficiency', domain: 'save', ref: 'con' } }],
        expectedResolution: {
          stat: 'saving-throw.con',
          base: 0,
          expectedValue: 2,
          expectedBreakdownSource: 'Resilient (Constitution)',
        },
      },
    ],
  });
  if (!parsed.ok) throw new Error('Test setup failed: ' + JSON.stringify(parsed.issues));
  return parsed.rule;
}

// ── Scenario (a): output contains // RED SENTINEL ─────────────────────────────

describe('generateTestStub — RED sentinel (REQ-TESTGEN-01 / Scenario: Generator emits RED sentinel)', () => {
  it('returned string contains // RED SENTINEL', () => {
    // REQ-TESTGEN-01: the generated file must contain a RED SENTINEL comment
    // so Vitest fails before the builder exists (strict TDD gate)
    const rule = makeRuleWithTestCase();
    const output = generateTestStub(rule);
    expect(output).toContain('// RED SENTINEL');
  });
});

// ── Scenario (b): output contains // PHB {source} as inline comment ───────────

describe('generateTestStub — PHB citation inline (REQ-TESTGEN-01 / Scenario: PHB citation inline)', () => {
  it('returned string contains // PHB 168 as an inline comment', () => {
    // REQ-TESTGEN-01: each it() must start with a // PHB {source} comment
    // Design Decision 4: "PHB citation injected as inline // PHB {source}: comment"
    const rule = makeRuleWithTestCase();
    const output = generateTestStub(rule);
    expect(output).toContain('// PHB 168');
  });

  it('returned string contains the ruleText when present', () => {
    // REQ-TESTGEN-01: ruleText is injected into the header comment
    const rule = makeRuleWithTestCase();
    const output = generateTestStub(rule);
    expect(output).toContain('gain proficiency in Con saving throws');
  });
});

// ── Scenario (c): output contains round-trip assertion ───────────────────────

describe('generateTestStub — round-trip assertion (REQ-TESTGEN-01 / Scenario: Generated test asserts round-trip)', () => {
  it('returned string contains JSON.parse(JSON.stringify round-trip assertion', () => {
    // REQ-TESTGEN-01: generated test asserts instances survive JSON serialization
    const rule = makeRuleWithTestCase();
    const output = generateTestStub(rule);
    expect(output).toContain('JSON.parse(JSON.stringify(');
  });
});

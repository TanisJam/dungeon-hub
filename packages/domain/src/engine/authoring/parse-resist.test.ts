/**
 * TDD tests for parse guard: 'resist' in VALID_KINDS (parse.ts).
 *
 * T-03: RED baseline — parseRule with kind:resist returns UNKNOWN_PRIMITIVE_KIND
 *       (VALID_KINDS still has 10 entries, no 'resist')
 * T-04: GREEN after adding 'resist' to VALID_KINDS
 *
 * REQ-PARSE-RESIST-01..04 (spec)
 * PHB p.48 — resistance to bludgeoning, piercing, and slashing damage.
 */
import { describe, it, expect } from 'vitest';
import { parseRule } from './parse.js';

// ── Test input helpers ────────────────────────────────────────────────────────

function resistRuleDoc(damageType: string) {
  return {
    id: 'test-resist',
    source: 'PHB p.48',
    params: [],
    emits: [
      {
        def: { kind: 'resist', damageType, mode: 'half' },
        scope: {
          owner: 'a',
          target: { axis: 'self' },
          trigger: 'always',
        },
      },
    ],
  };
}

// ── Parse guard: VALID_KINDS + resist ─────────────────────────────────────────

describe('parseRule — resist kind in VALID_KINDS (REQ-PARSE-RESIST-01..04)', () => {
  it('S-04: parseRule with kind:resist + valid shape returns ok:true after VALID_KINDS update', () => {
    // REQ-PARSE-RESIST-01, REQ-PARSE-RESIST-03:
    // After adding 'resist' to VALID_KINDS AND the schema arm, parseRule must succeed.
    // PHB p.48 — "You have resistance to bludgeoning, piercing, and slashing damage."
    const result = parseRule(resistRuleDoc('piercing'));
    expect(result.ok).toBe(true);
  });

  it('parseRule still rejects a genuinely unknown kind after the change', () => {
    // REQ-PARSE-RESIST-03: UNKNOWN_PRIMITIVE_KIND still fires for unknown kinds
    const result = parseRule({
      id: 'test',
      source: 'PHB p.48',
      params: [],
      emits: [
        {
          def: { kind: 'telekinesis' },
          scope: { owner: 'a', target: { axis: 'self' }, trigger: 'always' },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const unknownKindIssue = result.issues.find(
        (i) => i.code === 'UNKNOWN_PRIMITIVE_KIND',
      );
      expect(unknownKindIssue).toBeDefined();
      if (unknownKindIssue && unknownKindIssue.code === 'UNKNOWN_PRIMITIVE_KIND') {
        expect(unknownKindIssue.got).toBe('telekinesis');
      }
    }
  });

  it('parseRule rejects kind:resist with invalid mode (schema validation still fires)', () => {
    // REQ-PARSE-RESIST-03: valid VALID_KINDS entry but invalid shape still fails
    const result = parseRule({
      id: 'test',
      source: 'PHB p.48',
      params: [],
      emits: [
        {
          def: { kind: 'resist', damageType: 'fire', mode: 'quarter' },
          scope: { owner: 'a', target: { axis: 'self' }, trigger: 'always' },
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('parseRule accepts all three PHB p.48 resist damage types (b/p/s)', () => {
    // PHB p.48 — bludgeoning, piercing, slashing
    for (const damageType of ['bludgeoning', 'piercing', 'slashing']) {
      const result = parseRule(resistRuleDoc(damageType));
      expect(result.ok, `Expected ok:true for damageType:${damageType}`).toBe(true);
    }
  });
});

/**
 * Tests for parseRule — engine/authoring/parse.ts
 *
 * REQ-SCHEMA-01: Authoring schema — Zod-validated YAML rule shape.
 *
 * parseRule accepts `unknown` (the output of yaml.parse at the use-case/IO layer)
 * and returns either { ok: true, rule: RuleDoc } or { ok: false, issues: Issue[] }.
 *
 * Issue codes (per spec §6 naming convention):
 *   MISSING_PHB_SOURCE    — source field absent or empty
 *   UNKNOWN_PRIMITIVE_KIND — kind not in the 10-kind union
 *   INVALID_STAT_KEY      — stat value not a valid StatKey
 *   INVALID_PREDICATE_AST — malformed predicate node
 */
import { describe, it, expect } from 'vitest';
import { parseRule } from './parse.js';

// ── Scenario 1: valid rule passes ────────────────────────────────────────────

describe('parseRule — happy path (REQ-SCHEMA-01 / Scenario: Valid rule passes schema)', () => {
  it('returns { ok: true } for a minimal valid NumMod rule with source, kind, stat', () => {
    // REQ-SCHEMA-01: a rule with required source, valid kind, valid stat must pass
    const result = parseRule({
      id: 'test-rule',
      source: 'PHB 168',
      params: [{ name: 'owner', type: 'EntityId' }],
      emits: [
        {
          def: {
            kind: 'num',
            op: 'add',
            value: 1,
            stat: 'ac',
            category: 'untyped',
          },
          scope: {
            owner: '{owner}',
            target: { axis: 'self' },
            trigger: 'always',
          },
        },
      ],
      testCases: [],
    });
    expect(result.ok).toBe(true);
  });
});

// ── Scenario 2: MISSING_PHB_SOURCE ───────────────────────────────────────────

describe('parseRule — MISSING_PHB_SOURCE (REQ-SCHEMA-01 / Scenario: Missing source field fails)', () => {
  it('returns { ok: false } with MISSING_PHB_SOURCE when source field is absent', () => {
    // REQ-SCHEMA-01: source REQUIRED (§1.1 PHB-wins)
    const result = parseRule({
      id: 'no-source-rule',
      // source intentionally omitted
      params: [],
      emits: [
        {
          def: { kind: 'noop' },
          scope: { owner: 'char-1', target: { axis: 'self' }, trigger: 'always' },
        },
      ],
      testCases: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((i) => i.code);
      expect(codes).toContain('MISSING_PHB_SOURCE');
    }
  });
});

// ── Scenario 3: UNKNOWN_PRIMITIVE_KIND ───────────────────────────────────────

describe('parseRule — UNKNOWN_PRIMITIVE_KIND (REQ-SCHEMA-01 / Scenario: Hallucinated kind fails)', () => {
  it('returns { ok: false } with UNKNOWN_PRIMITIVE_KIND when kind is "teleport"', () => {
    // REQ-SCHEMA-01 §3.4: discriminatedUnion over 10 kinds — hallucinated kind must fail
    const result = parseRule({
      id: 'teleport-rule',
      source: 'PHB 999',
      params: [],
      emits: [
        {
          def: { kind: 'teleport', distance: 30 },
          scope: { owner: 'char-1', target: { axis: 'self' }, trigger: 'always' },
        },
      ],
      testCases: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((i) => i.code);
      expect(codes).toContain('UNKNOWN_PRIMITIVE_KIND');
    }
  });
});

// ── Scenario 4: INVALID_STAT_KEY ─────────────────────────────────────────────

describe('parseRule — INVALID_STAT_KEY (REQ-SCHEMA-01 / Scenario: Bad stat fails)', () => {
  it('returns { ok: false } with INVALID_STAT_KEY when stat is "flying-speed"', () => {
    // REQ-SCHEMA-01: stat field must be a valid StatKey
    const result = parseRule({
      id: 'bad-stat-rule',
      source: 'PHB 100',
      params: [],
      emits: [
        {
          def: {
            kind: 'num',
            op: 'add',
            value: 5,
            stat: 'flying-speed', // not a valid StatKey
            category: 'untyped',
          },
          scope: { owner: 'char-1', target: { axis: 'self' }, trigger: 'always' },
        },
      ],
      testCases: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((i) => i.code);
      expect(codes).toContain('INVALID_STAT_KEY');
    }
  });
});

// ── Scenario 5: INVALID_PREDICATE_AST ────────────────────────────────────────

describe('parseRule — INVALID_PREDICATE_AST (REQ-SCHEMA-01 / Scenario: Malformed predicate fails)', () => {
  it('returns { ok: false } with INVALID_PREDICATE_AST when predicate op is unknown', () => {
    // REQ-SCHEMA-01: predicate AST must be valid (op ∈ and/or/not/query)
    const result = parseRule({
      id: 'bad-predicate-rule',
      source: 'PHB 200',
      params: [],
      emits: [
        {
          def: { kind: 'noop' },
          scope: { owner: 'char-1', target: { axis: 'self' }, trigger: 'always' },
          predicate: { op: 'teleport-if', condition: 'flying' }, // unknown op
        },
      ],
      testCases: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((i) => i.code);
      expect(codes).toContain('INVALID_PREDICATE_AST');
    }
  });
});

/**
 * Tests for evaluatePredicate — AND/OR/NOT boolean composition + WorldQuery leaves.
 *
 * // PHB 292: Prone melee gate (≤5ft) and ranged gate
 * REQ-PREDICATE-01: Boolean predicate evaluation over ctx.
 * Spec scenarios: "AND predicate — both conditions must hold", "OR predicate".
 */
import { describe, it, expect } from 'vitest';
import { evaluatePredicate } from './evaluate.js';
import { and, or, not, attackerWithin, weaponKind, hasCondition } from './ast.js';
import type { EvaluationContext } from '../context.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Minimal EvaluationContext factory for predicate tests.
 * Populates only the fields each test needs.
 */
function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    self: { id: 'player-1' as import('../types.js').EntityId, conditions: [] },
    activeConditions: [],
    ...overrides,
  };
}

// ── AND gate ─────────────────────────────────────────────────────────────────

describe('evaluatePredicate — AND gate', () => {
  it('returns true when both conditions hold (attacker within 5ft AND melee weapon)', () => {
    // PHB 292: Prone melee gate — attacker within 5ft with a melee weapon has advantage.
    const predicate = and(attackerWithin(5), weaponKind('melee'));

    const ctx = makeCtx({
      weaponInUse: { kind: 'melee', rangeFt: 5, properties: [] },
    });

    const result = evaluatePredicate(predicate, ctx);
    expect(result).toBe(true);
  });

  it('returns false when distance condition fails (attacker 10ft, AND melee)', () => {
    // PHB 292: same gate — attacker at 10ft is out of melee range.
    const predicate = and(attackerWithin(5), weaponKind('melee'));

    const ctx = makeCtx({
      weaponInUse: { kind: 'melee', rangeFt: 10, properties: [] },
    });

    const result = evaluatePredicate(predicate, ctx);
    expect(result).toBe(false);
  });
});

// ── OR short-circuit ─────────────────────────────────────────────────────────

describe('evaluatePredicate — OR short-circuit', () => {
  it('returns true when the first branch is satisfied (Bless condition present)', () => {
    // Spec scenario: "OR predicate — OR(hasCondition 'Bless', visibility)"
    // First branch satisfied → true even if second branch would be false.
    const predicate = or(
      hasCondition('self', 'Bless'),
      weaponKind('melee'), // second branch — irrelevant once first is satisfied
    );

    const ctx = makeCtx({
      activeConditions: [{ name: 'Bless' }],
      // No weaponInUse → second branch would evaluate to false
    });

    const result = evaluatePredicate(predicate, ctx);
    expect(result).toBe(true);
  });
});

// ── NOT inversion ─────────────────────────────────────────────────────────────

describe('evaluatePredicate — NOT inversion', () => {
  it('inverts a true predicate to false (NOT hasCondition Prone)', () => {
    const predicate = not(hasCondition('self', 'Prone'));

    const ctx = makeCtx({
      activeConditions: [{ name: 'Prone' }],
    });

    const result = evaluatePredicate(predicate, ctx);
    expect(result).toBe(false);
  });

  it('inverts a false predicate to true (NOT hasCondition Prone when not prone)', () => {
    const predicate = not(hasCondition('self', 'Prone'));

    const ctx = makeCtx({
      activeConditions: [],
    });

    const result = evaluatePredicate(predicate, ctx);
    expect(result).toBe(true);
  });
});

// ── Missing ctx field → PREDICATE_MISSING_CTX_FIELD ─────────────────────────

describe('evaluatePredicate — missing ctx field', () => {
  it('throws a PREDICATE_MISSING_CTX_FIELD issue when attackerWithin has no weaponInUse', () => {
    // REQ-PREDICATE-01 spec: missing ctx field emits PREDICATE_MISSING_CTX_FIELD.
    // attackerWithin requires ctx.weaponInUse.rangeFt to be present.
    const predicate = attackerWithin(5);

    const ctx = makeCtx({
      // weaponInUse intentionally absent
    });

    expect(() => evaluatePredicate(predicate, ctx)).toThrow();
  });

  it('thrown error carries code PREDICATE_MISSING_CTX_FIELD with expected field name', () => {
    const predicate = attackerWithin(5);
    const ctx = makeCtx({});

    let caught: unknown;
    try {
      evaluatePredicate(predicate, ctx);
    } catch (e) {
      caught = e;
    }

    expect(caught).toMatchObject({
      code: 'PREDICATE_MISSING_CTX_FIELD',
      expected: 'weaponInUse.rangeFt',
      got: undefined,
    });
  });
});

/**
 * Tests for evaluatePredicate — AND/OR/NOT boolean composition + WorldQuery leaves.
 *
 * // PHB 292: Prone melee gate (≤5ft) and ranged gate
 * REQ-PREDICATE-01: Boolean predicate evaluation over ctx.
 * Spec scenarios: "AND predicate — both conditions must hold", "OR predicate".
 */
import { describe, it, expect } from 'vitest';
import { evaluatePredicate } from './evaluate.js';
import {
  and,
  or,
  not,
  attackerWithin,
  weaponKind,
  hasCondition,
  hasRollMode,
  runtimeDecision,
  hasWeaponProperty,
} from './ast.js';
import { createInMemoryRegistry } from '../registry/query.js';
import type { EvaluationContext } from '../context.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EntityId } from '../types.js';

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

// ── hasRollMode leaf — REQ-SA-WQ-01.1 ────────────────────────────────────────

describe('evaluatePredicate — hasRollMode leaf', () => {
  it('hasRollMode_absent_returns_false: returns false (not throws) when ctx.resolvedRollMode is absent', () => {
    // REQ-SA-WQ-01.1: hasRollMode returns false when ctx.resolvedRollMode absent.
    // CRITICAL: must NOT throw — query.ts:109 catches throws, making them
    // indistinguishable from real bugs. Explicit false is the contract.
    const predicate = hasRollMode('advantage');
    const ctx = makeCtx({}); // no resolvedRollMode
    expect(evaluatePredicate(predicate, ctx)).toBe(false);
  });

  it('hasRollMode_matches_mode: returns true when resolvedRollMode matches', () => {
    // PHB p.173 — advantage/disadvantage roll mode.
    const predicate = hasRollMode('advantage');
    const ctx = makeCtx({ resolvedRollMode: 'advantage' });
    expect(evaluatePredicate(predicate, ctx)).toBe(true);
  });

  it('hasRollMode_mode_differs: returns false when resolvedRollMode does not match', () => {
    const predicate = hasRollMode('advantage');
    const ctx = makeCtx({ resolvedRollMode: 'normal' });
    expect(evaluatePredicate(predicate, ctx)).toBe(false);
  });
});

// ── runtimeDecision leaf — REQ-SA-WQ-01.2 ────────────────────────────────────

describe('evaluatePredicate — runtimeDecision leaf', () => {
  it('runtimeDecision_absent_returns_false: returns false when ctx.runtimeDecisions is absent', () => {
    // REQ-SA-WQ-01.2: runtimeDecision returns false when runtimeDecisions absent.
    const predicate = runtimeDecision('sneakAttackFirstThisTurn', true);
    const ctx = makeCtx({}); // no runtimeDecisions
    expect(evaluatePredicate(predicate, ctx)).toBe(false);
  });

  it('runtimeDecision_key_present_equals: returns true when key matches value', () => {
    // PHB p.96 — once-per-turn Sneak Attack assertion.
    const predicate = runtimeDecision('sneakAttackFirstThisTurn', true);
    const ctx = makeCtx({ runtimeDecisions: { sneakAttackFirstThisTurn: true } });
    expect(evaluatePredicate(predicate, ctx)).toBe(true);
  });

  it('runtimeDecision_key_present_differs: returns false when key value differs', () => {
    const predicate = runtimeDecision('sneakAttackFirstThisTurn', true);
    const ctx = makeCtx({ runtimeDecisions: { sneakAttackFirstThisTurn: false } });
    expect(evaluatePredicate(predicate, ctx)).toBe(false);
  });

  it('runtimeDecision_key_absent: returns false when key not in runtimeDecisions', () => {
    const predicate = runtimeDecision('sneakAttackFirstThisTurn', true);
    const ctx = makeCtx({ runtimeDecisions: { otherKey: true } });
    expect(evaluatePredicate(predicate, ctx)).toBe(false);
  });
});

// ── hasWeaponProperty leaf — REQ-SA-WQ-01.3 ──────────────────────────────────

describe('evaluatePredicate — hasWeaponProperty leaf', () => {
  it('hasWeaponProperty_absent_returns_false: returns false when ctx.weaponInUse is absent', () => {
    // REQ-SA-WQ-01.3: hasWeaponProperty returns false when weaponInUse absent.
    const predicate = hasWeaponProperty('finesse');
    const ctx = makeCtx({}); // no weaponInUse
    expect(evaluatePredicate(predicate, ctx)).toBe(false);
  });

  it('hasWeaponProperty_present: returns true when property in weapon properties', () => {
    // PHB p.147 — finesse property: allows Dex modifier for attack and damage.
    const predicate = hasWeaponProperty('finesse');
    const ctx = makeCtx({ weaponInUse: { kind: 'melee', properties: ['finesse'] } });
    expect(evaluatePredicate(predicate, ctx)).toBe(true);
  });

  it('hasWeaponProperty_not_present: returns false when property not in weapon properties', () => {
    const predicate = hasWeaponProperty('heavy');
    const ctx = makeCtx({ weaponInUse: { kind: 'melee', properties: ['finesse'] } });
    expect(evaluatePredicate(predicate, ctx)).toBe(false);
  });
});

// ── throw-safety via registry.query — REQ-SA-WQ-01 (CRITICAL) ────────────────

describe('evaluatePredicate — throw_safety_via_query (REQ-SA-WQ-01 CRITICAL)', () => {
  it('throw_safety: rider with hasRollMode predicate is EXCLUDED (not erroring) when resolvedRollMode absent', () => {
    // CRITICAL: query.ts:109 catches throws and excludes instances.
    // A leaf that throws is indistinguishable from a bug vs. returning false.
    // This test confirms the false-not-throw contract at the registry.query integration boundary.
    // Rider with hasRollMode('advantage') predicate; query ctx has NO resolvedRollMode.
    // Expected: registry.query returns [] — rider excluded. No error thrown.
    function iid(s: string) { return s as ModifierInstanceId; }
    function eid(s: string) { return s as EntityId; }

    const registry = createInMemoryRegistry();
    const attackerId = eid('attacker-1');

    const rider: ModifierInstance = {
      id: iid('test-rider-1'),
      label: 'Test hasRollMode rider',
      def: { kind: 'num', op: 'add', value: '1d6', stat: 'damage', category: 'untyped' },
      scope: {
        owner: attackerId,
        target: { axis: 'entities', ids: [attackerId] },
        trigger: 'on-hit',
      },
      predicate: hasRollMode('advantage'), // requires resolvedRollMode — absent in ctx below
    };

    registry.register(rider);

    // ctx WITHOUT resolvedRollMode
    const ctx = makeCtx({
      target: { id: eid('target-1'), conditions: [] },
      attacker: { id: attackerId, conditions: [] },
    });

    let result: unknown[];
    expect(() => {
      result = registry.query({ trigger: 'on-hit', self: attackerId, ctx });
    }).not.toThrow();

    // @ts-expect-error result assigned inside expect() above
    expect(result).toHaveLength(0); // rider excluded — predicate false
  });
});

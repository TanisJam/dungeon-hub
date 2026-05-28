/**
 * Tests for the in-memory ModifierRegistry — bidirectional gather + predicate filter.
 *
 * // REQ-REGISTRY-01: bidirectional (owner,target,trigger) actor/target axis.
 * Spec scenarios:
 *   - "Cross-entity modifier is gathered for the target"
 *   - "Outgoing-aware modifier uses attacker ctx"
 *
 * PHB note: the bidirectional axis is the structural foundation for both
 * Bless (cross-entity: modifier lives on caster, applies to allies) and
 * Prone (attackers-of: modifier lives on prone target, applies to attackers).
 */
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from './query.js';
import type { ModifierInstance, ModifierInstanceId } from './types.js';
import type { EvaluationContext } from '../context.js';
import type { EntityId } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function id(s: string): EntityId {
  return s as EntityId;
}

function instanceId(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

/** Minimal EvaluationContext for registry tests. */
function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    self: { id: id('self'), conditions: [] },
    activeConditions: [],
    ...overrides,
  };
}

/** Build a simple ModifierInstance with no predicate. */
function makeInstance(
  partial: Omit<ModifierInstance, 'id' | 'def'> & { iid?: string },
): ModifierInstance {
  return {
    id: instanceId(partial.iid ?? 'inst-1'),
    def: { kind: 'noop' },
    scope: partial.scope,
    ...(partial.predicate ? { predicate: partial.predicate } : {}),
    ...(partial.duration ? { duration: partial.duration } : {}),
  };
}

// ── Scenario 1: entities-scoped modifier gathered for target ──────────────────

describe('registry.query — entities-scoped modifier', () => {
  it('is gathered when querying the target entity (Bless cross-entity case)', () => {
    // REQ-REGISTRY-01: modifier owned by A, scoped to entity B, trigger on-attack-roll.
    // Querying B's on-attack-roll must include the instance.
    const registry = createInMemoryRegistry();

    const instanceA: ModifierInstance = makeInstance({
      iid: 'bless-on-B',
      scope: {
        owner: id('caster-A'),
        target: { axis: 'entities', ids: [id('ally-B')] },
        trigger: 'on-attack-roll',
      },
    });

    registry.register(instanceA);

    const ctx = makeCtx({ self: { id: id('ally-B'), conditions: [] } });
    const results = registry.query({
      trigger: 'on-attack-roll',
      self: id('ally-B'),
      ctx,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('bless-on-B');
  });

  it('is NOT gathered for an entity not in the ids list', () => {
    const registry = createInMemoryRegistry();

    registry.register(
      makeInstance({
        iid: 'bless-on-B',
        scope: {
          owner: id('caster-A'),
          target: { axis: 'entities', ids: [id('ally-B')] },
          trigger: 'on-attack-roll',
        },
      }),
    );

    // Querying C — not in [B]
    const ctx = makeCtx({ self: { id: id('other-C'), conditions: [] } });
    const results = registry.query({
      trigger: 'on-attack-roll',
      self: id('other-C'),
      ctx,
    });

    expect(results).toHaveLength(0);
  });
});

// ── Scenario 2: attackers-of-scoped modifier gathered for attacker ────────────

describe('registry.query — attackers-of-scoped modifier (Prone outgoing axis)', () => {
  it('is gathered when attacker A attacks target B (bidirectional axis)', () => {
    // REQ-REGISTRY-01: the CRITICAL bidirectional case.
    // Prone modifier lives on B (scope.owner = B, scope.target.axis = 'attackers-of', ids = [B]).
    // When A attacks B: ctx.attacker.id = A, ctx.target.id = B, self = A.
    // The registry MUST return the modifier so A's roll is affected by B's condition.
    const registry = createInMemoryRegistry();

    const proneOnB: ModifierInstance = makeInstance({
      iid: 'prone-on-B',
      scope: {
        owner: id('target-B'),
        target: { axis: 'attackers-of', ids: [id('target-B')] },
        trigger: 'on-attack-roll',
      },
    });

    registry.register(proneOnB);

    // A (attacker) rolls to attack B (target).
    const ctx = makeCtx({
      self: { id: id('attacker-A'), conditions: [] },
      attacker: { id: id('attacker-A'), conditions: [] },
      target: { id: id('target-B'), conditions: [] },
    });

    const results = registry.query({
      trigger: 'on-attack-roll',
      self: id('attacker-A'),
      ctx,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('prone-on-B');
  });

  it('is NOT gathered when there is no attacker in ctx (non-attack resolution)', () => {
    const registry = createInMemoryRegistry();

    registry.register(
      makeInstance({
        iid: 'prone-on-B',
        scope: {
          owner: id('target-B'),
          target: { axis: 'attackers-of', ids: [id('target-B')] },
          trigger: 'on-attack-roll',
        },
      }),
    );

    // No attacker in ctx — e.g. resolving B's own stat (not an incoming attack).
    const ctx = makeCtx({ self: { id: id('target-B'), conditions: [] } });
    const results = registry.query({
      trigger: 'on-attack-roll',
      self: id('target-B'),
      ctx,
    });

    // No attacker axis → attackers-of modifier should NOT be returned.
    expect(results).toHaveLength(0);
  });
});

// ── Scenario 3: self-scoped modifier is owner-only ────────────────────────────

describe('registry.query — self-scoped modifier', () => {
  it('is gathered for the owning entity', () => {
    const registry = createInMemoryRegistry();

    registry.register(
      makeInstance({
        iid: 'self-mod-on-A',
        scope: {
          owner: id('entity-A'),
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
      }),
    );

    const ctx = makeCtx({ self: { id: id('entity-A'), conditions: [] } });
    const results = registry.query({ trigger: 'on-attack-roll', self: id('entity-A'), ctx });

    expect(results).toHaveLength(1);
  });

  it('is NOT gathered for a different entity (self is owner-only)', () => {
    const registry = createInMemoryRegistry();

    registry.register(
      makeInstance({
        iid: 'self-mod-on-A',
        scope: {
          owner: id('entity-A'),
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
      }),
    );

    // B querying — should not get A's self-scoped modifier.
    const ctx = makeCtx({ self: { id: id('entity-B'), conditions: [] } });
    const results = registry.query({ trigger: 'on-attack-roll', self: id('entity-B'), ctx });

    expect(results).toHaveLength(0);
  });
});

// ── Scenario 4: predicate false → instance dropped ───────────────────────────

describe('registry.query — predicate filtering', () => {
  it('drops an instance whose predicate evaluates to false', () => {
    // Instance has a predicate requiring weaponKind=melee — but ctx has ranged weapon.
    // The instance must be excluded from results.
    const registry = createInMemoryRegistry();

    registry.register(
      makeInstance({
        iid: 'melee-only-mod',
        scope: {
          owner: id('entity-A'),
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
        predicate: { op: 'query', q: { kind: 'weaponKind', is: 'melee' } },
      }),
    );

    const ctx = makeCtx({
      self: { id: id('entity-A'), conditions: [] },
      weaponInUse: { kind: 'ranged', rangeFt: 30, properties: [] },
    });

    const results = registry.query({ trigger: 'on-attack-roll', self: id('entity-A'), ctx });
    expect(results).toHaveLength(0);
  });

  it('includes an instance whose predicate evaluates to true', () => {
    const registry = createInMemoryRegistry();

    registry.register(
      makeInstance({
        iid: 'melee-only-mod',
        scope: {
          owner: id('entity-A'),
          target: { axis: 'self' },
          trigger: 'on-attack-roll',
        },
        predicate: { op: 'query', q: { kind: 'weaponKind', is: 'melee' } },
      }),
    );

    const ctx = makeCtx({
      self: { id: id('entity-A'), conditions: [] },
      weaponInUse: { kind: 'melee', rangeFt: 5, properties: [] },
    });

    const results = registry.query({ trigger: 'on-attack-roll', self: id('entity-A'), ctx });
    expect(results).toHaveLength(1);
  });
});

/**
 * resolveStat — pull-first stat resolution with provenance.
 *
 * // REQ-RESOLVE-01: pull-first provenance (c.2)
 *
 * The engine gathers modifiers from the registry at evaluation time,
 * applies type-level stacking, and returns { value, breakdown: Source[] }.
 *
 * Tests cover the 4 spec scenarios from REQ-RESOLVE-01:
 *   1. Basic numeric modifier with provenance (base + item mod → value + breakdown)
 *   2. Same-type stacking — keep highest (two item mods → only highest counts)
 *   3. Cross-type stacking — all apply (item + status → both in breakdown)
 *   4. Round-trip — serialize registry state → reload → identical value+breakdown
 *
 * Design ref: sdd/resolution-engine/design — "Resolution algorithm" §5-step pipeline.
 */
import { describe, it, expect } from 'vitest';
import { resolveStat } from './stat.js';
import { createInMemoryRegistry } from '../registry/query.js';
import type { EntityId, StatKey } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EvaluationContext } from '../context.js';
import type { NumMod } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHAR_ID = 'char-a' as EntityId;
const BASE_STR = 10;

function makeCtx(charId: EntityId = CHAR_ID): EvaluationContext {
  return {
    self: { id: charId, conditions: [] },
    activeConditions: [],
  };
}

function makeNumModInstance(
  id: string,
  amount: number,
  category: 'item' | 'status' | 'circumstance' | 'untyped',
  stat: StatKey,
  ownerId: EntityId = CHAR_ID,
  targetId: EntityId = CHAR_ID,
): ModifierInstance {
  const def: NumMod = { kind: 'num', op: 'add', value: amount, stat, category };
  return {
    id: id as ModifierInstanceId,
    def,
    scope: {
      owner: ownerId,
      // self-scoped: owner and target are the same entity
      target: { axis: 'self' },
      trigger: 'always',
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveStat', () => {
  it('base STR=10 + NumMod +2 (item) → { value: 12, breakdown includes base and item-mod }', () => {
    const registry = createInMemoryRegistry();
    registry.register(makeNumModInstance('m1', 2, 'item', 'str'));

    const ctx = makeCtx();
    const result = resolveStat(CHAR_ID, 'str', BASE_STR, ctx, registry);

    expect(result.value).toBe(12);
    // Breakdown must include the base source
    const baseSrc = result.breakdown.find((s) => s.label === 'base');
    expect(baseSrc).toBeDefined();
    expect(baseSrc!.amount).toBe(10);
    // Breakdown must include the item modifier source
    const itemSrc = result.breakdown.find((s) => s.type === 'item');
    expect(itemSrc).toBeDefined();
    expect(itemSrc!.amount).toBe(2);
  });

  it('same-type stacking: item +3 and item +5 → only +5 included (keep-highest)', () => {
    const registry = createInMemoryRegistry();
    registry.register(makeNumModInstance('m1', 3, 'item', 'str'));
    registry.register(makeNumModInstance('m2', 5, 'item', 'str'));

    const ctx = makeCtx();
    const result = resolveStat(CHAR_ID, 'str', BASE_STR, ctx, registry);

    // base 10 + keep-highest item(5) = 15
    expect(result.value).toBe(15);
    const itemSources = result.breakdown.filter((s) => s.type === 'item');
    expect(itemSources).toHaveLength(1);
    expect(itemSources[0]!.amount).toBe(5);
  });

  it('cross-type stacking: item +3 + status +2 → both contribute, value = 15', () => {
    const registry = createInMemoryRegistry();
    registry.register(makeNumModInstance('m1', 3, 'item', 'str'));
    registry.register(makeNumModInstance('m2', 2, 'status', 'str'));

    const ctx = makeCtx();
    const result = resolveStat(CHAR_ID, 'str', BASE_STR, ctx, registry);

    // base 10 + item(3) + status(2) = 15
    expect(result.value).toBe(15);
    const itemSources = result.breakdown.filter((s) => s.type === 'item');
    const statusSources = result.breakdown.filter((s) => s.type === 'status');
    expect(itemSources).toHaveLength(1);
    expect(statusSources).toHaveLength(1);
  });

  it('round-trip: serialize registry instances (JSON) → reload into fresh registry → identical value+breakdown', () => {
    const registry = createInMemoryRegistry();
    const instance = makeNumModInstance('rt1', 4, 'item', 'str');
    registry.register(instance);

    const ctx = makeCtx();
    const originalResult = resolveStat(CHAR_ID, 'str', BASE_STR, ctx, registry);

    // Serialize: the plain JSON instance array (registry is not serializable itself,
    // but the ModifierInstance[] array is — all fields are plain JSON).
    const serialized = JSON.stringify([instance]);
    const reloaded: ModifierInstance[] = JSON.parse(serialized) as ModifierInstance[];

    // Reload into a fresh registry
    const freshRegistry = createInMemoryRegistry();
    for (const inst of reloaded) {
      freshRegistry.register(inst);
    }

    const reloadedResult = resolveStat(CHAR_ID, 'str', BASE_STR, ctx, freshRegistry);

    // Value must be identical
    expect(reloadedResult.value).toBe(originalResult.value);
    // Breakdown sources must have the same amounts and types (in same order)
    expect(reloadedResult.breakdown.map((s) => ({ amount: s.amount, type: s.type }))).toEqual(
      originalResult.breakdown.map((s) => ({ amount: s.amount, type: s.type })),
    );
  });
});

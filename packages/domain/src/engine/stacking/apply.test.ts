/**
 * applyStacking — type-level stacking with provenance.
 *
 * REQ-RESOLVE-01: within a StackCategory, apply the category's strategy
 * (keep-highest for item/status/circumstance; all-stack for untyped).
 * Between categories, all contributions apply additively.
 *
 * Design ref: sdd/resolution-engine/design — §3.1 type-level stacking footgun.
 * The strategy lives on the CATEGORY, never the instance.
 */
import { describe, it, expect } from 'vitest';
import { applyStacking } from './apply.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { NumMod } from '../types.js';
import type { EntityRef } from '../context.js';

// Helper to build a test NumMod instance
function makeNumMod(
  id: string,
  amount: number,
  category: 'item' | 'status' | 'circumstance' | 'untyped',
  ownerId: string = 'owner-a',
): ModifierInstance {
  const def: NumMod = { kind: 'num', op: 'add', value: amount, stat: 'str', category };
  return {
    id: id as ModifierInstanceId,
    def,
    scope: {
      owner: ownerId as EntityId,
      target: { axis: 'self' },
      trigger: 'always',
    },
  };
}

const SELF_REF: EntityRef = { id: 'char-a' as EntityId, conditions: [] };

describe('applyStacking', () => {
  it('two item NumMods (+3 and +5) → only +5 in output (keep-highest within type)', () => {
    const mods = [makeNumMod('i1', 3, 'item'), makeNumMod('i2', 5, 'item')];
    const result = applyStacking(mods, 10, SELF_REF);
    // base(10) + item keep-highest(5) = 15
    expect(result.value).toBe(15);
    const sources = result.breakdown;
    // Only one item source (the +5); base source should be present
    const itemSources = sources.filter((s) => s.type === 'item');
    expect(itemSources).toHaveLength(1);
    expect(itemSources[0]!.amount).toBe(5);
  });

  it('item +3 + status +2 → both in output, cross-type all-apply', () => {
    const mods = [makeNumMod('i1', 3, 'item'), makeNumMod('s1', 2, 'status')];
    const result = applyStacking(mods, 10, SELF_REF);
    // base(10) + item(3) + status(2) = 15
    expect(result.value).toBe(15);
    const itemSources = result.breakdown.filter((s) => s.type === 'item');
    const statusSources = result.breakdown.filter((s) => s.type === 'status');
    expect(itemSources).toHaveLength(1);
    expect(statusSources).toHaveLength(1);
  });

  it('two untyped NumMods → both stack (all-stack)', () => {
    const mods = [makeNumMod('u1', 4, 'untyped'), makeNumMod('u2', 3, 'untyped')];
    const result = applyStacking(mods, 10, SELF_REF);
    // base(10) + untyped(4) + untyped(3) = 17
    expect(result.value).toBe(17);
    // Filter out the base source (label='base'); count only modifier contributions
    const untypedSources = result.breakdown.filter((s) => s.type === 'untyped' && s.label !== 'base');
    expect(untypedSources).toHaveLength(2);
  });
});

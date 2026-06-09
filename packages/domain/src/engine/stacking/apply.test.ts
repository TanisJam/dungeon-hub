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

// ── applyStacking — numeric param from compileRule (scalar guard) ─────────────
// REQ-STACKING-SCALAR-01, SCENARIO-04/05
// These tests pin that applyStacking is correct with NUMERIC input.
// If compile.ts ever regressed to emitting a string '2', these tests would fail
// (typeof '2' !== 'number' → totalBonus stays 0 → value === base + 0, not base + 2).

describe('applyStacking — numeric param from compileRule (scalar guard)', () => {
  it('SCENARIO-04: NumMod value:2 (number) contributes +2 to stat total (PHB p.48)', () => {
    // PHB p.48 — +2 rage damage must contribute to the scalar stat total.
    // Base 5 + rage NumMod 2 → value must be 7.
    const mod: ModifierInstance = {
      id: 'rage-damage' as ModifierInstanceId,
      def: { kind: 'num', op: 'add', value: 2, stat: 'damage', category: 'untyped' } as NumMod,
      scope: {
        owner: 'char-001' as EntityId,
        target: { axis: 'self' },
        trigger: 'on-damage',
      },
    };
    const result = applyStacking([mod], 5, SELF_REF);
    expect(result.value).toBe(7);
    // breakdown must contain a source with numeric amount 2 (not string '2')
    const rageSrc = result.breakdown.find((s) => s.label !== 'base');
    expect(rageSrc).toBeDefined();
    expect(rageSrc!.amount).toBe(2);
    expect(typeof rageSrc!.amount).toBe('number');
  });

  it('SCENARIO-05: rageBonus:3 (L9-15) → value = base + 3 (PHB p.48)', () => {
    // PHB p.48 — L9-15 tier +3 rage damage
    const mod: ModifierInstance = {
      id: 'rage-damage' as ModifierInstanceId,
      def: { kind: 'num', op: 'add', value: 3, stat: 'damage', category: 'untyped' } as NumMod,
      scope: { owner: 'char-001' as EntityId, target: { axis: 'self' }, trigger: 'on-damage' },
    };
    expect(applyStacking([mod], 5, SELF_REF).value).toBe(8);
  });

  it('SCENARIO-05: rageBonus:4 (L16+) → value = base + 4 (PHB p.48)', () => {
    // PHB p.48 — L16+ tier +4 rage damage (PHB p.48 Rage Damage column)
    const mod: ModifierInstance = {
      id: 'rage-damage' as ModifierInstanceId,
      def: { kind: 'num', op: 'add', value: 4, stat: 'damage', category: 'untyped' } as NumMod,
      scope: { owner: 'char-001' as EntityId, target: { axis: 'self' }, trigger: 'on-damage' },
    };
    expect(applyStacking([mod], 5, SELF_REF).value).toBe(9);
  });
});

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

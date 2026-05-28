/**
 * resolveRollMode — 5e advantage/disadvantage cancellation.
 *
 * // PHB 173: any advantage + any disadvantage = neither (normal roll).
 * Both sources are still listed in breakdown for provenance/traceability.
 *
 * Design ref: sdd/resolution-engine/design — "resolveRollMode" section.
 * REQ-RESOLVE-01 (advantage cancellation scenario from REQ-PRONE-01 §spec).
 */
import { describe, it, expect } from 'vitest';
import { resolveRollMode } from './roll-mode.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { AdvantageMod } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHAR_ID = 'char-a' as EntityId;

function makeAdvMod(
  id: string,
  mode: 'grant' | 'impose',
  ownerId: EntityId = CHAR_ID,
): ModifierInstance {
  const def: AdvantageMod = { kind: 'advantage', mode, rollType: 'attack' };
  return {
    id: id as ModifierInstanceId,
    def,
    scope: {
      owner: ownerId,
      target: { axis: 'self' },
      trigger: 'always',
    },
  };
}

function makeCtx(charId: EntityId = CHAR_ID): EvaluationContext {
  return {
    self: { id: charId, conditions: [] },
    activeConditions: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveRollMode', () => {
  it('one advantage source → mode = advantage', () => {
    const mods = [makeAdvMod('adv1', 'grant')];
    const ctx = makeCtx();
    const result = resolveRollMode(mods, ctx);

    expect(result.mode).toBe('advantage');
    expect(result.breakdown).toHaveLength(1);
  });

  it('one disadvantage source → mode = disadvantage', () => {
    const mods = [makeAdvMod('dis1', 'impose')];
    const ctx = makeCtx();
    const result = resolveRollMode(mods, ctx);

    expect(result.mode).toBe('disadvantage');
    expect(result.breakdown).toHaveLength(1);
  });

  it('adv + disadv → mode = normal (PHB 173: any adv + any dis = neither), both listed in breakdown', () => {
    // PHB 173: "If circumstances cause a roll to have both advantage and
    // disadvantage, you are considered to have neither of them."
    const mods = [makeAdvMod('adv1', 'grant'), makeAdvMod('dis1', 'impose')];
    const ctx = makeCtx();
    const result = resolveRollMode(mods, ctx);

    expect(result.mode).toBe('normal');
    // Both sources must be listed for traceability
    expect(result.breakdown).toHaveLength(2);
  });

  it('multiple adv sources + one disadv → mode = normal (PHB 173: any count cancels)', () => {
    const mods = [
      makeAdvMod('adv1', 'grant'),
      makeAdvMod('adv2', 'grant'),
      makeAdvMod('adv3', 'grant'),
      makeAdvMod('dis1', 'impose'),
    ];
    const ctx = makeCtx();
    const result = resolveRollMode(mods, ctx);

    expect(result.mode).toBe('normal');
    // All 4 sources must be listed in breakdown for traceability
    expect(result.breakdown).toHaveLength(4);
  });
});

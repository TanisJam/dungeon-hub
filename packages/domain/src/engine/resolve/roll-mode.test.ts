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

  // ── PHB p.173 stacking: conditions-catalog (REQ-COND-STACK-01) ───────────────
  //
  // PHB p.173: "If circumstances cause a roll to have both advantage and
  // disadvantage, you are considered to have neither of them, regardless
  // of how many circumstances grant advantage or impose disadvantage."
  //
  // These tests assert resolveRollMode ALREADY collapses correctly for condition combos.
  // ADR-6: NO production change to roll-mode.ts is needed — .some() is count-insensitive.

  it('STACK-01a: Invisible self-grant + Blinded attackers-of grant (two grants, zero imposes) → advantage (not doubled, PHB p.173)', () => {
    // Scenario: Invisible attacker (self-grant) vs Blinded target (attackers-of grant).
    // Net: two grants, zero imposes → advantage (one extra d20, NOT two extra dice).
    // PHB p.173: multiple sources of the same polarity still result in ONE advantage.
    const mods = [
      makeAdvMod('invisible-self-grant', 'grant'),    // Invisible creature's own attack advantage
      makeAdvMod('blinded-outgoing-grant', 'grant'),  // Blinded target: attackers have advantage
    ];
    const ctx = makeCtx();
    const result = resolveRollMode(mods, ctx);

    expect(result.mode).toBe('advantage');
    // Both sources tracked for provenance — but result is ONE advantage (not stacked double)
    expect(result.breakdown).toHaveLength(2);
  });

  it('STACK-01b: Poisoned attacker impose + Blinded target grant on same roll → normal (PHB p.173 cancel)', () => {
    // Scenario: Poisoned attacker (self-impose) attacks Blinded target (attackers-of grant).
    // Net: one grant cancels one impose → normal (one d20, no modifier).
    // PHB p.173: any advantage + any disadvantage = neither.
    const mods = [
      makeAdvMod('poisoned-self-impose', 'impose'),   // Poisoned attacker: own attacks at disadvantage
      makeAdvMod('blinded-outgoing-grant', 'grant'),  // Blinded target: attackers have advantage
    ];
    const ctx = makeCtx();
    const result = resolveRollMode(mods, ctx);

    expect(result.mode).toBe('normal');
    expect(result.breakdown).toHaveLength(2);
  });

  it('STACK-01c: two grants, zero imposes → advantage (one extra d20, polarity not multiplied)', () => {
    // PHB p.173: multiple sources of same polarity do NOT multiply.
    // Whether there is one or many advantage sources, result is always ONE advantage.
    const mods = [
      makeAdvMod('grant-a', 'grant'),
      makeAdvMod('grant-b', 'grant'),
    ];
    const ctx = makeCtx();
    const result = resolveRollMode(mods, ctx);

    expect(result.mode).toBe('advantage');
    // Not 'double-advantage' or any fabricated mode — just 'advantage'
    expect(result.breakdown).toHaveLength(2);
  });
});

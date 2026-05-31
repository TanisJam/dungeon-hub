/**
 * TDD tests — engine-spell-cast-suspend (Front #4 Slice 0)
 *
 * This file covers ALL domain tasks for the batch:
 *   - REQ-RB-01: 'on-incoming-spell' Trigger widening
 *   - ADR-4:     { kind: 'negate-spell-damage' } ReactionEffect third arm
 *   - REQ-SC-01: rollMagicMissile dart math + per-dart breakdown
 *
 * Strict TDD — tests written RED first, each RED→GREEN cycle documented.
 */
import { describe, it, expect } from 'vitest';
import type { Trigger, ReactionEffect } from '../types.js';

// ── Task 1.1 / 1.2 — 'on-incoming-spell' Trigger (REQ-RB-01) ─────────────────

describe("Trigger — 'on-incoming-spell' (REQ-RB-01)", () => {
  it("'on-incoming-spell' is a valid Trigger value", () => {
    // PHB p.275 — Shield fires "as a reaction, which you take when you are hit by an attack
    // or targeted by the magic missile spell". The trigger for the spell case is distinct
    // from 'on-incoming-attack'. This test asserts the union widening is additive and
    // TypeScript accepts the new member.
    const t: Trigger = 'on-incoming-spell';
    expect(t).toBe('on-incoming-spell');
  });

  it('existing trigger values remain valid (additive widening — non-breaking)', () => {
    // ADR-3: additive widening. All prior members of Trigger must still be assignable.
    const existing: Trigger[] = [
      'always',
      'on-attack-roll',
      'on-save',
      'on-cast',
      'on-attacked',
      'on-hit',
      'on-damage',
      'on-incoming-attack',
    ];
    for (const t of existing) {
      expect(typeof t).toBe('string');
    }
    expect(existing).toHaveLength(8);
  });
});

// ── Task 1.3 / 1.4 — { kind: 'negate-spell-damage' } ReactionEffect (ADR-4) ──

describe("ReactionEffect — 'negate-spell-damage' variant (ADR-4)", () => {
  it("{ kind: 'negate-spell-damage' } is a valid ReactionEffect third arm", () => {
    // PHB p.275 — Shield: "you take no damage from magic missile"
    // This is pure damage negation — distinct from 'counter' (cancels the whole spell,
    // Counterspell Slice 1) and 'ac-bonus' (grants AC vs attack rolls, not applicable
    // to auto-hit spells like Magic Missile).
    // ADR-4: third arm added additive; existing arms untouched.
    const effect: ReactionEffect = { kind: 'negate-spell-damage' };
    expect(effect.kind).toBe('negate-spell-damage');
  });

  it("existing 'counter' arm still valid after widening (PHB p.228)", () => {
    // PHB p.228 — Counterspell: cancel the triggering cast. autoIfSlotGe is intact.
    const effect: ReactionEffect = { kind: 'counter', autoIfSlotGe: 3 };
    expect(effect.kind).toBe('counter');
    expect((effect as { kind: 'counter'; autoIfSlotGe: number }).autoIfSlotGe).toBe(3);
  });

  it("existing 'ac-bonus' arm still valid after widening (PHB p.275 Shield vs attack)", () => {
    // PHB p.275 — Shield +5 AC; fires on 'on-incoming-attack' trigger.
    // vs 'negate-spell-damage' which fires on 'on-incoming-spell' trigger.
    const effect: ReactionEffect = { kind: 'ac-bonus', value: 5 };
    expect(effect.kind).toBe('ac-bonus');
    expect((effect as { kind: 'ac-bonus'; value: number }).value).toBe(5);
  });

  it('exhaustive switch handles all three arms (counter + ac-bonus + negate-spell-damage)', () => {
    // Compile-time safety: this switch fails tsc if any arm is missing.
    // Runtime verification that narrowing is correct.
    // Adding 'negate-spell-damage' widens the union — the switch must have a third arm.
    function handle(effect: ReactionEffect): string {
      switch (effect.kind) {
        case 'counter':
          return `counter-ge${effect.autoIfSlotGe}`;
        case 'ac-bonus':
          return `ac+${effect.value}`;
        case 'negate-spell-damage':
          return 'negate-spell-damage';
        default: {
          const _exhaustive: never = effect;
          return _exhaustive;
        }
      }
    }

    expect(handle({ kind: 'counter', autoIfSlotGe: 3 })).toBe('counter-ge3');
    expect(handle({ kind: 'ac-bonus', value: 5 })).toBe('ac+5');
    expect(handle({ kind: 'negate-spell-damage' })).toBe('negate-spell-damage');
  });
});

// ── Task 1.5 / 1.6 — rollMagicMissile (REQ-SC-01) ───────────────────────────

import { rollMagicMissile } from './magic-missile.js';
import type { RngFn } from '../dice/roll.js';

describe('rollMagicMissile — dart count (REQ-SC-01)', () => {
  // PHB p.257 — "three glowing darts … When you cast this spell using a spell slot of
  // 2nd level or higher, the spell creates one more dart for each slot level above 1st."
  // dartCount = 3 + (slotLevel - 1)

  const floorRng: RngFn = () => 1;

  it('slotLevel 1 → 3 darts (PHB p.257)', () => {
    const result = rollMagicMissile({ slotLevel: 1, rng: floorRng });
    expect(result.dartCount).toBe(3);
    expect(result.perDart).toHaveLength(3);
  });

  it('slotLevel 2 → 4 darts (PHB p.257 upcast)', () => {
    const result = rollMagicMissile({ slotLevel: 2, rng: floorRng });
    expect(result.dartCount).toBe(4);
    expect(result.perDart).toHaveLength(4);
  });

  it('slotLevel 3 → 5 darts (PHB p.257 upcast)', () => {
    const result = rollMagicMissile({ slotLevel: 3, rng: floorRng });
    expect(result.dartCount).toBe(5);
    expect(result.perDart).toHaveLength(5);
  });

  it('slotLevel 9 → 11 darts (PHB p.257 maximum upcast)', () => {
    const result = rollMagicMissile({ slotLevel: 9, rng: floorRng });
    expect(result.dartCount).toBe(11);
    expect(result.perDart).toHaveLength(11);
  });
});

describe('rollMagicMissile — per-dart damage (REQ-SC-01)', () => {
  // PHB p.257 — "Each dart deals 1d4+1 force damage to its target."
  // Min roll: 1 (d4=1) + 1 = 2; Max roll: 4 (d4=4) + 1 = 5.

  it('floor rng: each dart = 2 (1d4 min=1, +1 flat force)', () => {
    const floorRng: RngFn = () => 1;
    const result = rollMagicMissile({ slotLevel: 1, rng: floorRng });
    for (const dartDamage of result.perDart) {
      expect(dartDamage).toBe(2); // d4=1, +1 → 2
    }
  });

  it('ceiling rng: each dart = 5 (1d4 max=4, +1 flat force)', () => {
    const ceilRng: RngFn = (s) => s;
    const result = rollMagicMissile({ slotLevel: 1, rng: ceilRng });
    for (const dartDamage of result.perDart) {
      expect(dartDamage).toBe(5); // d4=4, +1 → 5
    }
  });

  it('each dart value is in range [2..5] (1d4+1 bounds)', () => {
    // Probabilistic boundary check: RNG returning values 1..4 → dart in [2..5].
    // We test each extremum deterministically (floor → 2, ceil → 5).
    const floorRng: RngFn = () => 1;
    const ceilRng: RngFn = (s) => s;

    const floorResult = rollMagicMissile({ slotLevel: 2, rng: floorRng });
    const ceilResult = rollMagicMissile({ slotLevel: 2, rng: ceilRng });

    for (const d of floorResult.perDart) {
      expect(d).toBeGreaterThanOrEqual(2);
    }
    for (const d of ceilResult.perDart) {
      expect(d).toBeLessThanOrEqual(5);
    }
  });
});

describe('rollMagicMissile — total and type (REQ-SC-01)', () => {
  it('total === sum of perDart', () => {
    // The total MUST be the sum of per-dart values — not independently rolled.
    const floorRng: RngFn = () => 1;
    const result = rollMagicMissile({ slotLevel: 3, rng: floorRng });
    const expectedTotal = result.perDart.reduce((acc, d) => acc + d, 0);
    expect(result.total).toBe(expectedTotal);
  });

  it('floor rng slotLevel 1: total = 6 (3 darts × 2 each)', () => {
    // Deterministic: floor rng → each dart = 2; 3 × 2 = 6.
    const floorRng: RngFn = () => 1;
    const result = rollMagicMissile({ slotLevel: 1, rng: floorRng });
    expect(result.total).toBe(6);
  });

  it('ceiling rng slotLevel 2: total = 20 (4 darts × 5 each)', () => {
    // Deterministic: ceil rng → each dart = 5; 4 × 5 = 20.
    const ceilRng: RngFn = (s) => s;
    const result = rollMagicMissile({ slotLevel: 2, rng: ceilRng });
    expect(result.total).toBe(20);
  });

  it("damage type is 'force' (PHB p.257)", () => {
    // PHB p.257: "Each dart deals 1d4+1 FORCE damage."
    const floorRng: RngFn = () => 1;
    const result = rollMagicMissile({ slotLevel: 1, rng: floorRng });
    expect(result.damageType).toBe('force');
  });
});

/**
 * Tests for rollToHit — pure d20 attack roll with injected RNG.
 *
 * PHB p.194 — "Attack Rolls":
 *   "When you make an attack, your attack roll determines whether the attack hits or misses."
 *   "To make an attack roll, roll a d20 and add the appropriate modifiers."
 *   "If the total of the roll plus modifiers equals or exceeds the target's Armor Class (AC),
 *    the attack hits."
 *
 * PHB p.194 — "Rolling 1 or 20":
 *   "If the d20 roll for an attack is a 20, the attack hits regardless of any modifiers or
 *    the target's AC. This is called a critical hit."
 *   "If the d20 roll for an attack is a 1, the attack misses regardless of any modifiers or
 *    the target's AC. This is called an automatic miss."
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 when you make the roll and use the
 *    higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * Strict TDD — RED first: this file is written BEFORE roll-to-hit.ts exists.
 * Design ref: sdd/engine-to-hit-ac/design — ADR-1 (rollToHit signature, semantics).
 */

import { describe, expect, it } from 'vitest';
import { rollToHit } from './roll-to-hit.js';
import type { RollToHitResult, RollMode } from './roll-to-hit.js';
import type { RngFn } from '../dice/roll.js';

// ── Queue-backed deterministic RNG stub ──────────────────────────────────────

/**
 * Returns a stub RngFn that pops values from the queue in order.
 * Throws if queue is exhausted — catches test setup mistakes early.
 */
function makeQueueRng(queue: number[]): RngFn {
  const q = [...queue];
  return (_sides: number): number => {
    const val = q.shift();
    if (val === undefined) throw new Error('[makeQueueRng] queue exhausted');
    return val;
  };
}

// ── Scenario 1: Normal hit (total >= AC) ─────────────────────────────────────

describe('rollToHit', () => {
  it(
    'Scenario 1 — normal hit: total >= AC → hit=true, crit=false, autoMiss=false (PHB p.194)',
    () => {
      // GIVEN toHitBonus=+5, targetAc=15, rollMode='normal', d20=13
      // WHEN total=18 >= 15
      // THEN hit=true, crit=false, autoMiss=false, d20=13, total=18
      const rng = makeQueueRng([13]);
      const result: RollToHitResult = rollToHit(5, 15, 'normal', rng);

      expect(result.d20).toBe(13);
      expect(result.d20All).toEqual([13]);
      expect(result.total).toBe(18); // 13 + 5
      expect(result.toHitBonus).toBe(5);
      expect(result.targetAc).toBe(15);
      expect(result.hit).toBe(true);
      expect(result.crit).toBe(false);
      expect(result.autoMiss).toBe(false);
    },
  );

  // ── Scenario 2: Normal miss (total < AC) ─────────────────────────────────────

  it(
    'Scenario 2 — normal miss: total < AC → hit=false, crit=false, autoMiss=false (PHB p.194)',
    () => {
      // GIVEN toHitBonus=+3, targetAc=18, rollMode='normal', d20=10
      // WHEN total=13 < 18
      // THEN hit=false
      const rng = makeQueueRng([10]);
      const result = rollToHit(3, 18, 'normal', rng);

      expect(result.d20).toBe(10);
      expect(result.total).toBe(13); // 10 + 3
      expect(result.hit).toBe(false);
      expect(result.crit).toBe(false);
      expect(result.autoMiss).toBe(false);
    },
  );

  // ── Scenario 3: Exact-AC boundary (total === AC is a HIT) ────────────────────

  it(
    'Scenario 3 — exact-AC boundary: total === targetAc is a HIT (PHB p.194 — "equals or exceeds")',
    () => {
      // GIVEN toHitBonus=+2, targetAc=14, rollMode='normal', d20=12
      // WHEN total=14 === 14
      // THEN hit=true (>= boundary includes equal)
      const rng = makeQueueRng([12]);
      const result = rollToHit(2, 14, 'normal', rng);

      expect(result.total).toBe(14);
      expect(result.hit).toBe(true);
      expect(result.crit).toBe(false);
      expect(result.autoMiss).toBe(false);
    },
  );

  // ── Scenario 4: Natural 20 vs high AC (auto-hit + crit) ──────────────────────

  it(
    'Scenario 4 — nat-20 vs AC=30: hit=true, crit=true even when total < AC (PHB p.194 — "Rolling 20")',
    () => {
      // GIVEN toHitBonus=+0, targetAc=30, rollMode='normal', d20=20
      // WHEN total=20 < 30 (would normally miss)
      // THEN nat-20 overrides: hit=true, crit=true, autoMiss=false
      // PHB p.194: "the attack hits regardless of any modifiers or the target's AC"
      const rng = makeQueueRng([20]);
      const result = rollToHit(0, 30, 'normal', rng);

      expect(result.d20).toBe(20);
      expect(result.total).toBe(20);
      expect(result.hit).toBe(true);
      expect(result.crit).toBe(true);
      expect(result.autoMiss).toBe(false);
    },
  );

  // ── Scenario 5: Natural 1 with high bonus (auto-miss) ────────────────────────

  it(
    'Scenario 5 — nat-1 with high bonus: hit=false, autoMiss=true even when total >= AC (PHB p.194 — "Rolling 1")',
    () => {
      // GIVEN toHitBonus=+12, targetAc=10, rollMode='normal', d20=1
      // WHEN total=13 >= 10 (would normally hit)
      // THEN nat-1 overrides: hit=false, autoMiss=true, crit=false
      // PHB p.194: "the attack misses regardless of any modifiers or the target's AC"
      const rng = makeQueueRng([1]);
      const result = rollToHit(12, 10, 'normal', rng);

      expect(result.d20).toBe(1);
      expect(result.total).toBe(13); // 1 + 12 (total still echoed)
      expect(result.hit).toBe(false);
      expect(result.autoMiss).toBe(true);
      expect(result.crit).toBe(false);
    },
  );

  // ── Scenario 6: Advantage — first die is 20, kept → crit ────────────────────

  it(
    'Scenario 6 — advantage: first die 20, second die 5 → kept=20, crit=true (PHB p.173)',
    () => {
      // GIVEN toHitBonus=+0, targetAc=15, rollMode='advantage', d1=20, d2=5
      // WHEN max(20,5)=20 → kept=20 → crit=true
      // THEN d20=20, d20All=[20,5], hit=true, crit=true
      const rng = makeQueueRng([20, 5]);
      const result = rollToHit(0, 15, 'advantage', rng);

      expect(result.d20).toBe(20);
      expect(result.d20All).toEqual([20, 5]);
      expect(result.hit).toBe(true);
      expect(result.crit).toBe(true);
      expect(result.total).toBe(20);
    },
  );

  // ── Scenario 7: Advantage — second die is 20, kept → crit ───────────────────

  it(
    'Scenario 7 — advantage: first die 5, second die 20 → kept=20, crit=true (PHB p.173)',
    () => {
      // GIVEN toHitBonus=+0, targetAc=15, rollMode='advantage', d1=5, d2=20
      // WHEN max(5,20)=20 → kept=20 → crit=true; d20All ORDER preserved=[5,20]
      const rng = makeQueueRng([5, 20]);
      const result = rollToHit(0, 15, 'advantage', rng);

      expect(result.d20).toBe(20);
      expect(result.d20All).toEqual([5, 20]); // roll ORDER preserved
      expect(result.hit).toBe(true);
      expect(result.crit).toBe(true);
    },
  );

  // ── Advantage: both dice 20 → crit ──────────────────────────────────────────

  it(
    'Advantage — both 20: kept=20 → crit=true (PHB p.173 + p.194)',
    () => {
      const rng = makeQueueRng([20, 20]);
      const result = rollToHit(0, 15, 'advantage', rng);

      expect(result.d20).toBe(20);
      expect(result.d20All).toEqual([20, 20]);
      expect(result.crit).toBe(true);
      expect(result.hit).toBe(true);
    },
  );

  // ── Advantage: miss scenario ─────────────────────────────────────────────────

  it(
    'Advantage — miss scenario: d1=3, d2=7 → kept=7, evaluate normally (no crit, no auto-miss)',
    () => {
      // GIVEN toHitBonus=+0, targetAc=15, rollMode='advantage', d1=3, d2=7
      // WHEN max(3,7)=7 → total=7 < 15 → miss
      const rng = makeQueueRng([3, 7]);
      const result = rollToHit(0, 15, 'advantage', rng);

      expect(result.d20).toBe(7);
      expect(result.d20All).toEqual([3, 7]);
      expect(result.hit).toBe(false);
      expect(result.crit).toBe(false);
      expect(result.autoMiss).toBe(false);
    },
  );

  // ── Scenario 8: Disadvantage — first die 20, NOT kept → no crit ──────────────

  it(
    'Scenario 8 — disadvantage: d1=20, d2=8 → kept=8, crit=false (PHB p.173 — keep lowest)',
    () => {
      // GIVEN toHitBonus=+5, targetAc=12, rollMode='disadvantage', d1=20, d2=8
      // WHEN min(20,8)=8 → kept=8 → NOT a crit (crit only on kept die)
      // AND 8+5=13 >= 12 → hit=true, crit=false
      // PHB p.173: "you roll a second d20 ... use the lower of the two rolls"
      const rng = makeQueueRng([20, 8]);
      const result = rollToHit(5, 12, 'disadvantage', rng);

      expect(result.d20).toBe(8); // kept = min(20,8) = 8
      expect(result.d20All).toEqual([20, 8]);
      expect(result.total).toBe(13); // 8 + 5
      expect(result.hit).toBe(true);
      expect(result.crit).toBe(false); // 20 was NOT kept
    },
  );

  // ── Scenario 9: Disadvantage — both dice 20 → crit (only possible crit case) ─

  it(
    'Scenario 9 — disadvantage both-20: kept=20 → crit=true (only crit case under disadv, PHB p.173+p.194)',
    () => {
      // GIVEN toHitBonus=+0, targetAc=15, rollMode='disadvantage', d1=20, d2=20
      // WHEN min(20,20)=20 → kept=20 → crit=true
      const rng = makeQueueRng([20, 20]);
      const result = rollToHit(0, 15, 'disadvantage', rng);

      expect(result.d20).toBe(20);
      expect(result.d20All).toEqual([20, 20]);
      expect(result.hit).toBe(true);
      expect(result.crit).toBe(true);
    },
  );

  // ── Disadvantage: nat-1 → auto-miss ─────────────────────────────────────────

  it(
    'Disadvantage — nat-1: d1=1, d2=8 → kept=1 → autoMiss=true (PHB p.194)',
    () => {
      // GIVEN toHitBonus=+10, targetAc=5, rollMode='disadvantage', d1=1, d2=8
      // WHEN min(1,8)=1 → kept=1 → auto-miss regardless of total
      const rng = makeQueueRng([1, 8]);
      const result = rollToHit(10, 5, 'disadvantage', rng);

      expect(result.d20).toBe(1);
      expect(result.d20All).toEqual([1, 8]);
      expect(result.hit).toBe(false);
      expect(result.autoMiss).toBe(true);
      expect(result.crit).toBe(false);
    },
  );

  // ── d20All length: 1 for normal, 2 for adv/disadv (REQ-TOHIT-06, REQ-TOHIT-08) ─

  it(
    'REQ-TOHIT-06/08 — normal: d20All has exactly 1 element equal to d20',
    () => {
      const rng = makeQueueRng([10]);
      const result = rollToHit(0, 15, 'normal', rng);

      expect(result.d20All.length).toBe(1);
      expect(result.d20All[0]).toBe(result.d20);
    },
  );

  it(
    'REQ-TOHIT-08 — advantage: d20All has exactly 2 elements',
    () => {
      const rng = makeQueueRng([8, 12]);
      const result = rollToHit(2, 15, 'advantage', rng);

      expect(result.d20All.length).toBe(2);
    },
  );

  it(
    'REQ-TOHIT-08 — disadvantage: d20All has exactly 2 elements',
    () => {
      const rng = makeQueueRng([15, 7]);
      const result = rollToHit(1, 12, 'disadvantage', rng);

      expect(result.d20All.length).toBe(2);
    },
  );

  // ── total = d20 + toHitBonus always (REQ-TOHIT-08 spot checks) ───────────────

  it(
    'REQ-TOHIT-08 — total = d20 (kept) + toHitBonus always (normal mode spot check)',
    () => {
      const rng = makeQueueRng([9]);
      const result = rollToHit(4, 20, 'normal', rng);

      expect(result.total).toBe(result.d20 + result.toHitBonus);
      expect(result.total).toBe(13); // 9 + 4
    },
  );

  it(
    'REQ-TOHIT-08 — total = kept + toHitBonus for advantage',
    () => {
      const rng = makeQueueRng([6, 14]);
      const result = rollToHit(3, 18, 'advantage', rng);

      expect(result.d20).toBe(14); // max(6,14)
      expect(result.total).toBe(result.d20 + result.toHitBonus);
      expect(result.total).toBe(17); // 14 + 3
    },
  );

  // ── Return shape: all 8 fields present (REQ-TOHIT-08) ────────────────────────

  it(
    'REQ-TOHIT-08 — return shape: all 8 required fields are present',
    () => {
      const rng = makeQueueRng([10]);
      const result = rollToHit(2, 15, 'normal', rng);

      // All 8 fields as per ADR-1 locked signature
      expect(typeof result.d20).toBe('number');
      expect(Array.isArray(result.d20All)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(typeof result.toHitBonus).toBe('number');
      expect(typeof result.targetAc).toBe('number');
      expect(typeof result.hit).toBe('boolean');
      expect(typeof result.crit).toBe('boolean');
      expect(typeof result.autoMiss).toBe('boolean');
    },
  );

  // ── toHitBonus and targetAc are echoed correctly ──────────────────────────────

  it(
    'REQ-TOHIT-08 — toHitBonus and targetAc are echoed from inputs',
    () => {
      const rng = makeQueueRng([10]);
      const result = rollToHit(7, 19, 'normal', rng);

      expect(result.toHitBonus).toBe(7);
      expect(result.targetAc).toBe(19);
    },
  );
});

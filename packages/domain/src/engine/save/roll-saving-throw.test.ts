/**
 * Tests for rollSavingThrow — pure d20 saving throw with injected RNG.
 *
 * PHB p.179 — "Saving Throws":
 *   "To make a saving throw, roll a d20 and add the appropriate ability modifier."
 *   "Each class specifies which two saving throws it is proficient in."
 *   "If the total of the roll plus modifiers equals or exceeds the Difficulty Class (DC),
 *    the saving throw is a success. Otherwise, it's a failure."
 *
 * PHB p.179 — NO nat-20 auto-success, NO nat-1 auto-fail:
 *   Unlike attack rolls (PHB p.194), saving throws have no special nat-20/nat-1 rules.
 *   success = (d20 + saveMod) >= dc, period.
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 when you make the roll and use the
 *    higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * Strict TDD — RED first: this file is written BEFORE roll-saving-throw.ts exists.
 * Design ref: sdd/engine-forced-check-3a/design — ADR-1 (rollSavingThrow signature).
 */

import { describe, expect, it } from 'vitest';
import { rollSavingThrow } from './roll-saving-throw.js';
import type { RollSavingThrowResult } from './roll-saving-throw.js';
import type { RngFn } from '../dice/roll.js';

// ── Queue-backed deterministic RNG stub ──────────────────────────────────────

function makeQueueRng(queue: number[]): RngFn {
  const q = [...queue];
  return (_sides: number): number => {
    const val = q.shift();
    if (val === undefined) throw new Error('[makeQueueRng] queue exhausted');
    return val;
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('rollSavingThrow', () => {
  // ── Scenario 1: normal success ───────────────────────────────────────────────

  it(
    'Scenario 1 — normal success: saveMod=+3, dc=14, rng=12 → total=15 >= 14, success=true (PHB p.179)',
    () => {
      // GIVEN saveMod=+3, dc=14, rollMode='normal', rng returns 12
      // WHEN rollSavingThrow is called
      // THEN d20=12, total=15, success=true, d20All=[12]
      const rng = makeQueueRng([12]);
      const result: RollSavingThrowResult = rollSavingThrow(3, 14, 'normal', rng);

      expect(result.d20).toBe(12);
      expect(result.d20All).toEqual([12]);
      expect(result.saveMod).toBe(3);
      expect(result.dc).toBe(14);
      expect(result.total).toBe(15); // 12 + 3
      expect(result.success).toBe(true);
      expect(result.rollMode).toBe('normal');
    },
  );

  // ── Scenario 2: normal failure ───────────────────────────────────────────────

  it(
    'Scenario 2 — normal failure: saveMod=+3, dc=14, rng=10 → total=13 < 14, success=false (PHB p.179)',
    () => {
      // GIVEN saveMod=+3, dc=14, rollMode='normal', rng returns 10
      // WHEN rollSavingThrow is called
      // THEN d20=10, total=13, success=false
      const rng = makeQueueRng([10]);
      const result = rollSavingThrow(3, 14, 'normal', rng);

      expect(result.d20).toBe(10);
      expect(result.total).toBe(13); // 10 + 3
      expect(result.success).toBe(false);
    },
  );

  // ── Scenario 3: exact DC boundary is success ─────────────────────────────────

  it(
    'Scenario 3 — exact DC boundary: total === dc → success=true (PHB p.179 — "equals or exceeds")',
    () => {
      // GIVEN saveMod=+2, dc=14, rng returns 12 → total=14 === dc
      const rng = makeQueueRng([12]);
      const result = rollSavingThrow(2, 14, 'normal', rng);

      expect(result.total).toBe(14);
      expect(result.success).toBe(true);
    },
  );

  // ── Scenario 4: nat-20 does NOT auto-succeed vs DC 25 ────────────────────────

  it(
    'Scenario 4 — nat-20 no auto-success: saveMod=+0, dc=25, rng=20 → total=20 < 25, success=false (PHB p.179)',
    () => {
      // PHB p.179: saving throws have NO nat-20 auto-success rule.
      // Unlike attack rolls (PHB p.194), nat-20 on a save is NOT an auto-success.
      // GIVEN saveMod=+0, dc=25, rollMode='normal', rng returns 20
      // WHEN total=20 < 25
      // THEN success=false (no special case)
      const rng = makeQueueRng([20]);
      const result = rollSavingThrow(0, 25, 'normal', rng);

      expect(result.d20).toBe(20);
      expect(result.total).toBe(20);
      expect(result.success).toBe(false); // 20 < 25 — no auto-success on saves
    },
  );

  // ── Scenario 5: nat-1 does NOT auto-fail vs DC 5 ─────────────────────────────

  it(
    'Scenario 5 — nat-1 no auto-fail: saveMod=+5, dc=5, rng=1 → total=6 >= 5, success=true (PHB p.179)',
    () => {
      // PHB p.179: saving throws have NO nat-1 auto-fail rule.
      // Unlike attack rolls (PHB p.194), nat-1 on a save is NOT an auto-fail.
      // GIVEN saveMod=+5, dc=5, rollMode='normal', rng returns 1
      // WHEN total=6 >= 5
      // THEN success=true (no special case)
      const rng = makeQueueRng([1]);
      const result = rollSavingThrow(5, 5, 'normal', rng);

      expect(result.d20).toBe(1);
      expect(result.total).toBe(6); // 1 + 5
      expect(result.success).toBe(true); // 6 >= 5 — no auto-fail on saves
    },
  );

  // ── Scenario 6: advantage keeps highest ──────────────────────────────────────

  it(
    'Scenario 6 — advantage keeps highest: saveMod=+2, dc=15, rng=[6,14] → d20=14, total=16, success=true (PHB p.173)',
    () => {
      // GIVEN saveMod=+2, dc=15, rollMode='advantage', rng returns [6, 14] in sequence
      // WHEN rollSavingThrow is called
      // THEN d20=14, d20All=[6,14], total=16, success=true
      const rng = makeQueueRng([6, 14]);
      const result = rollSavingThrow(2, 15, 'advantage', rng);

      expect(result.d20).toBe(14); // max(6,14)=14
      expect(result.d20All).toEqual([6, 14]);
      expect(result.total).toBe(16); // 14 + 2
      expect(result.success).toBe(true); // 16 >= 15
      expect(result.rollMode).toBe('advantage');
    },
  );

  // ── Scenario 7: disadvantage keeps lowest ────────────────────────────────────

  it(
    'Scenario 7 — disadvantage keeps lowest: saveMod=+2, dc=15, rng=[14,6] → d20=6, total=8, success=false (PHB p.173)',
    () => {
      // GIVEN saveMod=+2, dc=15, rollMode='disadvantage', rng returns [14, 6] in sequence
      // WHEN rollSavingThrow is called
      // THEN d20=6, d20All=[14,6], total=8, success=false
      const rng = makeQueueRng([14, 6]);
      const result = rollSavingThrow(2, 15, 'disadvantage', rng);

      expect(result.d20).toBe(6); // min(14,6)=6
      expect(result.d20All).toEqual([14, 6]);
      expect(result.total).toBe(8); // 6 + 2
      expect(result.success).toBe(false); // 8 < 15
      expect(result.rollMode).toBe('disadvantage');
    },
  );

  // ── Return shape: all 7 fields present ───────────────────────────────────────

  it(
    'Return shape — all 7 fields present: d20, d20All, saveMod, dc, total, success, rollMode',
    () => {
      const rng = makeQueueRng([10]);
      const result = rollSavingThrow(2, 15, 'normal', rng);

      expect(typeof result.d20).toBe('number');
      expect(Array.isArray(result.d20All)).toBe(true);
      expect(typeof result.saveMod).toBe('number');
      expect(typeof result.dc).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.rollMode).toBe('string');
    },
  );

  // ── d20All length: 1 for normal, 2 for adv/disadv ────────────────────────────

  it(
    'd20All length — normal: 1 element equal to d20',
    () => {
      const rng = makeQueueRng([10]);
      const result = rollSavingThrow(0, 15, 'normal', rng);

      expect(result.d20All.length).toBe(1);
      expect(result.d20All[0]).toBe(result.d20);
    },
  );

  it(
    'd20All length — advantage: 2 elements',
    () => {
      const rng = makeQueueRng([8, 12]);
      const result = rollSavingThrow(2, 15, 'advantage', rng);

      expect(result.d20All.length).toBe(2);
    },
  );

  it(
    'd20All length — disadvantage: 2 elements',
    () => {
      const rng = makeQueueRng([15, 7]);
      const result = rollSavingThrow(1, 12, 'disadvantage', rng);

      expect(result.d20All.length).toBe(2);
    },
  );

  // ── saveMod and dc are echoed ─────────────────────────────────────────────────

  it(
    'Echoed fields — saveMod and dc are echoed from inputs',
    () => {
      const rng = makeQueueRng([10]);
      const result = rollSavingThrow(7, 19, 'normal', rng);

      expect(result.saveMod).toBe(7);
      expect(result.dc).toBe(19);
    },
  );

  // ── total = d20 (kept) + saveMod ──────────────────────────────────────────────

  it(
    'total = d20 (kept) + saveMod always (normal spot check)',
    () => {
      const rng = makeQueueRng([9]);
      const result = rollSavingThrow(4, 20, 'normal', rng);

      expect(result.total).toBe(result.d20 + result.saveMod);
      expect(result.total).toBe(13); // 9 + 4
    },
  );
});

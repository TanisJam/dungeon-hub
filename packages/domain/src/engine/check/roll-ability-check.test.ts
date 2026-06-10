/**
 * Tests for rollAbilityCheck — pure d20 ability check with injected RNG.
 *
 * PHB p.174 — "Ability Checks":
 *   "To make an ability check, roll a d20 and add the relevant ability modifier."
 *   "If the total equals or exceeds the Difficulty Class (DC), the ability check
 *    is a success. Otherwise, it's a failure."
 *
 * PHB p.174 — NO nat-20 auto-success, NO nat-1 auto-fail:
 *   Unlike attack rolls (PHB p.194), ability checks have no special nat-20/nat-1
 *   rules. success = (d20 + checkMod) >= dc, period.
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * Strict TDD — RED first: this file is written BEFORE roll-ability-check.ts exists.
 * Design ref: sdd/engine-ability-check-surface/design — D8 (rollAbilityCheck contract).
 *
 * REQ-ROLL-01, REQ-ROLL-02, REQ-ROLL-03; scenarios ROLL-U1..U7.
 */

import { describe, expect, it } from 'vitest';
import { rollAbilityCheck } from './roll-ability-check.js';
import type { RollAbilityCheckResult } from './roll-ability-check.js';
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

describe('rollAbilityCheck', () => {
  // ── ROLL-U1: success >= DC ────────────────────────────────────────────────

  it(
    'ROLL-U1 — success: checkMod=+2, dc=12, rng=10 → total=12 >= 12, success=true (PHB p.174)',
    () => {
      // GIVEN checkMod=+2, dc=12, rollMode='normal', rng returns 10
      // WHEN rollAbilityCheck is called
      // THEN d20=10, total=12, success=true, d20All=[10]
      const rng = makeQueueRng([10]);
      const result: RollAbilityCheckResult = rollAbilityCheck(2, 12, 'normal', rng);

      expect(result.d20).toBe(10);
      expect(result.d20All).toEqual([10]);
      expect(result.checkMod).toBe(2);
      expect(result.dc).toBe(12);
      expect(result.total).toBe(12); // 10 + 2
      expect(result.success).toBe(true);
      expect(result.rollMode).toBe('normal');
    },
  );

  // ── ROLL-U2: fail < DC ────────────────────────────────────────────────────

  it(
    'ROLL-U2 — fail: checkMod=+1, dc=12, rng=10 → total=11 < 12, success=false (PHB p.174)',
    () => {
      // GIVEN checkMod=+1, dc=12, rollMode='normal', rng returns 10
      // WHEN rollAbilityCheck is called
      // THEN total=11, success=false
      const rng = makeQueueRng([10]);
      const result = rollAbilityCheck(1, 12, 'normal', rng);

      expect(result.d20).toBe(10);
      expect(result.total).toBe(11); // 10 + 1
      expect(result.success).toBe(false);
    },
  );

  // ── ROLL-U3: nat-20 BELOW DC fails (PHB p.174 distinctive test) ──────────

  it(
    'ROLL-U3 — nat-20 no auto-success: checkMod=-10, dc=15, rng=20 → total=10 < 15, success=false (PHB p.174)',
    () => {
      // PHB p.174: ability checks have NO nat-20 auto-success rule.
      // Unlike attack rolls (PHB p.194), nat-20 on a check is NOT an auto-success.
      // GIVEN checkMod=-10, dc=15, rollMode='normal', rng returns 20
      // WHEN total=10 < 15
      // THEN success=false (no special case)
      const rng = makeQueueRng([20]);
      const result = rollAbilityCheck(-10, 15, 'normal', rng);

      expect(result.d20).toBe(20);
      expect(result.total).toBe(10); // 20 + (-10)
      expect(result.success).toBe(false); // 10 < 15 — no auto-success on checks
    },
  );

  // ── ROLL-U4: nat-1 ABOVE DC succeeds (PHB p.174 distinctive test) ────────

  it(
    'ROLL-U4 — nat-1 no auto-fail: checkMod=+15, dc=10, rng=1 → total=16 >= 10, success=true (PHB p.174)',
    () => {
      // PHB p.174: ability checks have NO nat-1 auto-fail rule.
      // Unlike attack rolls (PHB p.194), nat-1 on a check is NOT an auto-fail.
      // GIVEN checkMod=+15, dc=10, rollMode='normal', rng returns 1
      // WHEN total=16 >= 10
      // THEN success=true (no special case)
      const rng = makeQueueRng([1]);
      const result = rollAbilityCheck(15, 10, 'normal', rng);

      expect(result.d20).toBe(1);
      expect(result.total).toBe(16); // 1 + 15
      expect(result.success).toBe(true); // 16 >= 10 — no auto-fail on checks
    },
  );

  // ── ROLL-U5: advantage keeps highest (PHB p.173) ─────────────────────────

  it(
    'ROLL-U5 — advantage keeps highest: rollMode=advantage, rng=[5,18] → d20=18, d20All=[5,18] (PHB p.173)',
    () => {
      // GIVEN rollMode='advantage', rng returns [5, 18] in sequence
      // WHEN rollAbilityCheck is called
      // THEN d20=18, d20All=[5,18]
      const rng = makeQueueRng([5, 18]);
      const result = rollAbilityCheck(0, 10, 'advantage', rng);

      expect(result.d20).toBe(18); // max(5,18)=18
      expect(result.d20All).toEqual([5, 18]);
      expect(result.rollMode).toBe('advantage');
    },
  );

  // ── ROLL-U6: disadvantage keeps lowest (PHB p.173) ───────────────────────

  it(
    'ROLL-U6 — disadvantage keeps lowest: rollMode=disadvantage, rng=[18,5] → d20=5, d20All=[18,5] (PHB p.173)',
    () => {
      // GIVEN rollMode='disadvantage', rng returns [18, 5] in sequence
      // WHEN rollAbilityCheck is called
      // THEN d20=5, d20All=[18,5]
      const rng = makeQueueRng([18, 5]);
      const result = rollAbilityCheck(0, 10, 'disadvantage', rng);

      expect(result.d20).toBe(5); // min(18,5)=5
      expect(result.d20All).toEqual([18, 5]);
      expect(result.rollMode).toBe('disadvantage');
    },
  );

  // ── ROLL-U7: no crit field (PHB p.174 — checks don't crit) ──────────────

  it(
    'ROLL-U7 — no crit field: RollAbilityCheckResult MUST NOT have a "crit" field (PHB p.174)',
    () => {
      // PHB p.174: ability checks have no critical hit concept.
      // This distinguishes checks from attack rolls (PHB p.194).
      const rng = makeQueueRng([10]);
      const result = rollAbilityCheck(0, 10, 'normal', rng);

      expect('crit' in result).toBe(false);
    },
  );

  // ── Return shape: 7 fields present ───────────────────────────────────────

  it(
    'Return shape — all 7 fields present: d20, d20All, checkMod, dc, total, success, rollMode',
    () => {
      const rng = makeQueueRng([10]);
      const result = rollAbilityCheck(2, 15, 'normal', rng);

      expect(typeof result.d20).toBe('number');
      expect(Array.isArray(result.d20All)).toBe(true);
      expect(typeof result.checkMod).toBe('number');
      expect(typeof result.dc).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.rollMode).toBe('string');
    },
  );

  // ── d20All length: 1 for normal, 2 for adv/disadv ────────────────────────

  it('d20All length — normal: 1 element equal to d20', () => {
    const rng = makeQueueRng([10]);
    const result = rollAbilityCheck(0, 15, 'normal', rng);

    expect(result.d20All.length).toBe(1);
    expect(result.d20All[0]).toBe(result.d20);
  });

  it('d20All length — advantage: 2 elements', () => {
    const rng = makeQueueRng([8, 12]);
    const result = rollAbilityCheck(2, 15, 'advantage', rng);

    expect(result.d20All.length).toBe(2);
  });

  it('d20All length — disadvantage: 2 elements', () => {
    const rng = makeQueueRng([15, 7]);
    const result = rollAbilityCheck(1, 12, 'disadvantage', rng);

    expect(result.d20All.length).toBe(2);
  });

  // ── checkMod and dc are echoed ────────────────────────────────────────────

  it('Echoed fields — checkMod and dc are echoed from inputs', () => {
    const rng = makeQueueRng([10]);
    const result = rollAbilityCheck(7, 19, 'normal', rng);

    expect(result.checkMod).toBe(7);
    expect(result.dc).toBe(19);
  });

  // ── total = d20 (kept) + checkMod ────────────────────────────────────────

  it('total = d20 (kept) + checkMod always (normal spot check)', () => {
    const rng = makeQueueRng([9]);
    const result = rollAbilityCheck(4, 20, 'normal', rng);

    expect(result.total).toBe(result.d20 + result.checkMod);
    expect(result.total).toBe(13); // 9 + 4
  });
});

/**
 * Tests for rollContest — pure DC-less two-actor contested check (PHB p.174).
 *
 * PHB p.174 — Contests:
 *   "Sometimes one character's or monster's efforts are directly opposed to another's.
 *    ... Both participants make ability checks appropriate to their efforts. They apply
 *    all appropriate bonuses and penalties, but instead of comparing the total to a DC,
 *    they compare the totals of their two checks. The participant with the higher check
 *    total wins the contest."
 *   "If the contest results in a tie, the situation remains the same as it was before
 *    the contest."
 *
 * PHB p.173 — Advantage and Disadvantage:
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * PHB p.174 — NO nat-20/nat-1 special cases on checks:
 *   Contests are ability checks. Ability checks have no auto-success on nat-20 or
 *   auto-fail on nat-1 (unlike attack rolls, PHB p.194). Total is compared as-is.
 *
 * Design ref: sdd/engine-contested-checks/design — D-PRIM (rollContest signature + result type).
 * Spec: REQ-CONTEST-01..07, scenarios CONTEST-S1..S3.
 *
 * Strict TDD — RED first: this file is written BEFORE roll-contest.ts exists.
 */

import { describe, expect, it } from 'vitest';
import { rollContest } from './roll-contest.js';
import type { RollContestResult } from './roll-contest.js';
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

describe('rollContest', () => {
  // ── T1a-RED: attacker-wins when attacker.total > defender.total ──────────────

  it(
    'T1a — attacker wins when attacker.total > defender.total (PHB p.174, scripted rng a=15 mod=+3→18, d=8 mod=+0→8)',
    () => {
      // PHB p.174: "The participant with the higher check total wins the contest."
      // GIVEN attackerMod=+3, defenderMod=+0, both rollMode='normal'
      //       scripted rng: attacker die=15, defender die=8
      // WHEN rollContest is called
      // THEN winner='attacker', attacker.total=18, defender.total=8
      // AND neither side has dc, success, or crit fields (REQ-CONTEST-02)
      const rng = makeQueueRng([15, 8]); // attacker die first, then defender die
      const result: RollContestResult = rollContest(3, 0, 'normal', 'normal', rng);

      expect(result.winner).toBe('attacker');
      expect(result.attacker.d20).toBe(15);
      expect(result.attacker.checkMod).toBe(3);
      expect(result.attacker.total).toBe(18); // 15 + 3
      expect(result.defender.d20).toBe(8);
      expect(result.defender.checkMod).toBe(0);
      expect(result.defender.total).toBe(8); // 8 + 0
      // REQ-CONTEST-02: no dc, success, crit on either side result
      expect('dc' in result.attacker).toBe(false);
      expect('success' in result.attacker).toBe(false);
      expect('crit' in result.attacker).toBe(false);
      expect('dc' in result.defender).toBe(false);
      expect('success' in result.defender).toBe(false);
      expect('crit' in result.defender).toBe(false);
    },
  );

  // ── T1b-RED: defender-wins when defender.total > attacker.total ──────────────
  // (Falsification: swapped mods means T1a attacker-wins assertion WOULD fail here)

  it(
    'T1b — defender wins when defender.total > attacker.total (PHB p.174, scripted rng a=8 mod=+0→8, d=15 mod=+3→18)',
    () => {
      // PHB p.174: higher total wins. Swap mods to make defender win.
      // GIVEN attackerMod=+0, defenderMod=+3, both rollMode='normal'
      //       scripted rng: attacker die=8, defender die=15
      // WHEN rollContest is called
      // THEN winner='defender', attacker.total=8, defender.total=18
      const rng = makeQueueRng([8, 15]);
      const result = rollContest(0, 3, 'normal', 'normal', rng);

      expect(result.winner).toBe('defender');
      expect(result.attacker.total).toBe(8);
      expect(result.defender.total).toBe(18);
    },
  );

  // ── T1c-RED: tie when totals equal ──────────────────────────────────────────

  it(
    'T1c — tie when totals are equal (PHB p.174: "situation remains the same", both dice=10 mod=+0→10 each)',
    () => {
      // PHB p.174: "If the contest results in a tie, the situation remains the same."
      // GIVEN attackerMod=+0, defenderMod=+0, both rollMode='normal'
      //       scripted rng: both dice=10
      // WHEN rollContest is called
      // THEN winner='tie', attacker.total=10, defender.total=10
      const rng = makeQueueRng([10, 10]);
      const result = rollContest(0, 0, 'normal', 'normal', rng);

      expect(result.winner).toBe('tie');
      expect(result.attacker.total).toBe(10);
      expect(result.defender.total).toBe(10);
    },
  );

  // ── T1d-RED: advantage kept-die = Math.max (PHB p.173) ──────────────────────

  it(
    'T1d — attacker rollMode=advantage: kept-die = Math.max, d20All=[8,15] (PHB p.173)',
    () => {
      // PHB p.173: "When you have advantage, you roll a second d20 and use the higher."
      // GIVEN attackerRollMode='advantage', scripted rng: attacker=[8,15], defender=10 (normal)
      // WHEN rollContest is called
      // THEN attacker.d20=15 (max(8,15)), attacker.d20All=[8,15]
      const rng = makeQueueRng([8, 15, 10]); // 2 dice for attacker advantage, then 1 for defender
      const result = rollContest(0, 0, 'advantage', 'normal', rng);

      expect(result.attacker.d20).toBe(15); // max(8,15)
      expect(result.attacker.d20All).toEqual([8, 15]);
      expect(result.attacker.rollMode).toBe('advantage');
    },
  );

  // ── T1e-RED: disadvantage kept-die = Math.min (PHB p.173) ───────────────────

  it(
    'T1e — attacker rollMode=disadvantage: kept-die = Math.min, d20All=[15,8] (PHB p.173)',
    () => {
      // PHB p.173: "When you have disadvantage, you roll a second d20 and use the lower."
      // GIVEN attackerRollMode='disadvantage', scripted rng: attacker=[15,8], defender=10 (normal)
      // WHEN rollContest is called
      // THEN attacker.d20=8 (min(15,8)), attacker.d20All=[15,8]
      const rng = makeQueueRng([15, 8, 10]); // 2 dice for attacker disadv, then 1 for defender
      const result = rollContest(0, 0, 'disadvantage', 'normal', rng);

      expect(result.attacker.d20).toBe(8); // min(15,8)
      expect(result.attacker.d20All).toEqual([15, 8]);
      expect(result.attacker.rollMode).toBe('disadvantage');
    },
  );

  // ── T1f-RED: normal rollMode → d20All.length===1 ────────────────────────────

  it(
    'T1f — defender rollMode=normal → d20All has exactly 1 element (REQ-CONTEST-07)',
    () => {
      // REQ-CONTEST-07: d20All MUST contain one element when rollMode==='normal'.
      // GIVEN defenderRollModeD='normal', scripted rng: attacker=10, defender=12
      // WHEN rollContest is called
      // THEN defender.d20All.length===1
      const rng = makeQueueRng([10, 12]);
      const result = rollContest(0, 0, 'normal', 'normal', rng);

      expect(result.defender.d20All.length).toBe(1);
      expect(result.defender.d20All[0]).toBe(12);
    },
  );

  // ── T1g-RED: per-side independence ──────────────────────────────────────────

  it(
    'T1g — attacker rollMode=advantage + defender rollMode=normal → d20All lengths 2 and 1 respectively (REQ-CONTEST-06/07)',
    () => {
      // REQ-CONTEST-06: rollModes are INDEPENDENT per side.
      // GIVEN attackerRollMode='advantage', defenderRollModeD='normal'
      //       scripted rng: attacker=[5,12], defender=7
      // WHEN rollContest is called
      // THEN attacker.d20All.length===2, defender.d20All.length===1
      const rng = makeQueueRng([5, 12, 7]);
      const result = rollContest(0, 0, 'advantage', 'normal', rng);

      expect(result.attacker.d20All.length).toBe(2);
      expect(result.defender.d20All.length).toBe(1);
    },
  );

  // ── Additional shape assertions ───────────────────────────────────────────────

  it('result shape has exactly: attacker, defender, winner (no extra fields at top level)', () => {
    // REQ-CONTEST-02: RollContestResult must have exactly attacker, defender, winner.
    const rng = makeQueueRng([10, 10]);
    const result = rollContest(0, 0, 'normal', 'normal', rng);

    expect('attacker' in result).toBe(true);
    expect('defender' in result).toBe(true);
    expect('winner' in result).toBe(true);
  });

  it('each side result has 5 fields: d20, d20All, checkMod, total, rollMode (REQ-CONTEST-02)', () => {
    // D-PRIM: ContestSideResult has exactly {d20, d20All, checkMod, total, rollMode}.
    const rng = makeQueueRng([10, 10]);
    const result = rollContest(0, 0, 'normal', 'normal', rng);

    expect(typeof result.attacker.d20).toBe('number');
    expect(Array.isArray(result.attacker.d20All)).toBe(true);
    expect(typeof result.attacker.checkMod).toBe('number');
    expect(typeof result.attacker.total).toBe('number');
    expect(typeof result.attacker.rollMode).toBe('string');
    expect(typeof result.defender.d20).toBe('number');
    expect(Array.isArray(result.defender.d20All)).toBe(true);
    expect(typeof result.defender.checkMod).toBe('number');
    expect(typeof result.defender.total).toBe('number');
    expect(typeof result.defender.rollMode).toBe('string');
  });

  it('total = d20 (kept) + checkMod for both sides', () => {
    // PHB p.174: total is the die + modifier. No other adjustments in rollContest.
    const rng = makeQueueRng([7, 11]);
    const result = rollContest(2, -1, 'normal', 'normal', rng);

    expect(result.attacker.total).toBe(9);  // 7 + 2
    expect(result.defender.total).toBe(10); // 11 + (-1)
    expect(result.winner).toBe('defender');
  });

  it('checkMod and rollMode are echoed back on each side', () => {
    // D-PRIM: checkMod and rollMode are echoed (same as ContestSideResult contract).
    const rng = makeQueueRng([10, 5]);
    const result = rollContest(4, -2, 'normal', 'normal', rng);

    expect(result.attacker.checkMod).toBe(4);
    expect(result.attacker.rollMode).toBe('normal');
    expect(result.defender.checkMod).toBe(-2);
    expect(result.defender.rollMode).toBe('normal');
  });

  it('CONTEST-S1: scenario — attacker wins, attacker=15+3=18, defender=8+0=8 (PHB p.174)', () => {
    // REQ-CONTEST-03: winner='attacker' when attacker.total > defender.total.
    const rng = makeQueueRng([15, 8]);
    const result = rollContest(3, 0, 'normal', 'normal', rng);

    expect(result.winner).toBe('attacker');
    expect(result.attacker.total).toBe(18);
    expect(result.defender.total).toBe(8);
    expect('dc' in result).toBe(false);
  });

  it('CONTEST-S2: scenario — tie = status quo, both total=10 (PHB p.174)', () => {
    // REQ-CONTEST-05: winner='tie' when totals are equal (no condition applied).
    const rng = makeQueueRng([10, 10]);
    const result = rollContest(0, 0, 'normal', 'normal', rng);

    expect(result.winner).toBe('tie');
    expect(result.attacker.total).toBe(result.defender.total);
  });

  it(
    'CONTEST-S3: scenario — advantage respects per-side rollMode (PHB p.173, attacker adv=[8,15]→kept 15)',
    () => {
      // REQ-CONTEST-06: rollModeA is independent from rollModeD.
      // attacker rng=[8,15] advantage → kept 15; defender rng=12 normal → kept 12
      const rng = makeQueueRng([8, 15, 12]);
      const result = rollContest(0, 0, 'advantage', 'normal', rng);

      expect(result.attacker.d20).toBe(15); // max(8,15)
      expect(result.attacker.d20All).toEqual([8, 15]);
      expect(result.defender.d20All.length).toBe(1);
    },
  );
});

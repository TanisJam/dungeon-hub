/**
 * Tests for rollInitiative — pure DC-less d20 initiative roll with injected RNG.
 *
 * PHB p.189 — Initiative:
 *   "At the beginning of every combat, roll initiative by making a Dexterity check."
 *   "The DM makes one roll for each group of identical creatures."
 *
 * PHB p.189 — Initiative is an ORDERING number, NOT a success/fail check:
 *   Initiative produces a sort order for combatants. There is NO DC and NO success/fail.
 *   This is explicitly distinct from ability checks (PHB p.173-175).
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * PHB p.174 — NO nat-20/nat-1 special cases on checks:
 *   Initiative (a Dexterity check) has no auto-success or auto-fail for any die face.
 *   No RNG retry loops needed — no hit/miss dichotomy (REQ-HYGIENE-05).
 *
 * Strict TDD — RED first: this file is written BEFORE roll-initiative.ts exists.
 * Design ref: sdd/engine-feral-instinct/design — D1 (rollInitiative contract).
 *
 * REQ-PRIM-01..04; scenarios PRIM-U1..U7.
 */

import { describe, expect, it } from 'vitest';
import { rollInitiative } from './roll-initiative.js';
import type { RollInitiativeResult } from './roll-initiative.js';
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

describe('rollInitiative', () => {
  // ── PRIM-U1: normal roll, total correct ────────────────────────────────────

  it(
    'PRIM-U1 — normal roll: checkMod=3, rng=10, mode=normal → d20=10, total=13, d20All=[10] (PHB p.189)',
    () => {
      // GIVEN checkMod=3, rollMode='normal', rng returns 10
      // WHEN rollInitiative is called
      // THEN d20=10, d20All=[10], total=13, rollMode='normal'
      // AND no success, dc, or crit fields
      const rng = makeQueueRng([10]);
      const result: RollInitiativeResult = rollInitiative(3, 'normal', rng);

      expect(result.d20).toBe(10);
      expect(result.d20All).toEqual([10]);
      expect(result.checkMod).toBe(3);
      expect(result.total).toBe(13); // 10 + 3
      expect(result.rollMode).toBe('normal');
    },
  );

  // ── PRIM-U2: advantage keeps highest (PHB p.173) ──────────────────────────

  it(
    'PRIM-U2 — advantage keeps highest: rng=[5,17], mode=advantage → d20=17, d20All=[5,17], length=2 (PHB p.173)',
    () => {
      // GIVEN rollMode='advantage', rng returns [5, 17] in sequence
      // WHEN rollInitiative is called
      // THEN d20=17, d20All=[5,17] (length===2), total = 17 + checkMod
      const rng = makeQueueRng([5, 17]);
      const result = rollInitiative(0, 'advantage', rng);

      expect(result.d20).toBe(17); // max(5,17)=17
      expect(result.d20All).toEqual([5, 17]);
      expect(result.d20All.length).toBe(2);
      expect(result.total).toBe(17); // 17 + 0
      expect(result.rollMode).toBe('advantage');
    },
  );

  // ── PRIM-U3: disadvantage keeps lowest (PHB p.173) ────────────────────────

  it(
    'PRIM-U3 — disadvantage keeps lowest: rng=[17,5], mode=disadvantage → d20=5, d20All=[17,5], length=2 (PHB p.173)',
    () => {
      // GIVEN rollMode='disadvantage', rng returns [17, 5] in sequence
      // WHEN rollInitiative is called
      // THEN d20=5, d20All=[17,5] (length===2)
      const rng = makeQueueRng([17, 5]);
      const result = rollInitiative(0, 'disadvantage', rng);

      expect(result.d20).toBe(5); // min(17,5)=5
      expect(result.d20All).toEqual([17, 5]);
      expect(result.d20All.length).toBe(2);
      expect(result.rollMode).toBe('disadvantage');
    },
  );

  // ── PRIM-U4: negative modifier ─────────────────────────────────────────────

  it(
    'PRIM-U4 — negative modifier: checkMod=-2, rng=8, mode=normal → total=6 (PHB p.189)',
    () => {
      // GIVEN checkMod=-2, rollMode='normal', rng returns 8
      // WHEN rollInitiative is called
      // THEN total=6 (8 + (-2))
      const rng = makeQueueRng([8]);
      const result = rollInitiative(-2, 'normal', rng);

      expect(result.d20).toBe(8);
      expect(result.total).toBe(6); // 8 + (-2)
      expect(result.checkMod).toBe(-2);
    },
  );

  // ── PRIM-U5: no success field (REQ-PRIM-04 — initiative has no DC) ────────

  it(
    'PRIM-U5 — no success field: RollInitiativeResult MUST NOT have a "success" field (PHB p.189)',
    () => {
      // PHB p.189: initiative is a DC-less ordering roll, not a success/fail check.
      // Including success would be misleading domain data (anti-pattern per #2115).
      const rng = makeQueueRng([10]);
      const result = rollInitiative(0, 'normal', rng);

      expect('success' in result).toBe(false);
    },
  );

  // ── PRIM-U6: no dc field (REQ-PRIM-04) ────────────────────────────────────

  it(
    'PRIM-U6 — no dc field: RollInitiativeResult MUST NOT have a "dc" field (PHB p.189)',
    () => {
      // PHB p.189: initiative has no Difficulty Class.
      const rng = makeQueueRng([10]);
      const result = rollInitiative(0, 'normal', rng);

      expect('dc' in result).toBe(false);
    },
  );

  // ── PRIM-U7: no crit field (PHB p.174 — checks don't crit) ───────────────

  it(
    'PRIM-U7 — no crit field: RollInitiativeResult MUST NOT have a "crit" field (PHB p.174)',
    () => {
      // PHB p.174: ability checks (including initiative) have no critical hit concept.
      // Unlike attack rolls (PHB p.194), initiative is NOT an attack roll.
      const rng = makeQueueRng([10]);
      const result = rollInitiative(0, 'normal', rng);

      expect('crit' in result).toBe(false);
    },
  );

  // ── Additional shape / total formula assertions ────────────────────────────

  it('d20All length — normal: 1 element equal to d20', () => {
    const rng = makeQueueRng([15]);
    const result = rollInitiative(2, 'normal', rng);

    expect(result.d20All.length).toBe(1);
    expect(result.d20All[0]).toBe(result.d20);
  });

  it('d20All length — advantage: 2 elements', () => {
    const rng = makeQueueRng([8, 12]);
    const result = rollInitiative(1, 'advantage', rng);

    expect(result.d20All.length).toBe(2);
  });

  it('d20All length — disadvantage: 2 elements', () => {
    const rng = makeQueueRng([15, 7]);
    const result = rollInitiative(1, 'disadvantage', rng);

    expect(result.d20All.length).toBe(2);
  });

  it('total = d20 (kept) + checkMod always (normal spot check)', () => {
    const rng = makeQueueRng([9]);
    const result = rollInitiative(4, 'normal', rng);

    expect(result.total).toBe(result.d20 + result.checkMod);
    expect(result.total).toBe(13); // 9 + 4
  });

  it('Return shape — 5 required fields: d20, d20All, checkMod, total, rollMode', () => {
    const rng = makeQueueRng([10]);
    const result = rollInitiative(2, 'normal', rng);

    expect(typeof result.d20).toBe('number');
    expect(Array.isArray(result.d20All)).toBe(true);
    expect(typeof result.checkMod).toBe('number');
    expect(typeof result.total).toBe('number');
    expect(typeof result.rollMode).toBe('string');
  });
});

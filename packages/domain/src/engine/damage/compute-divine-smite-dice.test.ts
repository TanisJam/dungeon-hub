/**
 * Tests for computeDivineSmiteDice — Divine Smite damage dice formula.
 *
 * PHB p.85 — Divine Smite:
 *   "Starting at 2nd level, when you hit a creature with a melee weapon attack,
 *    you can expend one spell slot to deal radiant damage to the target, in
 *    addition to the weapon's damage. The extra damage is 2d8 for a 1st-level
 *    spell slot, plus 1d8 for each spell level higher than 1st, to a maximum of
 *    5d8. The damage increases by 1d8 if the target is an undead or a fiend,
 *    to a maximum of 6d8."
 *
 * Strict TDD: tests written BEFORE implementation (RED step).
 * Design ref: sdd/engine-divine-smite/design — ADR-2.
 */

import { describe, it, expect } from 'vitest';
import { computeDivineSmiteDice } from './compute-divine-smite-dice.js';

describe('computeDivineSmiteDice', () => {
  // PHB p.85: "2d8 for a 1st-level spell slot, plus 1d8 for each spell level higher than 1st"

  it('slot 1, no undead/fiend → 2d8 (base, PHB p.85)', () => {
    // PHB p.85: 1st-level slot → 2d8 radiant damage.
    expect(computeDivineSmiteDice(1, false)).toBe('2d8');
  });

  it('slot 2, no undead/fiend → 3d8 (PHB p.85: +1d8 per slot level above 1st)', () => {
    // PHB p.85: 2nd-level slot → 2d8 + 1d8 = 3d8.
    expect(computeDivineSmiteDice(2, false)).toBe('3d8');
  });

  it('slot 3, no undead/fiend → 4d8 (PHB p.85)', () => {
    // PHB p.85: 3rd-level slot → 2d8 + 2d8 = 4d8.
    expect(computeDivineSmiteDice(3, false)).toBe('4d8');
  });

  it('slot 4, no undead/fiend → 5d8 (at cap, PHB p.85: "to a maximum of 5d8")', () => {
    // PHB p.85: 4th-level slot → 2d8 + 3d8 = 5d8, which is the cap.
    expect(computeDivineSmiteDice(4, false)).toBe('5d8');
  });

  it('slot 5, no undead/fiend → 5d8 (cap holds, PHB p.85: "to a maximum of 5d8")', () => {
    // PHB p.85: cap of 5d8 does not increase beyond slot 4 for normal targets.
    // slotLevel=5 would give 6d8 without cap, but cap is 5d8 for non-undead/fiend.
    expect(computeDivineSmiteDice(5, false)).toBe('5d8');
  });

  it('slot 1, undead/fiend → 3d8 (PHB p.85: "+1d8 if the target is an undead or a fiend")', () => {
    // PHB p.85: 1st-level slot vs undead/fiend → 2d8 + 1d8 bonus = 3d8.
    expect(computeDivineSmiteDice(1, true)).toBe('3d8');
  });

  it('slot 4, undead/fiend → 6d8 (absolute cap, PHB p.85: "to a maximum of 6d8")', () => {
    // PHB p.85: 4th-level slot vs undead/fiend → 5d8 + 1d8 bonus = 6d8 (absolute cap).
    expect(computeDivineSmiteDice(4, true)).toBe('6d8');
  });

  it('slot 5, undead/fiend → 6d8 (absolute cap holds, PHB p.85)', () => {
    // PHB p.85: cannot exceed 6d8 even at higher slot levels vs undead/fiend.
    expect(computeDivineSmiteDice(5, true)).toBe('6d8');
  });
});

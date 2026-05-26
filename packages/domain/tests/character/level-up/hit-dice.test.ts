import { describe, expect, it } from 'vitest';
import {
  hitDiceTotalsByDie,
  hitDiceTotalCount,
  hitDiceRecoveredOnLongRest,
  chooseHitDiceRecovery,
} from '../../../src/character/level-up/hit-dice.js';
import type { AppliedClass } from '../../../src/character/class/types.js';

function mk(slug: string, level: number, hitDie: string): AppliedClass {
  return {
    slug, source: 'PHB', level,
    subclass: null, hitDie,
    savingThrows: [],
    armorProficiencies: [], weaponProficiencies: [],
    toolProficiencies: [], skillChoices: [],
  };
}

describe('hitDiceTotalsByDie', () => {
  it('Wizard 5 → { d6: 5 }', () => {
    expect(hitDiceTotalsByDie([mk('wizard', 5, 'd6')])).toEqual({ d6: 5 });
  });
  it('Wizard 3 / Fighter 1 → { d6: 3, d10: 1 }', () => {
    expect(hitDiceTotalsByDie([mk('wizard', 3, 'd6'), mk('fighter', 1, 'd10')])).toEqual({
      d6: 3, d10: 1,
    });
  });
});

describe('hitDiceTotalCount', () => {
  it('suma de niveles', () => {
    expect(hitDiceTotalCount([mk('wizard', 3, 'd6'), mk('fighter', 2, 'd10')])).toBe(5);
  });
});

describe('hitDiceRecoveredOnLongRest', () => {
  it.each([
    [1, 1],   // floor(1/2)=0 pero mínimo 1
    [2, 1],   // floor(2/2)=1
    [3, 1],   // floor(3/2)=1
    [4, 2],
    [10, 5],
    [20, 10],
  ])('level %i recupera %i hit dice', (level, recovered) => {
    expect(hitDiceRecoveredOnLongRest(level)).toBe(recovered);
  });
});

// ---------------------------------------------------------------------------
// chooseHitDiceRecovery — REQ-RC-CHOICE-RESPECTED + REQ-RC-CHOICE-INVALID
// (sdd/rest-closeout/spec engram #824). PHB p.186.
// ---------------------------------------------------------------------------
describe('chooseHitDiceRecovery — happy path', () => {
  it('C1: valid single-face choice → ok with distribution', () => {
    const r = chooseHitDiceRecovery({ d6: 2 }, 2, { d6: 1 });
    expect(r).toEqual({ ok: true, distribution: { d6: 1 } });
  });

  it('C2: empty choice → ok with empty distribution (caller falls back to greedy)', () => {
    const r = chooseHitDiceRecovery({ d6: 2 }, 2, {});
    expect(r).toEqual({ ok: true, distribution: {} });
  });

  it('C3-TRIANGULATE: multiclass partial-face choice', () => {
    // spent d6:1, d10:2; allowance 2; player picks d10 twice
    const r = chooseHitDiceRecovery({ d6: 1, d10: 2 }, 2, { d10: 2 });
    expect(r).toEqual({ ok: true, distribution: { d10: 2 } });
  });
});

describe('chooseHitDiceRecovery — invalid choice', () => {
  it('C4: over-spent → HIT_DICE_CHOICE_OVER_SPENT', () => {
    const r = chooseHitDiceRecovery({ d6: 1 }, 5, { d6: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({
      code: 'HIT_DICE_CHOICE_OVER_SPENT',
      face: 'd6',
      requested: 2,
      available: 1,
    });
  });

  it('C5: over-allowance → HIT_DICE_CHOICE_OVER_ALLOWANCE', () => {
    // spent d6:2, d10:2; allowance 1; player asks for 2 total
    const r = chooseHitDiceRecovery({ d6: 2, d10: 2 }, 1, { d6: 1, d10: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({
      code: 'HIT_DICE_CHOICE_OVER_ALLOWANCE',
      requested: 2,
      allowance: 1,
    });
  });
});

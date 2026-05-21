import { describe, expect, it } from 'vitest';
import {
  hitDiceTotalsByDie,
  hitDiceTotalCount,
  hitDiceRecoveredOnLongRest,
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

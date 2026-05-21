import { describe, expect, it } from 'vitest';
import {
  cantripsKnownFor,
  spellsKnownFor,
  preparedLimitFor,
  wizardSpellbookSize,
  maxSpellLevelFor,
  computeSpellLimits,
} from '../../../src/character/spellcasting/preparation.js';
import type { AppliedClass } from '../../../src/character/class/types.js';

function mk(slug: string, level: number, subclassSlug: string | null = null): AppliedClass {
  return {
    slug, source: 'PHB', level,
    subclass: subclassSlug ? { slug: subclassSlug, source: 'PHB' } : null,
    hitDie: 'd8', savingThrows: [],
    armorProficiencies: [], weaponProficiencies: [], toolProficiencies: [], skillChoices: [],
  };
}

describe('cantripsKnownFor', () => {
  it.each([
    [mk('wizard', 1), 3],
    [mk('wizard', 4), 4],
    [mk('wizard', 10), 5],
    [mk('cleric', 1), 3],
    [mk('cleric', 10), 5],
    [mk('sorcerer', 1), 4],
    [mk('sorcerer', 10), 6],
    [mk('artificer', 1), 2],
    [mk('artificer', 14), 4],
    [mk('paladin', 5), 0],
    [mk('ranger', 5), 0],
    [mk('fighter', 5), 0],
    [mk('fighter', 3, 'eldritch-knight'), 2],
    [mk('fighter', 10, 'eldritch-knight'), 3],
    [mk('rogue', 3, 'arcane-trickster'), 3],
    [mk('rogue', 10, 'arcane-trickster'), 4],
  ])('correct count', (c, expected) => {
    expect(cantripsKnownFor(c)).toBe(expected);
  });
});

describe('spellsKnownFor', () => {
  it('Bard L1 = 4, L20 = 22', () => {
    expect(spellsKnownFor(mk('bard', 1))).toBe(4);
    expect(spellsKnownFor(mk('bard', 20))).toBe(22);
  });
  it('Sorcerer L20 = 15', () => {
    expect(spellsKnownFor(mk('sorcerer', 20))).toBe(15);
  });
  it('Warlock L1 = 2, L20 = 15', () => {
    expect(spellsKnownFor(mk('warlock', 1))).toBe(2);
    expect(spellsKnownFor(mk('warlock', 20))).toBe(15);
  });
  it('Ranger L1 = 0, L2 = 2', () => {
    expect(spellsKnownFor(mk('ranger', 1))).toBe(0);
    expect(spellsKnownFor(mk('ranger', 2))).toBe(2);
  });
  it('Cleric/Druid/Paladin/Artificer → null (preparan de lista)', () => {
    expect(spellsKnownFor(mk('cleric', 5))).toBeNull();
    expect(spellsKnownFor(mk('druid', 5))).toBeNull();
    expect(spellsKnownFor(mk('paladin', 5))).toBeNull();
    expect(spellsKnownFor(mk('artificer', 5))).toBeNull();
  });
  it('Wizard → null (usa spellbook, ver wizardSpellbookSize)', () => {
    expect(spellsKnownFor(mk('wizard', 5))).toBeNull();
  });
  it('EK L3 = 3, L20 = 13', () => {
    expect(spellsKnownFor(mk('fighter', 3, 'eldritch-knight'))).toBe(3);
    expect(spellsKnownFor(mk('fighter', 20, 'eldritch-knight'))).toBe(13);
  });
  it('Fighter sin EK → 0', () => {
    expect(spellsKnownFor(mk('fighter', 10))).toBe(0);
  });
});

describe('preparedLimitFor', () => {
  it('Wizard L5 INT mod 4 → 9 prepared', () => {
    expect(preparedLimitFor(mk('wizard', 5), 4)).toBe(9);
  });
  it('Cleric L1 WIS 3 → 4', () => {
    expect(preparedLimitFor(mk('cleric', 1), 3)).toBe(4);
  });
  it('Paladin L1 → 0 (slots aparecen L2)', () => {
    expect(preparedLimitFor(mk('paladin', 1), 3)).toBe(0);
  });
  it('Paladin L4 CHA 2 → CHA + floor(4/2) = 4', () => {
    expect(preparedLimitFor(mk('paladin', 4), 2)).toBe(4);
  });
  it('Artificer L3 INT 2 → INT + ceil(3/2) = 4', () => {
    expect(preparedLimitFor(mk('artificer', 3), 2)).toBe(4);
  });
  it('Mín 1: Wizard L1 con INT mod 0 → 1', () => {
    expect(preparedLimitFor(mk('wizard', 1), 0)).toBe(1);
  });
  it('Mín 1: Wizard L1 con INT mod NEG → 1', () => {
    expect(preparedLimitFor(mk('wizard', 1), -2)).toBe(1);
  });
  it('Clases known no preparan → null', () => {
    expect(preparedLimitFor(mk('sorcerer', 5), 4)).toBeNull();
    expect(preparedLimitFor(mk('bard', 5), 4)).toBeNull();
    expect(preparedLimitFor(mk('warlock', 5), 4)).toBeNull();
    expect(preparedLimitFor(mk('ranger', 5), 4)).toBeNull();
  });
});

describe('wizardSpellbookSize', () => {
  it('L1 = 6', () => expect(wizardSpellbookSize(1)).toBe(6));
  it('L2 = 8 (+2 por level up)', () => expect(wizardSpellbookSize(2)).toBe(8));
  it('L10 = 24', () => expect(wizardSpellbookSize(10)).toBe(24));
  it('L20 = 44', () => expect(wizardSpellbookSize(20)).toBe(44));
});

describe('maxSpellLevelFor', () => {
  it.each([
    [mk('wizard', 1), 1],
    [mk('wizard', 5), 3],
    [mk('wizard', 17), 9],
    [mk('paladin', 1), 0],
    [mk('paladin', 5), 2],
    [mk('paladin', 17), 5],
    [mk('artificer', 1), 1],
    [mk('artificer', 17), 5],
    [mk('warlock', 5), 3],
    [mk('warlock', 9), 5],
    [mk('fighter', 3, 'eldritch-knight'), 1],
    [mk('fighter', 19, 'eldritch-knight'), 4],
    [mk('barbarian', 20), 0],
  ])('max level OK', (c, expected) => {
    expect(maxSpellLevelFor(c)).toBe(expected);
  });
});

describe('computeSpellLimits — agrega ability + spellbookSize', () => {
  it('Wizard L1 INT 3 → spellbookSize=6, prep=4, ability=int', () => {
    const v = computeSpellLimits(mk('wizard', 1), 3);
    expect(v.wizardSpellbookSize).toBe(6);
    expect(v.spellsPrepared).toBe(4);
    expect(v.ability).toBe('int');
    expect(v.cantripsKnown).toBe(3);
  });
  it('Sorcerer L5 → spellsKnown=6, prepared=null', () => {
    const v = computeSpellLimits(mk('sorcerer', 5), 3);
    expect(v.spellsKnown).toBe(6);
    expect(v.spellsPrepared).toBeNull();
    expect(v.ability).toBe('cha');
  });
});

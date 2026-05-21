import { describe, expect, it } from 'vitest';
import {
  computeCharacterSheet,
  proficiencyBonus,
} from '../../../src/character/sheet/compute.js';
import type {
  CharacterSnapshot,
  RaceSheetData,
} from '../../../src/character/sheet/types.js';

describe('proficiencyBonus por nivel total', () => {
  it.each([
    [1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4],
    [13, 5], [16, 5], [17, 6], [20, 6],
  ])('level %i → PB +%i', (level, expected) => {
    expect(proficiencyBonus(level)).toBe(expected);
  });
});

// Personaje de prueba: High Elf Wizard 1 con stats point-buy 27 + Sage background.
const HIGH_ELF_WIZARD: CharacterSnapshot = {
  name: 'Aldric Vane',
  baseStats: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
  asisApplied: [
    { ability: 'dex', bonus: 2, source: 'race' },
    { ability: 'int', bonus: 1, source: 'subrace' },
  ],
  race: { slug: 'elf', source: 'PHB' },
  subrace: { slug: 'elf--high', source: 'PHB' },
  classes: [
    {
      slug: 'wizard',
      source: 'PHB',
      level: 1,
      subclass: null,
      hitDie: 'd6',
      savingThrows: ['int', 'wis'],
      armorProficiencies: [],
      weaponProficiencies: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
      toolProficiencies: [],
      skillChoices: ['arcana', 'investigation'],
    },
  ],
  background: {
    slug: 'sage',
    source: 'PHB',
    skills: ['arcana', 'history'],
    languages: ['draconic', 'elvish'],
    tools: [],
  },
  feats: [],
};

const ELF_RACE_DATA: RaceSheetData = {
  speed: 30,
  size: ['M'],
  languageProficiencies: [{ common: true, elvish: true }],
};

describe('computeCharacterSheet — High Elf Wizard 1', () => {
  const sheet = computeCharacterSheet({
    character: HIGH_ELF_WIZARD,
    raceData: ELF_RACE_DATA,
  });

  it('total level y proficiency bonus', () => {
    expect(sheet.identity.totalLevel).toBe(1);
    expect(sheet.proficiencyBonus).toBe(2);
  });

  it('ability scores con ASIs aplicados', () => {
    // base 14 dex + 2 race = 16
    expect(sheet.abilityScores.dex.score).toBe(16);
    expect(sheet.abilityScores.dex.modifier).toBe(3);
    // base 15 int + 1 subrace = 16
    expect(sheet.abilityScores.int.score).toBe(16);
    expect(sheet.abilityScores.int.modifier).toBe(3);
    // unchanged
    expect(sheet.abilityScores.str.score).toBe(8);
    expect(sheet.abilityScores.str.modifier).toBe(-1);
  });

  it('saves: INT y WIS proficient con +PB', () => {
    const intSave = sheet.savingThrows.find((s) => s.ability === 'int')!;
    expect(intSave.proficient).toBe(true);
    expect(intSave.modifier).toBe(3 + 2); // mod + pb
    const strSave = sheet.savingThrows.find((s) => s.ability === 'str')!;
    expect(strSave.proficient).toBe(false);
    expect(strSave.modifier).toBe(-1);
  });

  it('skills: arcana proficient (class + background), history proficient (background)', () => {
    const arcana = sheet.skills.find((s) => s.name === 'arcana')!;
    expect(arcana.proficient).toBe(true);
    expect(arcana.modifier).toBe(3 + 2); // INT mod + PB
    const history = sheet.skills.find((s) => s.name === 'history')!;
    expect(history.proficient).toBe(true);
    const athletics = sheet.skills.find((s) => s.name === 'athletics')!;
    expect(athletics.proficient).toBe(false);
    expect(athletics.modifier).toBe(-1); // STR mod
  });

  it('AC: unarmored 10 + DEX(3) = 13', () => {
    expect(sheet.armorClass.value).toBe(13);
    expect(sheet.armorClass.formula).toContain('DEX(3)');
  });

  it('HP: max d6 (6) + CON(2) = 8 al nivel 1', () => {
    expect(sheet.hitPoints.max).toBe(8);
  });

  it('initiative = DEX mod', () => {
    expect(sheet.initiative).toBe(3);
  });

  it('passive perception = 10 + WIS mod (sin profic) = 11', () => {
    expect(sheet.passivePerception).toBe(11);
  });

  it('carrying capacity = STR × 15', () => {
    expect(sheet.carryingCapacity).toBe(8 * 15);
  });

  it('spellcasting: Wizard con INT', () => {
    expect(sheet.spellcasting).toHaveLength(1);
    const sc = sheet.spellcasting[0]!;
    expect(sc.classSlug).toBe('wizard');
    expect(sc.ability).toBe('int');
    expect(sc.saveDC).toBe(8 + 2 + 3); // 8 + PB + INT mod = 13
    expect(sc.attackBonus).toBe(2 + 3); // PB + INT mod = 5
  });

  it('hit dice: d6 → 1', () => {
    expect(sheet.hitDice.d6).toBe(1);
  });

  it('languages: race + background', () => {
    expect(sheet.proficiencies.languages).toEqual(
      expect.arrayContaining(['common', 'elvish', 'draconic']),
    );
  });

  it('speed walk = 30 desde raceData', () => {
    expect(sheet.speed.walk).toBe(30);
  });
});

describe('computeCharacterSheet — Barbarian Unarmored Defense', () => {
  const BARB: CharacterSnapshot = {
    name: 'Grok',
    baseStats: { str: 15, dex: 14, con: 16, int: 8, wis: 10, cha: 8 },
    asisApplied: [],
    classes: [
      {
        slug: 'barbarian',
        source: 'PHB',
        level: 1,
        subclass: null,
        hitDie: 'd12',
        savingThrows: ['str', 'con'],
        armorProficiencies: ['light', 'medium', 'shield'],
        weaponProficiencies: ['simple', 'martial'],
        toolProficiencies: [],
        skillChoices: ['athletics', 'intimidation'],
      },
    ],
    feats: [],
  };

  const sheet = computeCharacterSheet({ character: BARB });

  it('AC Unarmored Defense = 10 + DEX(2) + CON(3) = 15', () => {
    expect(sheet.armorClass.value).toBe(15);
    expect(sheet.armorClass.formula).toContain('Barbarian Unarmored Defense');
  });

  it('HP: d12 max (12) + CON(3) = 15', () => {
    expect(sheet.hitPoints.max).toBe(15);
  });
});

describe('computeCharacterSheet — multiclass HP y saves', () => {
  const WIZ_FIGHTER: CharacterSnapshot = {
    name: 'Multi',
    baseStats: { str: 14, dex: 13, con: 14, int: 15, wis: 10, cha: 8 },
    classes: [
      {
        slug: 'wizard', source: 'PHB', level: 3, subclass: null, hitDie: 'd6',
        savingThrows: ['int', 'wis'],
        armorProficiencies: [], weaponProficiencies: [], toolProficiencies: [],
        skillChoices: ['arcana', 'investigation'],
      },
      {
        // Multiclass — no da saves
        slug: 'fighter', source: 'PHB', level: 1, subclass: null, hitDie: 'd10',
        savingThrows: [], // ← multiclass reduced
        armorProficiencies: ['light', 'medium', 'shield'],
        weaponProficiencies: ['simple', 'martial'],
        toolProficiencies: [],
        skillChoices: [],
      },
    ],
    feats: [],
  };

  const sheet = computeCharacterSheet({ character: WIZ_FIGHTER });

  it('totalLevel = 4, PB = 2', () => {
    expect(sheet.identity.totalLevel).toBe(4);
    expect(sheet.proficiencyBonus).toBe(2);
  });

  it('saves de Wizard (clase 1ª) presentes, los de Fighter (multiclass) ausentes', () => {
    expect(sheet.savingThrows.find((s) => s.ability === 'int')?.proficient).toBe(true);
    expect(sheet.savingThrows.find((s) => s.ability === 'wis')?.proficient).toBe(true);
    expect(sheet.savingThrows.find((s) => s.ability === 'str')?.proficient).toBe(false);
    expect(sheet.savingThrows.find((s) => s.ability === 'con')?.proficient).toBe(false);
  });

  it('HP: 6 + CON(2) [Wiz L1] + 2×(4+2) [Wiz L2-3] + 1×(6+2) [Fighter L1] = 28', () => {
    // 6+2 = 8 (L1 max wizard)
    // 2 × (4+2) = 12 (avg wizard L2, L3)
    // 1 × (6+2) = 8 (fighter mc L1 avg)
    // Total 28
    expect(sheet.hitPoints.max).toBe(28);
  });

  it('hit dice: d6 × 3 + d10 × 1', () => {
    expect(sheet.hitDice.d6).toBe(3);
    expect(sheet.hitDice.d10).toBe(1);
  });
});

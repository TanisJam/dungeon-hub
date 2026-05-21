import { describe, expect, it } from 'vitest';
import {
  validateClassSelection,
  computeSubclassUnlockLevel,
} from '../../../src/character/class/validate.js';
import type {
  ClassCompendiumData,
  SubclassCompendiumData,
} from '../../../src/character/class/types.js';
import { DEFAULT_RULES_PROFILE } from '../../../src/rules-profile/default.js';

// ---- Fixtures -------------------------------------------------------------
const WIZARD: ClassCompendiumData = {
  slug: 'wizard',
  source: 'PHB',
  hd: { number: 1, faces: 6 },
  proficiency: ['int', 'wis'],
  startingProficiencies: {
    armor: null,
    weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow'],
    skills: [
      {
        choose: {
          from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
          count: 2,
        },
      },
    ],
  },
  subclassTitle: 'Arcane Tradition',
  classFeatures: [
    'Arcane Recovery|Wizard||1',
    'Spellcasting|Wizard||1',
    'Arcane Tradition|Wizard||2',
    'Ability Score Improvement|Wizard||4',
  ],
};

const CLERIC: ClassCompendiumData = {
  slug: 'cleric',
  source: 'PHB',
  hd: { number: 1, faces: 8 },
  proficiency: ['wis', 'cha'],
  startingProficiencies: {
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple'],
    skills: [
      { choose: { from: ['history', 'insight', 'medicine', 'persuasion', 'religion'], count: 2 } },
    ],
  },
  subclassTitle: 'Divine Domain',
  classFeatures: ['Spellcasting|Cleric||1', 'Divine Domain|Cleric||1', 'Channel Divinity|Cleric||2'],
};

const BARBARIAN: ClassCompendiumData = {
  slug: 'barbarian',
  source: 'PHB',
  hd: { number: 1, faces: 12 },
  proficiency: ['str', 'con'],
  startingProficiencies: {
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
    skills: [
      {
        choose: {
          from: ['animal handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
          count: 2,
        },
      },
    ],
  },
  subclassTitle: 'Primal Path',
  classFeatures: [
    'Rage|Barbarian||1',
    'Unarmored Defense|Barbarian||1',
    'Danger Sense|Barbarian||2',
    'Primal Path|Barbarian||3',
  ],
};

const EVOKER_SUBCLASS: SubclassCompendiumData = {
  slug: 'wizard--evoker',
  source: 'PHB',
  classSlug: 'wizard',
  classSource: 'PHB',
  name: 'School of Evocation',
};

const LIFE_DOMAIN: SubclassCompendiumData = {
  slug: 'cleric--life',
  source: 'PHB',
  classSlug: 'cleric',
  classSource: 'PHB',
  name: 'Life Domain',
};

// ---- Tests ----------------------------------------------------------------
describe('computeSubclassUnlockLevel', () => {
  it.each([
    [WIZARD, 2],
    [CLERIC, 1],
    [BARBARIAN, 3],
  ])('detecta el unlock level desde classFeatures (%#)', (cls, expected) => {
    expect(computeSubclassUnlockLevel(cls)).toBe(expected);
  });

  it('devuelve null si no hay subclassTitle', () => {
    const noTitle: ClassCompendiumData = { ...WIZARD, subclassTitle: null };
    expect(computeSubclassUnlockLevel(noTitle)).toBeNull();
  });
});

describe('validateClassSelection — happy path', () => {
  it('acepta Wizard nivel 1 con 2 skills válidos y sin subclass', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      level: 1,
      skillChoices: ['arcana', 'investigation'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedClass.hitDie).toBe('d6');
    expect(res.appliedClass.savingThrows).toEqual(['int', 'wis']);
    expect(res.appliedClass.skillChoices).toEqual(['arcana', 'investigation']);
    expect(res.appliedClass.subclass).toBeNull();
  });

  it('acepta Cleric nivel 1 con subclass (porque unlock = 1)', () => {
    const res = validateClassSelection({
      classData: CLERIC,
      subclassData: LIFE_DOMAIN,
      level: 1,
      skillChoices: ['insight', 'medicine'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedClass.subclass).toEqual({ slug: 'cleric--life', source: 'PHB' });
  });

  it('acepta Wizard nivel 5 con subclass (Evoker)', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      subclassData: EVOKER_SUBCLASS,
      level: 5,
      skillChoices: ['arcana', 'history'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(true);
  });
});

describe('validateClassSelection — subclass gating', () => {
  it('rechaza Wizard nivel 1 con subclass (no desbloqueada todavía)', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      subclassData: EVOKER_SUBCLASS,
      level: 1,
      skillChoices: ['arcana', 'investigation'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('SUBCLASS_NOT_YET_AVAILABLE');
  });

  it('rechaza Cleric nivel 1 sin subclass (es requerida ya)', () => {
    const res = validateClassSelection({
      classData: CLERIC,
      level: 1,
      skillChoices: ['insight', 'medicine'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('SUBCLASS_REQUIRED');
  });

  it('rechaza subclass que no pertenece a la clase', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      subclassData: LIFE_DOMAIN, // cleric subclass
      level: 5,
      skillChoices: ['arcana', 'investigation'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('SUBCLASS_DOES_NOT_BELONG_TO_CLASS');
  });
});

describe('validateClassSelection — skill choices', () => {
  it('rechaza skill que no está en la lista de la clase', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      level: 1,
      skillChoices: ['arcana', 'athletics'], // Wizard no tiene athletics
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'SKILL_NOT_IN_CLASS_LIST')).toBe(true);
  });

  it('rechaza cantidad de skills incorrecta', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      level: 1,
      skillChoices: ['arcana'], // se esperan 2
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('SKILL_CHOICES_REQUIRED');
  });

  it('rechaza duplicados en skill choices', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      level: 1,
      skillChoices: ['arcana', 'arcana'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'SKILL_DUPLICATE')).toBe(true);
  });
});

describe('validateClassSelection — source gating', () => {
  it('rechaza clase cuya source está deshabilitada', () => {
    const profile = {
      ...DEFAULT_RULES_PROFILE,
      sources: { ...DEFAULT_RULES_PROFILE.sources, PHB: false },
    };
    const res = validateClassSelection({
      classData: WIZARD,
      level: 1,
      skillChoices: ['arcana', 'investigation'],
      rulesProfile: profile,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('CLASS_DISABLED');
  });

  it('rechaza level fuera de [1, 20]', () => {
    const res = validateClassSelection({
      classData: WIZARD,
      level: 21,
      skillChoices: ['arcana', 'investigation'],
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('LEVEL_OUT_OF_RANGE');
  });
});

import { describe, expect, it } from 'vitest';
import { isAsiLevelFor } from '../../../src/character/level-up/asi-levels.js';
import type { ClassCompendiumData } from '../../../src/character/class/types.js';

// Fixtures — minimal classFeatures with ASI entries only (enough for deriveAsiLevels).
// PHB citations:
//   Fighter — PHB p.72: ASI at 4, 6, 8, 12, 14, 16, 19
//   Rogue   — PHB p.96: ASI at 4, 8, 10, 12, 16, 19
//   Wizard  — PHB p.112: ASI at 4, 8, 12, 16, 19 (standard cadence)

const FIGHTER_DATA: ClassCompendiumData = {
  slug: 'fighter',
  source: 'PHB',
  hd: { number: 1, faces: 10 },
  proficiency: ['str', 'con'],
  startingProficiencies: {},
  subclassTitle: 'Martial Archetype',
  classFeatures: [
    'Ability Score Improvement|Fighter||4',
    'Ability Score Improvement|Fighter||6',
    'Ability Score Improvement|Fighter||8',
    'Ability Score Improvement|Fighter||12',
    'Ability Score Improvement|Fighter||14',
    'Ability Score Improvement|Fighter||16',
    'Ability Score Improvement|Fighter||19',
  ],
};

const ROGUE_DATA: ClassCompendiumData = {
  slug: 'rogue',
  source: 'PHB',
  hd: { number: 1, faces: 8 },
  proficiency: ['dex', 'int'],
  startingProficiencies: {},
  subclassTitle: 'Roguish Archetype',
  classFeatures: [
    'Ability Score Improvement|Rogue||4',
    'Ability Score Improvement|Rogue||8',
    'Ability Score Improvement|Rogue||10',
    'Ability Score Improvement|Rogue||12',
    'Ability Score Improvement|Rogue||16',
    'Ability Score Improvement|Rogue||19',
  ],
};

const WIZARD_DATA: ClassCompendiumData = {
  slug: 'wizard',
  source: 'PHB',
  hd: { number: 1, faces: 6 },
  proficiency: ['int', 'wis'],
  startingProficiencies: {},
  subclassTitle: 'Arcane Tradition',
  classFeatures: [
    'Ability Score Improvement|Wizard||4',
    'Ability Score Improvement|Wizard||8',
    'Ability Score Improvement|Wizard||12',
    'Ability Score Improvement|Wizard||16',
    'Ability Score Improvement|Wizard||19',
  ],
};

describe('isAsiLevelFor', () => {
  it('WRAP-1: Fighter — ASI levels 4, 6, 8, 12, 14 son verdaderos (PHB p.72)', () => {
    expect(isAsiLevelFor(FIGHTER_DATA, 4)).toBe(true);
    expect(isAsiLevelFor(FIGHTER_DATA, 6)).toBe(true);
    expect(isAsiLevelFor(FIGHTER_DATA, 8)).toBe(true);
    expect(isAsiLevelFor(FIGHTER_DATA, 12)).toBe(true);
    expect(isAsiLevelFor(FIGHTER_DATA, 14)).toBe(true);
  });

  it('WRAP-2: Fighter — L3, L5, L13 NO son ASI levels', () => {
    expect(isAsiLevelFor(FIGHTER_DATA, 3)).toBe(false);
    expect(isAsiLevelFor(FIGHTER_DATA, 5)).toBe(false);
    expect(isAsiLevelFor(FIGHTER_DATA, 13)).toBe(false);
  });

  it('WRAP-3: Rogue — L10 ES ASI level (PHB p.96), L9 NO', () => {
    expect(isAsiLevelFor(ROGUE_DATA, 10)).toBe(true);
    expect(isAsiLevelFor(ROGUE_DATA, 9)).toBe(false);
  });

  it('WRAP-4: Wizard — L4 y L8 son ASI, L6 NO (standard cadence)', () => {
    expect(isAsiLevelFor(WIZARD_DATA, 4)).toBe(true);
    expect(isAsiLevelFor(WIZARD_DATA, 8)).toBe(true);
    expect(isAsiLevelFor(WIZARD_DATA, 6)).toBe(false);
  });
});

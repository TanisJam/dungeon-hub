import { describe, expect, it } from 'vitest';
import { deriveAsiLevels } from '../../../src/character/class/asi-levels.js';

// Fixtures built from `data/5etools/data/class/class-*.json` (PHB source).
// PHB citations:
//   Fighter — PHB p.72: ASI at 4, 6, 8, 12, 14, 16, 19
//   Rogue   — PHB p.96: ASI at 4, 8, 10, 12, 16, 19
//   Wizard  — PHB p.112: ASI at 4, 8, 12, 16, 19 (standard cadence)

// ---- Fixtures ---------------------------------------------------------------

const FIGHTER_CLASS_FEATURES: string[] = [
  'Fighting Style|Fighter||1',
  'Second Wind|Fighter||1',
  'Action Surge|Fighter||2',
  'Martial Archetype|Fighter||3',
  'Ability Score Improvement|Fighter||4',
  'Extra Attack|Fighter||5',
  'Ability Score Improvement|Fighter||6',
  'Ability Score Improvement|Fighter||8',
  'Indomitable|Fighter||9',
  'Ability Score Improvement|Fighter||12',
  'Ability Score Improvement|Fighter||14',
  'Ability Score Improvement|Fighter||16',
  'Ability Score Improvement|Fighter||19',
];

const ROGUE_CLASS_FEATURES: string[] = [
  'Expertise|Rogue||1',
  'Sneak Attack|Rogue||1',
  'Thieves Cant|Rogue||1',
  'Cunning Action|Rogue||2',
  'Roguish Archetype|Rogue||3',
  'Ability Score Improvement|Rogue||4',
  'Uncanny Dodge|Rogue||5',
  'Expertise|Rogue||6',
  'Evasion|Rogue||7',
  'Ability Score Improvement|Rogue||8',
  'Roguish Archetype feature|Rogue||9',
  'Ability Score Improvement|Rogue||10',
  'Reliable Talent|Rogue||11',
  'Ability Score Improvement|Rogue||12',
  'Blindsense|Rogue||14',
  'Slippery Mind|Rogue||15',
  'Ability Score Improvement|Rogue||16',
  'Elusive|Rogue||18',
  'Ability Score Improvement|Rogue||19',
  'Stroke of Luck|Rogue||20',
];

const WIZARD_CLASS_FEATURES: string[] = [
  'Spellcasting|Wizard||1',
  'Arcane Recovery|Wizard||1',
  'Arcane Tradition|Wizard||2',
  'Ability Score Improvement|Wizard||4',
  'Ability Score Improvement|Wizard||8',
  'Ability Score Improvement|Wizard||12',
  'Ability Score Improvement|Wizard||16',
  'Ability Score Improvement|Wizard||19',
  'Spell Mastery|Wizard||18',
  'Signature Spells|Wizard||20',
];

// Fixture with duplicate ASI entries (e.g. TCE-suffixed variant at same level)
// CL01-S8 — PHB Fighter L6 appears twice (once bare, once with extra suffix)
const CLASS_FEATURES_WITH_DUPLICATES: string[] = [
  'Ability Score Improvement|Fighter||4',
  'Ability Score Improvement|Fighter||6',
  'Ability Score Improvement|Fighter||6|TCE',
  'Ability Score Improvement|Fighter||8',
];

// ---- Tests ------------------------------------------------------------------

describe('deriveAsiLevels', () => {
  it('A-RED-1: Fighter classFeatures → [4, 6, 8, 12, 14, 16, 19] (PHB p.72)', () => {
    // PHB p.72 — Fighter: 7 ASI opportunities (vs. 5 for standard classes)
    expect(deriveAsiLevels(FIGHTER_CLASS_FEATURES)).toEqual([4, 6, 8, 12, 14, 16, 19]);
  });

  it('A-RED-2: Rogue classFeatures → [4, 8, 10, 12, 16, 19] (PHB p.96)', () => {
    // PHB p.96 — Rogue: 6 ASI opportunities (has L10, missing from standard)
    expect(deriveAsiLevels(ROGUE_CLASS_FEATURES)).toEqual([4, 8, 10, 12, 16, 19]);
  });

  it('A-RED-3: Wizard classFeatures → [4, 8, 12, 16, 19] (standard cadence, PHB p.112)', () => {
    // PHB p.112 — Wizard: standard 5-ASI cadence shared by most classes
    expect(deriveAsiLevels(WIZARD_CLASS_FEATURES)).toEqual([4, 8, 12, 16, 19]);
  });

  it('A-RED-4: empty classFeatures → fallback [4, 8, 12, 16, 19]', () => {
    // CL01-S7 — defensive default for missing/empty classFeatures data
    expect(deriveAsiLevels([])).toEqual([4, 8, 12, 16, 19]);
  });

  it('A-RED-5: duplicate ASI entries at same level → deduped in output', () => {
    // CL01-S8 — TCE-suffixed entries must not produce duplicate levels
    expect(deriveAsiLevels(CLASS_FEATURES_WITH_DUPLICATES)).toEqual([4, 6, 8]);
  });
});

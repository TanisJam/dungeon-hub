import type { AbilityKey, AbilityScores } from '../stats/types.js';
import type { AppliedClass } from '../class/types.js';
import type { AppliedFeat } from '../feat/types.js';
import type { AppliedBackground } from '../background/types.js';
import type { AppliedAsi } from '../race/types.js';

/** Mapeo standard skill → ability (PHB p.174). */
export const SKILL_TO_ABILITY: Readonly<Record<string, AbilityKey>> = Object.freeze({
  acrobatics: 'dex',
  'animal handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight of hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
});

export const ALL_SKILLS = Object.keys(SKILL_TO_ABILITY).sort();

/**
 * Estado del personaje que necesita el sheet calculator. Es el shape
 * persistido en `characters.data` (parcial) más data del compendio para race.
 */
export interface CharacterSnapshot {
  name: string;
  baseStats?: AbilityScores;
  asisApplied?: AppliedAsi[];
  classes?: AppliedClass[];
  background?: AppliedBackground | null;
  feats?: AppliedFeat[];
  race?: { slug: string; source: string } | null;
  subrace?: { slug: string; source: string } | null;
}

/**
 * Data de la raza relevante para el sheet (subset del compendio).
 * Lo extrae el caller; el domain validator no toca DB.
 */
export interface RaceSheetData {
  /** En 5etools: number (walk only) o object `{ walk, fly, swim, climb }`. */
  speed?: number | Record<string, number>;
  size?: string[];
  /** "Standard" languages otorgados por la raza, ej: ['common', 'elvish']. */
  languageProficiencies?: Array<Record<string, boolean | number>>;
}

export interface AbilityScoreView {
  score: number;
  modifier: number;
}

export interface SavingThrowView {
  ability: AbilityKey;
  modifier: number;
  proficient: boolean;
}

export interface SkillView {
  name: string;
  ability: AbilityKey;
  modifier: number;
  proficient: boolean;
  expertise: boolean;
}

export interface SpellcastingView {
  classSlug: string;
  classSource: string;
  ability: AbilityKey;
  saveDC: number;
  attackBonus: number;
}

export interface CharacterSheet {
  identity: {
    name: string;
    totalLevel: number;
    classes: Array<{
      slug: string;
      source: string;
      level: number;
      hitDie: string;
      subclass: { slug: string; source: string } | null;
    }>;
    race: { slug: string; source: string } | null;
    subrace: { slug: string; source: string } | null;
    background: { slug: string; source: string } | null;
  };
  proficiencyBonus: number;
  abilityScores: Record<AbilityKey, AbilityScoreView>;
  savingThrows: SavingThrowView[];
  skills: SkillView[];
  passivePerception: number;
  initiative: number;
  armorClass: {
    value: number;
    formula: string;
  };
  hitPoints: {
    max: number;
    formula: string;
  };
  hitDice: Record<string, number>; // 'd6' → total
  speed: { walk: number; fly?: number; swim?: number; climb?: number };
  size: string;
  carryingCapacity: number;
  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
    languages: string[];
  };
  feats: Array<{ slug: string; source: string }>;
  spellcasting: SpellcastingView[];
}

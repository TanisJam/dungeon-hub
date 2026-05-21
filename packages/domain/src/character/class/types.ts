import type { AbilityKey } from '../stats/types.js';

/**
 * Forma 5etools de las skill choices de una clase:
 *   startingProficiencies.skills = [{ choose: { from: [...], count: 2 } }]
 *
 * Algunas clases (raro) tienen entradas fijas (sin `choose`). Las soportamos
 * tratándolas como "skills siempre dadas".
 */
export interface ClassSkillSpec {
  choose?: { from: string[]; count: number };
  /** Skills "fijas" otorgadas por la clase (no a elegir). */
  fixed?: string[];
}

export interface ClassCompendiumData {
  slug: string;
  source: string;
  hd: { number: number; faces: number };
  proficiency: AbilityKey[]; // saving throws
  startingProficiencies: {
    armor?: string[] | null;
    weapons?: string[] | null;
    tools?: string[] | null;
    skills?: Array<{ choose?: { from: string[]; count: number } } | Record<string, unknown>>;
  };
  subclassTitle?: string | null;
  classFeatures: Array<string | { classFeature: string }>;
}

export interface SubclassCompendiumData {
  slug: string;
  source: string;
  classSlug: string;
  classSource: string;
  name: string;
}

export type ClassValidationIssue =
  | { code: 'CLASS_NOT_FOUND'; class: { slug: string; source: string } }
  | { code: 'CLASS_DISABLED'; class: { slug: string; source: string } }
  | { code: 'LEVEL_OUT_OF_RANGE'; level: number; min: number; max: number }
  | { code: 'SUBCLASS_NOT_FOUND'; subclass: { slug: string; source: string } }
  | { code: 'SUBCLASS_DISABLED'; subclass: { slug: string; source: string } }
  | {
      code: 'SUBCLASS_DOES_NOT_BELONG_TO_CLASS';
      classSlug: string;
      classSource: string;
      subclassClassSlug: string;
      subclassClassSource: string;
    }
  | {
      code: 'SUBCLASS_REQUIRED';
      classSlug: string;
      level: number;
      unlockLevel: number;
    }
  | {
      code: 'SUBCLASS_NOT_YET_AVAILABLE';
      classSlug: string;
      level: number;
      unlockLevel: number;
    }
  | {
      code: 'SKILL_CHOICES_REQUIRED';
      classSlug: string;
      expectedCount: number;
      gotCount: number;
    }
  | { code: 'SKILL_NOT_IN_CLASS_LIST'; classSlug: string; skill: string; allowed: string[] }
  | { code: 'SKILL_DUPLICATE'; skill: string };

export interface AppliedClass {
  slug: string;
  source: string;
  level: number;
  subclass: { slug: string; source: string } | null;
  hitDie: string; // 'd6' | 'd8' | 'd10' | 'd12'
  savingThrows: AbilityKey[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: string[];
}

export type ClassValidationResult =
  | { ok: true; appliedClass: AppliedClass }
  | { ok: false; issues: ClassValidationIssue[] };

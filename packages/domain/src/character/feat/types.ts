import type { AbilityKey } from '../stats/types.js';

/**
 * Shape de `prerequisite` en 5etools (array de bloques OR entre sí; los keys
 * dentro de un block son AND).
 *
 *   - ability:        [{int: 13}, {wis: 13}]   → int 13 OR wis 13 (porque arr inner = OR)
 *   - ability:        [{int: 13, wis: 13}]     → int 13 AND wis 13 (mismo objeto = AND)
 *   - proficiency:    [{armor: "medium"}]
 *   - race:           [{name: "dwarf"}, {name: "small race", displayEntry: "a Small race"}]
 *   - spellcasting:   true
 *   - spellcasting2020: true                   → 2024 rule, lo ignoramos
 */
export interface FeatPrereqBlock {
  ability?: Array<Partial<Record<AbilityKey, number>>>;
  proficiency?: Array<{ armor?: string; weapon?: string; tool?: string }>;
  race?: Array<{ name: string; displayEntry?: string }>;
  spellcasting?: boolean;
  spellcasting2020?: boolean;
  // Otras keys que aparecen rara vez quedan ignoradas.
  [k: string]: unknown;
}

/**
 * Shape del campo `ability` de un feat (la ASI que otorga al elegirse).
 *   - { str: 1 }                                          → fijo +1 STR
 *   - { choose: { from: [...], amount: 1 } }              → user elige stat
 *   - { choose: { from: [...], amount: 2 } }              → distribuir 2 puntos
 */
export interface FeatAbilityBlock {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  choose?: { from: string[]; amount?: number };
}

export interface FeatCompendiumData {
  slug: string;
  source: string;
  name: string;
  prerequisite?: FeatPrereqBlock[] | null;
  ability?: FeatAbilityBlock[] | null;
}

/** Snapshot del estado del personaje relevante para validar prereqs. */
export interface CharacterFeatContext {
  /** Ability scores efectivos (base + ASIs raciales + ASIs de feats anteriores). */
  effectiveScores: Record<AbilityKey, number>;
  /** Race slug + name del personaje. */
  race: { slug: string; name?: string } | null;
  /** Lista de armor proficiencies acumuladas (de clase + multiclass). */
  armorProficiencies: string[];
  /** Lista de weapon proficiencies acumuladas. */
  weaponProficiencies: string[];
  /** Si tiene alguna clase con spellcasting. */
  hasSpellcasting: boolean;
  /** Feats ya tomados (para evitar duplicados). */
  existingFeats: Array<{ slug: string; source: string }>;
}

export type FeatValidationIssue =
  | { code: 'FEATS_DISABLED_BY_CAMPAIGN' }
  | { code: 'FEAT_NOT_FOUND'; feat: { slug: string; source: string } }
  | { code: 'FEAT_DISABLED'; feat: { slug: string; source: string } }
  | {
      code: 'FEAT_ALREADY_TAKEN';
      feat: { slug: string; source: string };
    }
  | {
      code: 'PREREQ_ABILITY_NOT_MET';
      required: Array<Partial<Record<AbilityKey, number>>>;
      got: Record<AbilityKey, number>;
    }
  | {
      code: 'PREREQ_PROFICIENCY_NOT_MET';
      required: Array<{ armor?: string; weapon?: string; tool?: string }>;
      hint: string;
    }
  | {
      code: 'PREREQ_RACE_NOT_MET';
      required: string[];
      gotRace: string | null;
    }
  | {
      code: 'PREREQ_SPELLCASTING_NOT_MET';
    }
  | {
      code: 'FEAT_ASI_REQUIRED';
      hint: string;
    }
  | {
      code: 'FEAT_ASI_INVALID';
      expectedAmount: number;
      gotAmount: number;
      from?: string[];
    }
  | { code: 'FEAT_ASI_UNKNOWN_ABILITY'; ability: string };

export interface AppliedFeat {
  slug: string;
  source: string;
  /** ASIs aplicados por este feat. Array vacío si el feat no otorga ASI. */
  asisApplied: Array<{ ability: AbilityKey; bonus: number }>;
}

export type FeatValidationResult =
  | { ok: true; appliedFeat: AppliedFeat }
  | { ok: false; issues: FeatValidationIssue[] };

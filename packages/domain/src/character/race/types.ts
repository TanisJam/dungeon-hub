import type { AbilityKey } from '../stats/types.js';
import type { FeatValidationIssue, AppliedFeat } from '../feat/types.js';

/**
 * Breath weapon shape variants for Dragonborn draconic ancestry.
 * PHB p.34 — Draconic Ancestry table.
 */
export type BreathWeaponShape = 'line' | 'cone';

/**
 * Saving throw type for Dragonborn breath weapon.
 * PHB p.34 — per-ancestry; NOT derivable from damage type (see Decision #562).
 */
export type BreathWeaponSavingThrow = 'dex' | 'con';

/**
 * Raw breath weapon data stored in subrace JSONB (populated by importer).
 * Synthesized at import time per PHB p.34 Draconic Ancestry table.
 *
 * Tech debt per CLAUDE.md §1.2: damageType stored as string (not union) to
 * accommodate potential future XPHB/FTD expansion. Domain validators can
 * re-narrow if needed.
 */
export interface BreathWeaponData {
  /** PHB-constrained: 'acid' | 'cold' | 'fire' | 'lightning' | 'poison'. */
  damageType: string;
  shape: BreathWeaponShape;
  /** Display string: '5 ft × 30 ft' (line) or '15 ft' (cone). */
  size: string;
  savingThrow: BreathWeaponSavingThrow;
}

/**
 * Un bloque del campo `ability` de 5etools. Puede tener:
 *   - keys directos (str/dex/...) con bonus → ASIs fijos
 *   - choose: { from, count } → pick N stats, +1 cada uno
 *   - choose: { from, amount } → distribuir N puntos
 *   - choose: { weighted: { from, weights } } → asignar weights[0] al 1er stat, weights[1] al 2do, etc.
 *   - mixto: ambos en el mismo bloque (ej: Half-Elf "+2 CHA + 2 stats a elegir +1 c/u")
 */
export interface AbilityBlock {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  choose?: {
    from?: string[];
    count?: number;
    amount?: number;
    weighted?: { from: string[]; weights: number[] };
  };
}

/**
 * Bloque del campo `languageProficiencies` de 5etools.
 *   - keys con valor `true` → idiomas fijos (ej: `{ elvish: true }`)
 *   - keys `anyStandard | anyExotic | any` con número → N idiomas a elegir
 */
export interface LanguageProficiencyBlock {
  anyStandard?: number;
  anyExotic?: number;
  any?: number;
  [language: string]: boolean | number | undefined;
}

/**
 * Bloque del campo `feats` en 5etools races shape.
 * PHB Variant Human / Custom Lineage (TCE): `[{ any: 1 }]`.
 */
export interface RaceFeatBlock {
  any?: number;
}

/**
 * Bloque del campo `skillProficiencies` en 5etools races shape.
 * Puede ser `{ any: N }` (pick N from all skills) o `{ stealth: true }` (fixed).
 * Reutilizamos un shape genérico porque es compatible con el BackgroundSkillBlock.
 */
export type RaceSkillProficiencyBlock = Record<string, boolean | number>;

/**
 * Bloque del campo `weaponProficiencies` en 5etools races shape.
 * Keys son slugs con sufijo de source (ej: `"battleaxe|phb"`) con valor `true`.
 * El helper `normalizeProf` de compute.ts ya stripea el sufijo `|phb`.
 * El key `choose` con `fromFilter` se ignora silenciosamente (Decision #590).
 */
export type WeaponProficiencyBlock = Record<string, boolean | { choose: unknown }>;

/**
 * Bloque del campo `armorProficiencies` en 5etools races shape.
 * Keys son strings de armor type (ej: `"light"`, `"medium"`) con valor `true`.
 */
export type ArmorProficiencyBlock = Record<string, boolean>;

/** Frequency bucket for racial innate spells. PHB 2014 races use only 'at-will' or 'daily-1'. */
export type RaceInnateSpellFrequency = 'at-will' | 'daily-1';

/**
 * Normalized racial innate/known spell entry. Stored under `data.additionalSpellsNormalized`
 * in the race/subrace JSONB (computed at import time by `normalize-additional-spells.ts`).
 *
 * Decision #605: single flat interface with `isPlayerChoice` flag (NOT a discriminated union).
 * When `isPlayerChoice: true`, `slug` is the sentinel placeholder `'__choose__'` and
 * `source` is `''`; the resolved cantrip lives on `CharacterSnapshot.raceCantrip`.
 *
 * Decision #603: `characterLevelAvailable` is a literal union — forces explicit widening
 * if a future race uses other levels. The `3` key in 5etools `innate["3"]` means
 * character level 3 ("When you reach 3rd level..."), NOT spell slot level.
 */
export interface RaceInnateSpell {
  /** Spell slug (e.g. 'hellish-rebuke'). Sentinel '__choose__' when isPlayerChoice. */
  slug: string;
  /** Spell source ('phb'). Empty string when isPlayerChoice. */
  source: string;
  /** Character level at which this spell becomes available. PHB 2014: 1, 3, or 5 only. */
  characterLevelAvailable: 1 | 3 | 5;
  /** 'at-will' (cantrip) or 'daily-1' (1 use per long rest). PHB 2014 frequencies only. */
  frequency: RaceInnateSpellFrequency;
  /** Spellcasting ability for this entry. PHB: 'cha' (Tiefling/Drow) or 'int' (HighElf/ForestGnome). */
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  /** Cast level override for `#N` suffix (e.g. `hellish rebuke#2` → 2). PHB Tiefling only. */
  castLevel?: number | null;
  /** True ONLY for the High Elf wizard-cantrip sentinel (Decision #602). */
  isPlayerChoice?: boolean;
  /** Class filter when isPlayerChoice. PHB: 'wizard'. Decision #605 + #602. */
  fromClass?: string;
}

export interface RaceCompendiumData {
  slug: string;
  source: string;
  ability?: AbilityBlock[] | null;
  languageProficiencies?: LanguageProficiencyBlock[] | null;
  /** Presente en Variant Human (subrace shape) y Custom Lineage. `[{any:1}]`. */
  feats?: RaceFeatBlock[] | null;
  /** Presente en Variant Human (any:1), Half-Elf (any:2), Custom Lineage (any:1). */
  skillProficiencies?: RaceSkillProficiencyBlock[] | null;
  /** Set by importer for PHB Dragonborn synthetic subraces. Race-level for symmetry. */
  breathWeapon?: BreathWeaponData | null;
  /**
   * Darkvision radius in feet. PHB p.17.
   * - number: race grants darkvision at this radius (PHB: 60 for Dwarf/Elf/Gnome/Half-Elf/Half-Orc/Tiefling).
   * - null: explicit opt-out (rare; reserved for hypothetical subrace overrides that REMOVE darkvision).
   * - undefined (field absent): race does not grant darkvision (PHB: Human, Halfling, Dragonborn).
   */
  darkvision?: number | null;
  /**
   * Weapon proficiencies granted by this race. PHB p.20 (Dwarf), p.23 (Elf).
   * 5etools shape: `[{ "battleaxe|phb": true }]` — source suffix stripped by normalizeProf.
   * Absent when race grants no weapon proficiencies (Human, Halfling, Dragonborn, etc.).
   */
  weaponProficiencies?: WeaponProficiencyBlock[] | null;
  /**
   * Armor proficiencies granted by this race (at race level).
   * PHB p.20 Mountain Dwarf: light + medium armor (stored on subrace in 5etools).
   * Absent when race grants no armor proficiencies.
   */
  armorProficiencies?: ArmorProficiencyBlock[] | null;
  /**
   * Normalized racial innate/known spells. Populated by the importer from the raw
   * `additionalSpells` JSONB block. PHB 2014: Tiefling (3 entries), High Elf (1 sentinel),
   * Forest Gnome (1 entry); Drow lives on the SUBRACE — see SubraceCompendiumData.
   * Absent when race grants none. Decisions #602, #603, #604, #605.
   */
  additionalSpellsNormalized?: RaceInnateSpell[] | null;
}

export interface SubraceCompendiumData {
  slug: string;
  source: string;
  /** Slug + source de la raza a la que pertenece. */
  parentSlug: string;
  parentSource: string;
  ability?: AbilityBlock[] | null;
  languageProficiencies?: LanguageProficiencyBlock[] | null;
  /** Presente en Variant Human subrace. `[{any:1}]`. */
  feats?: RaceFeatBlock[] | null;
  /** Presente en Variant Human subrace (any:1). */
  skillProficiencies?: RaceSkillProficiencyBlock[] | null;
  /** Set by importer for PHB Dragonborn ancestry rows. PHB p.34. */
  breathWeapon?: BreathWeaponData | null;
  /**
   * Darkvision radius in feet. PHB p.17, 24.
   * When PRESENT (number or null), OVERRIDES the parent race's darkvision per decision #577.
   * - PHB Drow: 120 (Superior Darkvision — replaces base Elf 60).
   * - MPMM Duergar / Deep Gnome: 120 (Superior — replaces base Dwarf/Gnome 60).
   * - undefined (field absent): inherit parent race's darkvision.
   */
  darkvision?: number | null;
  /**
   * Weapon proficiencies on the subrace. When PRESENT, OVERRIDES race-level per Decision #589.
   * - PHB Drow: rapier, shortsword, hand crossbow (REPLACES Elf Weapon Training).
   * - PHB High/Wood/Eladrin: longsword, shortsword, shortbow, longbow (RESTATES Elf training).
   * - undefined (field absent): no override — race-level weaponProficiencies used.
   */
  weaponProficiencies?: WeaponProficiencyBlock[] | null;
  /**
   * Armor proficiencies on the subrace. When PRESENT, OVERRIDES race-level per Decision #589.
   * - PHB Mountain Dwarf: light + medium armor (Dwarf race has none, so override yields addition).
   * - undefined (field absent): no override — race-level armorProficiencies used (or none).
   */
  armorProficiencies?: ArmorProficiencyBlock[] | null;
  /**
   * Normalized racial innate/known spells from the subrace. When PRESENT (incl. null),
   * OVERRIDES the parent race's additionalSpellsNormalized per Decision #589 family
   * (same merge pattern as darkvision/weaponProficiencies). PHB: Drow (3 entries),
   * High Elf (1 sentinel), Forest Gnome (1 entry).
   */
  additionalSpellsNormalized?: RaceInnateSpell[] | null;
}

export interface AppliedAsi {
  ability: AbilityKey;
  bonus: number;
  source: 'race' | 'subrace';
}

export type RaceValidationIssue =
  | { code: 'RACE_NOT_FOUND'; race: { slug: string; source: string } }
  | { code: 'RACE_DISABLED'; race: { slug: string; source: string } }
  | { code: 'RACE_SUBRACE_REQUIRED'; race: { slug: string; source: string } }
  | { code: 'SUBRACE_NOT_FOUND'; subrace: { slug: string; source: string } }
  | { code: 'SUBRACE_DISABLED'; subrace: { slug: string; source: string } }
  | {
      code: 'SUBRACE_DOES_NOT_BELONG_TO_RACE';
      raceSlug: string;
      raceSource: string;
      subraceParentSlug: string;
      subraceParentSource: string;
    }
  | { code: 'ASI_REQUIRED'; reason: string }
  | { code: 'ASI_MISMATCH'; expected: number[]; got: number[]; note?: string }
  | { code: 'ASI_DUPLICATE_ABILITY'; ability: AbilityKey }
  | { code: 'ASI_UNKNOWN_ABILITY'; ability: string }
  | {
      /**
       * El race o subrace usa una "choose" block con shape no soportado
       * (ej: `weighted`, que no hay en compendio actual).
       */
      code: 'RACE_CHOOSE_SHAPE_UNSUPPORTED';
      where: 'race' | 'subrace';
      slug: string;
      source: string;
    }
  | {
      /** El user picó una ability que no está en la lista `from` del choose. */
      code: 'RACE_ASI_CHOOSE_INVALID_ABILITY';
      where: 'race' | 'subrace';
      ability: string;
      allowed: AbilityKey[];
    }
  | {
      /** Cantidad incorrecta de picks para un choose con `count` fijo. */
      code: 'RACE_ASI_CHOOSE_WRONG_COUNT';
      where: 'race' | 'subrace';
      expected: number;
      got: number;
    }
  | {
      /** El bonus de un pick no coincide con el `amount` esperado del choose. */
      code: 'RACE_ASI_CHOOSE_WRONG_BONUS';
      where: 'race' | 'subrace';
      ability: AbilityKey;
      expected: number;
      got: number;
    }
  | {
      /** Los picks suman distinto al `amount` esperado (modo distribuir N puntos). */
      code: 'RACE_ASI_CHOOSE_WRONG_TOTAL';
      where: 'race' | 'subrace';
      expected: number;
      got: number;
    }
  | {
      /** El user picó una ability que YA estaba con fixed en ese mismo block. */
      code: 'RACE_ASI_OVERLAP_WITH_FIXED';
      where: 'race' | 'subrace';
      ability: AbilityKey;
    }
  | {
      /** Cantidad incorrecta de idiomas elegidos (raza + subrace combinados). */
      code: 'RACE_LANGUAGE_COUNT_MISMATCH';
      expectedCount: number;
      gotCount: number;
    }
  | {
      /** Idioma elegido aparece dos veces (o ya estaba fijo en la raza). */
      code: 'RACE_LANGUAGE_DUPLICATE';
      language: string;
    }
  | {
      /** La raza/subrace requiere elegir un feat (`feats: [{any:1}]`) y no se proveyó. */
      code: 'RACE_FEAT_REQUIRED';
      race: { slug: string; source: string };
    }
  | {
      /** El featChoice falló las validaciones del feat domain. Issues bubbled. */
      code: 'RACE_FEAT_INVALID';
      feat: { slug: string; source: string };
      wrapped: FeatValidationIssue[];
    }
  | {
      /** La raza requiere N skills pero el user proveyó otro número. */
      code: 'RACE_SKILL_COUNT_MISMATCH';
      expectedCount: number;
      gotCount: number;
    }
  | {
      /** El user picó la misma skill dos veces o picó una skill ya fija en la raza/subrace. */
      code: 'RACE_SKILL_DUPLICATE';
      skill: string;
    }
  | {
      /** El user picó una skill que no existe en ALL_SKILLS. */
      code: 'RACE_SKILL_UNKNOWN';
      skill: string;
    }
  | {
      /** Subrace requires a wizard cantrip pick (High Elf) and `raceCantrip` is null on WRITE. */
      code: 'RACE_CANTRIP_REQUIRED';
      race: { slug: string; source: string };
      subrace: { slug: string; source: string };
      expectedFilter: { class: string; spellLevel: number };
    }
  | {
      /** Chosen cantrip slug is not in the wizard cantrip pool (cross-checked via use-case). */
      code: 'RACE_CANTRIP_INVALID';
      cantrip: { slug: string; source: string };
      fromClass: string;
    };

export type RaceValidationResult =
  | {
      ok: true;
      appliedAsis: AppliedAsi[];
      usedTashasCustomOrigin: boolean;
      appliedLanguageChoices: string[];
      /** Set only when the race/subrace had `feats: [{any:N}]` AND the player provided a valid pick. */
      appliedFeat?: AppliedFeat | null;
      /** Always set; empty array when the race carries no skill picks. */
      appliedSkillChoices: string[];
    }
  | { ok: false; issues: RaceValidationIssue[] };

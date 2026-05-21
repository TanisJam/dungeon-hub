import type { AbilityKey } from '../stats/types.js';

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

export interface RaceCompendiumData {
  slug: string;
  source: string;
  ability?: AbilityBlock[] | null;
}

export interface SubraceCompendiumData {
  slug: string;
  source: string;
  /** Slug + source de la raza a la que pertenece. */
  parentSlug: string;
  parentSource: string;
  ability?: AbilityBlock[] | null;
}

export interface AppliedAsi {
  ability: AbilityKey;
  bonus: number;
  source: 'race' | 'subrace';
}

export type RaceValidationIssue =
  | { code: 'RACE_NOT_FOUND'; race: { slug: string; source: string } }
  | { code: 'RACE_DISABLED'; race: { slug: string; source: string } }
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
    };

export type RaceValidationResult =
  | { ok: true; appliedAsis: AppliedAsi[]; usedTashasCustomOrigin: boolean }
  | { ok: false; issues: RaceValidationIssue[] };

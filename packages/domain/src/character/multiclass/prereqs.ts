import type { AbilityKey } from '../stats/types.js';

/**
 * Prereq de multiclass según PHB p.163.
 *   - `all`:   listas de abilities que TODAS deben llegar al threshold.
 *   - `oneOf`: lista donde basta con UNA llegue al threshold.
 *
 * Ej:
 *   Paladin: { all: ['str', 'cha'], threshold: 13 }
 *   Fighter: { oneOf: ['str', 'dex'], threshold: 13 }
 *   Wizard:  { all: ['int'], threshold: 13 }
 */
export interface MulticlassPrereq {
  all?: AbilityKey[];
  oneOf?: AbilityKey[];
  threshold: number;
}

/**
 * Tabla canónica PHB p.163 + Artificer (TCE).
 * Las claves son los slugs que produce el importer.
 */
export const MULTICLASS_PREREQS: Readonly<Record<string, MulticlassPrereq>> = Object.freeze({
  barbarian: { all: ['str'], threshold: 13 },
  bard: { all: ['cha'], threshold: 13 },
  cleric: { all: ['wis'], threshold: 13 },
  druid: { all: ['wis'], threshold: 13 },
  fighter: { oneOf: ['str', 'dex'], threshold: 13 },
  monk: { all: ['dex', 'wis'], threshold: 13 },
  paladin: { all: ['str', 'cha'], threshold: 13 },
  ranger: { all: ['dex', 'wis'], threshold: 13 },
  rogue: { all: ['dex'], threshold: 13 },
  sorcerer: { all: ['cha'], threshold: 13 },
  warlock: { all: ['cha'], threshold: 13 },
  wizard: { all: ['int'], threshold: 13 },
  // Artificer (TCE p.7) — same rule: INT 13
  artificer: { all: ['int'], threshold: 13 },
});

export interface PrereqCheck {
  meetsAll: boolean;
  /** Abilities que FALLAN el threshold. */
  missing: Array<{ ability: AbilityKey; got: number; needed: number }>;
}

/**
 * Verifica si los effective scores cumplen el prereq de multiclass para una clase.
 * Si el classSlug no está en la tabla, devuelve `null` (no podemos verificar).
 */
export function checkMulticlassPrereq(
  classSlug: string,
  scores: Record<AbilityKey, number>,
): PrereqCheck | null {
  const prereq = MULTICLASS_PREREQS[classSlug];
  if (!prereq) return null;

  if (prereq.all && prereq.all.length > 0) {
    const missing = prereq.all
      .filter((a) => scores[a] < prereq.threshold)
      .map((a) => ({ ability: a, got: scores[a], needed: prereq.threshold }));
    return { meetsAll: missing.length === 0, missing };
  }

  if (prereq.oneOf && prereq.oneOf.length > 0) {
    const meets = prereq.oneOf.some((a) => scores[a] >= prereq.threshold);
    if (meets) return { meetsAll: true, missing: [] };
    return {
      meetsAll: false,
      missing: prereq.oneOf.map((a) => ({
        ability: a,
        got: scores[a],
        needed: prereq.threshold,
      })),
    };
  }

  return { meetsAll: true, missing: [] };
}

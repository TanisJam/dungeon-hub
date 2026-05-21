import { ABILITY_KEYS, type AbilityKey } from '../stats/types.js';
import type { RulesProfile } from '../../rules-profile/types.js';
import type {
  AbilityBlock,
  AppliedAsi,
  RaceCompendiumData,
  RaceValidationIssue,
  RaceValidationResult,
  SubraceCompendiumData,
} from './types.js';

/**
 * Convención MPMM cuando la raza tiene `ability: null`:
 * el jugador asigna +2 a un stat y +1 a otro distinto.
 */
const MPMM_DEFAULT_BAG = [2, 1] as const;

/** Helper para construir la clave "slug|SOURCE" usada en disabledEntities. */
function entityKey(slug: string, source: string): string {
  return `${slug}|${source}`;
}

function isAbilityKey(s: string): s is AbilityKey {
  return (ABILITY_KEYS as readonly string[]).includes(s);
}

/**
 * Extrae los ASIs fijos de un bloque (los keys str/dex/.../cha con su bonus).
 * Devuelve null si el bloque tiene `choose` (no soportado en este slice).
 */
function extractFixedFromBlock(
  block: AbilityBlock,
): Array<{ ability: AbilityKey; bonus: number }> | null {
  if (block.choose !== undefined) return null;
  const out: Array<{ ability: AbilityKey; bonus: number }> = [];
  for (const k of ABILITY_KEYS) {
    const v = block[k];
    if (typeof v === 'number' && v !== 0) {
      out.push({ ability: k, bonus: v });
    }
  }
  return out;
}

/**
 * Aplana los bloques de `ability` a un array de ASIs fijos. Si encuentra un
 * `choose` block, devuelve { unsupported: true }.
 *
 * `ability` null o missing → array vacío (convención MPMM, se maneja afuera).
 */
function flattenFixedAbility(blocks: AbilityBlock[] | null | undefined): {
  fixed: Array<{ ability: AbilityKey; bonus: number }>;
  unsupported: boolean;
} {
  if (!blocks || blocks.length === 0) return { fixed: [], unsupported: false };
  const fixed: Array<{ ability: AbilityKey; bonus: number }> = [];
  for (const block of blocks) {
    const f = extractFixedFromBlock(block);
    if (f === null) return { fixed: [], unsupported: true };
    fixed.push(...f);
  }
  return { fixed, unsupported: false };
}

/**
 * Devuelve true si esta raza/subrace tiene ASIs fijos publicados (PHB-style).
 * False si tiene `ability: null/missing` (MPMM-style) o si tiene `choose`.
 */
function hasFixedAbilities(blocks: AbilityBlock[] | null | undefined): boolean {
  if (!blocks || blocks.length === 0) return false;
  return blocks.every((b) => b.choose === undefined && Object.keys(b).length > 0);
}

interface ValidateRaceInput {
  raceData: RaceCompendiumData;
  subraceData?: SubraceCompendiumData | null;
  rulesProfile: RulesProfile;
  /**
   * Selección del jugador.
   * - Requerida si: Tasha's ON, o la raza tiene `ability: null` (MPMM convention).
   * - Opcional si: Tasha's OFF y la raza tiene ASIs fijos (los derivamos).
   */
  appliedAsis?: Array<{ ability: string; bonus: number; source: 'race' | 'subrace' }>;
}

export function validateRaceSelection(input: ValidateRaceInput): RaceValidationResult {
  const issues: RaceValidationIssue[] = [];
  const { raceData, subraceData, rulesProfile } = input;

  // ---- 1) Race habilitada en el profile ----------------------------------
  if (rulesProfile.sources[raceData.source] !== true) {
    issues.push({
      code: 'RACE_DISABLED',
      race: { slug: raceData.slug, source: raceData.source },
    });
  }
  if (rulesProfile.disabledEntities.races.includes(entityKey(raceData.slug, raceData.source))) {
    issues.push({
      code: 'RACE_DISABLED',
      race: { slug: raceData.slug, source: raceData.source },
    });
  }

  // ---- 2) Subrace (si la hay) --------------------------------------------
  if (subraceData) {
    if (rulesProfile.sources[subraceData.source] !== true) {
      issues.push({
        code: 'SUBRACE_DISABLED',
        subrace: { slug: subraceData.slug, source: subraceData.source },
      });
    }
    const subKey = entityKey(subraceData.slug, subraceData.source);
    if (
      rulesProfile.disabledEntities.subraces.includes(subKey) ||
      rulesProfile.disabledEntities.races.includes(subKey)
    ) {
      issues.push({
        code: 'SUBRACE_DISABLED',
        subrace: { slug: subraceData.slug, source: subraceData.source },
      });
    }
    if (subraceData.parentSlug !== raceData.slug || subraceData.parentSource !== raceData.source) {
      issues.push({
        code: 'SUBRACE_DOES_NOT_BELONG_TO_RACE',
        raceSlug: raceData.slug,
        raceSource: raceData.source,
        subraceParentSlug: subraceData.parentSlug,
        subraceParentSource: subraceData.parentSource,
      });
    }
  }

  // Si la raza/subrace no es válida, no seguimos con ASIs.
  if (issues.length > 0) return { ok: false, issues };

  // ---- 3) Reject choose blocks (1.4b.2 work) -----------------------------
  const raceFixed = flattenFixedAbility(raceData.ability);
  if (raceFixed.unsupported) {
    issues.push({
      code: 'RACE_CHOOSE_SHAPE_UNSUPPORTED',
      where: 'race',
      slug: raceData.slug,
      source: raceData.source,
    });
  }
  const subraceFixed = subraceData
    ? flattenFixedAbility(subraceData.ability)
    : { fixed: [], unsupported: false };
  if (subraceFixed.unsupported) {
    issues.push({
      code: 'RACE_CHOOSE_SHAPE_UNSUPPORTED',
      where: 'subrace',
      slug: subraceData!.slug,
      source: subraceData!.source,
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  // ---- 4) Resolver ASIs ---------------------------------------------------
  // Decidir el "bag" (multiset de bonuses) y si el usuario tiene que asignar.
  const raceHasFixed = hasFixedAbilities(raceData.ability);
  const subraceHasFixed = subraceData ? hasFixedAbilities(subraceData.ability) : false;

  const tashasOn = rulesProfile.variantRules.tashasCustomOrigin === true;
  const raceIsMpmmStyle = !raceHasFixed; // ability null/missing → MPMM convention

  // Caso A: Race tiene ASIs fijos + Tasha's OFF.
  //   → Aplicamos los fijos. appliedAsis opcional; si viene, debe coincidir con los fijos.
  if (raceHasFixed && !tashasOn) {
    // Tanto la raza como la subrace (si tiene fijos) se aplican literal.
    const derived: AppliedAsi[] = [
      ...raceFixed.fixed.map((a) => ({ ...a, source: 'race' as const })),
      ...subraceFixed.fixed.map((a) => ({ ...a, source: 'subrace' as const })),
    ];

    if (input.appliedAsis !== undefined) {
      const mismatch = compareAsiSets(input.appliedAsis, derived);
      if (mismatch) return { ok: false, issues: [mismatch] };
    }

    return { ok: true, appliedAsis: derived, usedTashasCustomOrigin: false };
  }

  // Para todos los demás casos necesitamos appliedAsis del usuario.
  if (input.appliedAsis === undefined || input.appliedAsis.length === 0) {
    issues.push({
      code: 'ASI_REQUIRED',
      reason: raceIsMpmmStyle
        ? 'Esta raza usa la convención MPMM: tenés que asignar +2 a un stat y +1 a otro distinto.'
        : 'Tasha\'s Custom Origin está activo: tenés que asignar los ASIs raciales libremente.',
    });
    return { ok: false, issues };
  }

  // Validar el shape: todas las abilities deben ser keys válidas y no repetirse.
  const seen = new Set<AbilityKey>();
  for (const a of input.appliedAsis) {
    if (!isAbilityKey(a.ability)) {
      issues.push({ code: 'ASI_UNKNOWN_ABILITY', ability: a.ability });
      continue;
    }
    if (seen.has(a.ability)) {
      issues.push({ code: 'ASI_DUPLICATE_ABILITY', ability: a.ability });
    }
    seen.add(a.ability);
  }
  if (issues.length > 0) return { ok: false, issues };

  // Comparar el multiset de bonuses contra el esperado.
  const expectedBag = raceIsMpmmStyle
    ? [...MPMM_DEFAULT_BAG]
    : computeBagFromFixed(raceFixed.fixed, subraceFixed.fixed);

  const gotBag = input.appliedAsis.map((a) => a.bonus).sort((x, y) => y - x);
  const wantBag = [...expectedBag].sort((x, y) => y - x);

  if (!arraysEqual(gotBag, wantBag)) {
    issues.push({
      code: 'ASI_MISMATCH',
      expected: wantBag,
      got: gotBag,
      note: raceIsMpmmStyle
        ? 'Esta raza (convención MPMM) requiere exactamente +2 y +1 (cada uno a un stat distinto).'
        : "Tasha's: tenés que redistribuir los mismos bonuses raciales (mismo bag) a diferentes stats.",
    });
    return { ok: false, issues };
  }

  return {
    ok: true,
    appliedAsis: input.appliedAsis.map((a) => ({
      ability: a.ability as AbilityKey,
      bonus: a.bonus,
      source: a.source,
    })),
    usedTashasCustomOrigin: tashasOn,
  };
}

function compareAsiSets(
  got: Array<{ ability: string; bonus: number; source: 'race' | 'subrace' }>,
  expected: AppliedAsi[],
): RaceValidationIssue | null {
  const gotBag = got.map((a) => a.bonus).sort((x, y) => y - x);
  const wantBag = expected.map((a) => a.bonus).sort((x, y) => y - x);
  if (!arraysEqual(gotBag, wantBag)) {
    return {
      code: 'ASI_MISMATCH',
      expected: wantBag,
      got: gotBag,
      note: 'Los ASIs provistos no coinciden con los fijos de esta raza.',
    };
  }
  // Aunque el bag coincida, las abilities tienen que coincidir 1:1 también (asignación fija).
  for (const e of expected) {
    const match = got.find(
      (g) => g.ability === e.ability && g.bonus === e.bonus && g.source === e.source,
    );
    if (!match) {
      return {
        code: 'ASI_MISMATCH',
        expected: wantBag,
        got: gotBag,
        note: `Esperaba ${e.bonus} a ${e.ability} (${e.source}) pero no aparece exacto.`,
      };
    }
  }
  return null;
}

function computeBagFromFixed(
  raceFixed: Array<{ ability: AbilityKey; bonus: number }>,
  subraceFixed: Array<{ ability: AbilityKey; bonus: number }>,
): number[] {
  return [...raceFixed, ...subraceFixed].map((a) => a.bonus);
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

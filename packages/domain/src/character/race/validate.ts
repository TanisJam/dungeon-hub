import { ABILITY_KEYS, type AbilityKey } from '../stats/types.js';
import type { RulesProfile } from '../../rules-profile/types.js';
import { RACES_REQUIRING_SUBRACE } from './subrace-required.js';
import type {
  AbilityBlock,
  AppliedAsi,
  LanguageProficiencyBlock,
  RaceCompendiumData,
  RaceFeatBlock,
  RaceSkillProficiencyBlock,
  RaceValidationIssue,
  RaceValidationResult,
  SubraceCompendiumData,
} from './types.js';
import { validateFeatSelection } from '../feat/validate.js';
import type {
  AppliedFeat,
  CharacterFeatContext,
  FeatCompendiumData,
} from '../feat/types.js';
import { ALL_SKILLS } from '../sheet/types.js';

/** Suma el total de `any` grants en un array de `RaceFeatBlock`. */
function sumAnyFeats(blocks: RaceFeatBlock[] | null | undefined): number {
  let n = 0;
  for (const b of blocks ?? []) {
    if (typeof b.any === 'number') n += b.any;
  }
  return n;
}

/**
 * Valida los skill choices contra el bloque `skillProficiencies` de race + subrace.
 * Devuelve issues (vacío si OK) y la lista normalizada (lowercase) a persistir.
 */
function validateRaceSkillChoices(input: {
  race: RaceCompendiumData;
  subrace?: SubraceCompendiumData | null;
  choices: string[];
}): { issues: RaceValidationIssue[]; applied: string[] } {
  const issues: RaceValidationIssue[] = [];

  // Contamos `any: N` y recopilamos skills fijos (para dedup futuro, ej Bugbear Stealth).
  const fixedSkills = new Set<string>();
  let expectedAnyCount = 0;

  const collect = (blocks: RaceSkillProficiencyBlock[] | null | undefined) => {
    for (const block of blocks ?? []) {
      for (const [key, value] of Object.entries(block)) {
        if (key === 'any' && typeof value === 'number') {
          expectedAnyCount += value;
        } else if (key === 'choose' && typeof value === 'object' && value !== null) {
          // `choose: { count, from }` shape — treat count like `any` (Batch 6 validates from-list)
          const cnt = (value as { count?: number }).count;
          if (typeof cnt === 'number') expectedAnyCount += cnt;
        } else if (value === true) {
          fixedSkills.add(key.toLowerCase());
        }
      }
    }
  };

  collect(input.race.skillProficiencies);
  collect(input.subrace?.skillProficiencies);

  // Si la raza no tiene skill grants, ignoramos silenciosamente los choices.
  if (expectedAnyCount === 0) {
    return { issues: [], applied: [] };
  }

  const normalized = input.choices.map((c) => c.toLowerCase());

  if (normalized.length !== expectedAnyCount) {
    issues.push({
      code: 'RACE_SKILL_COUNT_MISMATCH',
      expectedCount: expectedAnyCount,
      gotCount: normalized.length,
    });
    return { issues, applied: normalized };
  }

  const seen = new Set<string>();
  for (const skill of normalized) {
    if (!(ALL_SKILLS as readonly string[]).includes(skill)) {
      issues.push({ code: 'RACE_SKILL_UNKNOWN', skill });
      continue;
    }
    if (seen.has(skill) || fixedSkills.has(skill)) {
      issues.push({ code: 'RACE_SKILL_DUPLICATE', skill });
      continue;
    }
    seen.add(skill);
  }

  return { issues, applied: normalized };
}

/** Suma fijos + cantidad total de slots `any*` para los language blocks dados. */
function splitLanguageBlocks(blocks: LanguageProficiencyBlock[] | null | undefined): {
  fixed: string[];
  anyCount: number;
} {
  const fixed: string[] = [];
  let anyCount = 0;
  for (const block of blocks ?? []) {
    for (const [key, value] of Object.entries(block)) {
      if (key === 'anyStandard' || key === 'anyExotic' || key === 'any') {
        if (typeof value === 'number') anyCount += value;
      } else if (value === true) {
        fixed.push(key.toLowerCase());
      }
    }
  }
  return { fixed, anyCount };
}

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

interface ChooseSpec {
  /** Lista de abilities permitidas (filtrada para que sean válidas). */
  from: AbilityKey[];
  /** Si count está, cada pick recibe `amount` (default 1). */
  count: number | null;
  /** Para modo count: cuánto suma cada pick. Para modo amount-alone: total a distribuir. */
  amount: number;
  /** Cuándo es "amount alone" (Custom Lineage): el user distribuye libremente. */
  amountAloneMode: boolean;
  /** Abilities ya fijas en el mismo block — no se pueden duplicar. */
  excludedAbilities: ReadonlySet<AbilityKey>;
}

interface ProcessedBlock {
  /** Bonus fijos del block (str/dex/.../cha keys con valor). */
  fixed: Array<{ ability: AbilityKey; bonus: number }>;
  /** Spec del choose si existe. */
  choose: ChooseSpec | null;
  /** Shape no soportado (ej: weighted). Si true, el caller emite RACE_CHOOSE_SHAPE_UNSUPPORTED. */
  unsupportedChoose: boolean;
}

/**
 * Procesa un bloque del array `ability` de 5etools y separa fixed vs choose.
 * Devuelve `unsupportedChoose: true` para shapes que no soportamos todavía (weighted).
 */
function processAbilityBlock(block: AbilityBlock): ProcessedBlock {
  const fixed: Array<{ ability: AbilityKey; bonus: number }> = [];
  for (const k of ABILITY_KEYS) {
    const v = block[k];
    if (typeof v === 'number' && v !== 0) fixed.push({ ability: k, bonus: v });
  }

  if (!block.choose) return { fixed, choose: null, unsupportedChoose: false };

  // Weighted no se ha visto en el compendio actual; lo dejamos como unsupported.
  if (block.choose.weighted !== undefined) {
    return { fixed, choose: null, unsupportedChoose: true };
  }

  const fromRaw = block.choose.from ?? [...ABILITY_KEYS];
  const from = fromRaw.filter(isAbilityKey);
  const count = typeof block.choose.count === 'number' ? block.choose.count : null;
  // amount default por modo: con count → +1 por pick; sin count → el amount es el total.
  const rawAmount = typeof block.choose.amount === 'number' ? block.choose.amount : null;
  const amount = rawAmount ?? (count !== null ? 1 : 1);
  const amountAloneMode = count === null && rawAmount !== null;

  const excludedAbilities = new Set(fixed.map((f) => f.ability));

  return {
    fixed,
    choose: { from, count, amount, amountAloneMode, excludedAbilities },
    unsupportedChoose: false,
  };
}

interface ValidateRaceInput {
  raceData: RaceCompendiumData;
  subraceData?: SubraceCompendiumData | null;
  rulesProfile: RulesProfile;
  appliedAsis?: Array<{ ability: string; bonus: number; source: 'race' | 'subrace' }>;
  /** Idiomas elegidos por el jugador (para satisfacer slots `any*` de raza + subrace). */
  languageChoices?: string[];
  /** Skills elegidas para el bloque `skillProficiencies:[{any:N}]` de la raza. */
  skillChoices?: string[];
  /**
   * Feat elegido para el bloque `feats:[{any:1}]` de la raza.
   * La API pre-carga el FeatCompendiumData; el validator es puro.
   */
  featChoice?: {
    featData: FeatCompendiumData;
    asiChoice?: Array<{ ability: string; bonus: number }>;
  } | null;
  /**
   * Contexto del personaje para validar prereqs del feat racial.
   * REQUERIDO cuando featChoice está presente.
   * Construido por la API con baseStats + ASIs raciales (misma call).
   */
  featContext?: CharacterFeatContext;
}

/**
 * Valida los idiomas elegidos contra los slots `any*` combinados de race + subrace.
 * Devuelve issues (vacío si OK) y la lista normalizada (lowercase) a persistir.
 */
function validateLanguageChoices(input: {
  race: RaceCompendiumData;
  subrace?: SubraceCompendiumData | null;
  choices: string[];
}): { issues: RaceValidationIssue[]; applied: string[] } {
  const raceLangs = splitLanguageBlocks(input.race.languageProficiencies);
  const subraceLangs = splitLanguageBlocks(input.subrace?.languageProficiencies);
  const totalAnyCount = raceLangs.anyCount + subraceLangs.anyCount;
  const fixedSet = new Set([...raceLangs.fixed, ...subraceLangs.fixed]);

  const issues: RaceValidationIssue[] = [];
  const normalized = input.choices.map((c) => c.toLowerCase());

  if (normalized.length !== totalAnyCount) {
    issues.push({
      code: 'RACE_LANGUAGE_COUNT_MISMATCH',
      expectedCount: totalAnyCount,
      gotCount: normalized.length,
    });
    return { issues, applied: normalized };
  }

  const seen = new Set<string>();
  for (const lang of normalized) {
    if (seen.has(lang) || fixedSet.has(lang)) {
      issues.push({ code: 'RACE_LANGUAGE_DUPLICATE', language: lang });
      continue;
    }
    seen.add(lang);
  }

  return { issues, applied: normalized };
}

export function validateRaceSelection(input: ValidateRaceInput): RaceValidationResult {
  const issues: RaceValidationIssue[] = [];
  const { raceData, subraceData, rulesProfile } = input;

  // ---- 1) Source + disabled gating ---------------------------------------
  if (rulesProfile.sources[raceData.source] !== true) {
    issues.push({ code: 'RACE_DISABLED', race: { slug: raceData.slug, source: raceData.source } });
  }
  if (rulesProfile.disabledEntities.races.includes(entityKey(raceData.slug, raceData.source))) {
    issues.push({ code: 'RACE_DISABLED', race: { slug: raceData.slug, source: raceData.source } });
  }
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

  // ---- 1.2) Subrace required gate (PHB 2014) --------------------------------
  // Some races (Dwarf/Elf/Gnome/Halfling per PHB) cannot be selected without
  // a subrace — the subrace carries half the mechanical identity (ASI,
  // proficiencies, traits). Hard block; see decision #528.
  if (!subraceData && RACES_REQUIRING_SUBRACE.has(entityKey(raceData.slug, raceData.source))) {
    issues.push({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: raceData.slug, source: raceData.source },
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  // ---- 1.5) Idiomas elegidos --------------------------------------------
  const langResult = validateLanguageChoices({
    race: raceData,
    subrace: subraceData ?? null,
    choices: input.languageChoices ?? [],
  });
  if (langResult.issues.length > 0) {
    return { ok: false, issues: langResult.issues };
  }
  const appliedLanguageChoices = langResult.applied;

  // ---- 2) Procesar bloques race + subrace --------------------------------
  const raceBlocks = (raceData.ability ?? []).map(processAbilityBlock);
  const subraceBlocks = (subraceData?.ability ?? []).map(processAbilityBlock);

  for (const b of raceBlocks) {
    if (b.unsupportedChoose) {
      issues.push({
        code: 'RACE_CHOOSE_SHAPE_UNSUPPORTED',
        where: 'race',
        slug: raceData.slug,
        source: raceData.source,
      });
    }
  }
  for (const b of subraceBlocks) {
    if (b.unsupportedChoose) {
      issues.push({
        code: 'RACE_CHOOSE_SHAPE_UNSUPPORTED',
        where: 'subrace',
        slug: subraceData!.slug,
        source: subraceData!.source,
      });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const raceHasChoose = raceBlocks.some((b) => b.choose !== null);
  const subraceHasChoose = subraceBlocks.some((b) => b.choose !== null);
  const raceHasFixedOnly = raceBlocks.length > 0 && raceBlocks.every((b) => b.choose === null && b.fixed.length > 0);
  const raceIsEmpty = raceBlocks.length === 0;
  const tashasOn = rulesProfile.variantRules.tashasCustomOrigin === true;

  // Decidir el modo de validación:
  //   A) raceHasFixedOnly + (sin subrace o subrace fija) + Tasha's OFF
  //      → ASIs derivados directamente. appliedAsis opcional.
  //   B) Cualquier otro caso → user debe proveer appliedAsis.
  const subraceHasFixedOnly =
    subraceBlocks.length === 0 ||
    subraceBlocks.every((b) => b.choose === null);
  const purelyFixedNoTashas = raceHasFixedOnly && subraceHasFixedOnly && !tashasOn;

  if (purelyFixedNoTashas) {
    const derived: AppliedAsi[] = [
      ...raceBlocks.flatMap((b) => b.fixed.map((a) => ({ ...a, source: 'race' as const }))),
      ...subraceBlocks.flatMap((b) => b.fixed.map((a) => ({ ...a, source: 'subrace' as const }))),
    ];
    if (input.appliedAsis !== undefined) {
      const mismatch = compareAsiSets(input.appliedAsis, derived);
      if (mismatch) return { ok: false, issues: [mismatch] };
    }
    return finishWithSkillsAndFeats(derived, false, appliedLanguageChoices, input, raceData, subraceData);
  }

  // Para todos los demás casos, exigimos appliedAsis.
  if (input.appliedAsis === undefined || input.appliedAsis.length === 0) {
    issues.push({
      code: 'ASI_REQUIRED',
      reason: tashasOn
        ? "Tasha's Custom Origin está activo: tenés que asignar los ASIs raciales libremente."
        : raceIsEmpty
          ? 'Esta raza usa la convención MPMM: tenés que asignar +2 a un stat y +1 a otro distinto.'
          : 'Esta raza tiene picks de ability: tenés que asignar los bonuses elegidos.',
    });
    return { ok: false, issues };
  }

  // Validar shape básico: abilities válidas, sin repetir.
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

  // Tasha's ON → ignoramos `from`/source y validamos solo el bag total.
  if (tashasOn) {
    const expectedBag = computeBag(raceBlocks, subraceBlocks);
    const gotBag = input.appliedAsis.map((a) => a.bonus).sort((x, y) => y - x);
    const wantBag = [...expectedBag].sort((x, y) => y - x);
    if (!arraysEqual(gotBag, wantBag)) {
      issues.push({
        code: 'ASI_MISMATCH',
        expected: wantBag,
        got: gotBag,
        note: "Tasha's: redistribuís los mismos bonuses raciales (mismo bag) a stats diferentes.",
      });
      return { ok: false, issues };
    }
    return finishWithSkillsAndFeats(
      input.appliedAsis.map((a) => ({
        ability: a.ability as AbilityKey,
        bonus: a.bonus,
        source: a.source,
      })),
      true,
      appliedLanguageChoices,
      input,
      raceData,
      subraceData,
    );
  }

  // MPMM (ability null/missing) → bag fijo [+2, +1].
  if (raceIsEmpty && !subraceHasChoose) {
    const expectedBag = [...MPMM_DEFAULT_BAG];
    const gotBag = input.appliedAsis.map((a) => a.bonus).sort((x, y) => y - x);
    const wantBag = [...expectedBag].sort((x, y) => y - x);
    if (!arraysEqual(gotBag, wantBag)) {
      issues.push({
        code: 'ASI_MISMATCH',
        expected: wantBag,
        got: gotBag,
        note: 'Esta raza (convención MPMM) requiere exactamente +2 y +1 (cada uno a un stat distinto).',
      });
      return { ok: false, issues };
    }
    return finishWithSkillsAndFeats(
      input.appliedAsis.map((a) => ({
        ability: a.ability as AbilityKey,
        bonus: a.bonus,
        source: a.source,
      })),
      false,
      appliedLanguageChoices,
      input,
      raceData,
      subraceData,
    );
  }

  // ---- Tasha's OFF + choose shape ----------------------------------------
  // Validamos por block: fixed entries deben aparecer + choose se valida.
  const raceAsis = input.appliedAsis.filter((a) => a.source === 'race');
  const subraceAsis = input.appliedAsis.filter((a) => a.source === 'subrace');

  const validateBlocks = (
    blocks: ProcessedBlock[],
    asis: typeof input.appliedAsis,
    where: 'race' | 'subrace',
  ): boolean => {
    // Marcar qué ASIs ya fueron "consumidos" por fixed o choose.
    const consumed = new Set<number>();

    // 1) Fixed entries — deben aparecer literal con misma ability+bonus+source.
    for (const block of blocks) {
      for (const f of block.fixed) {
        const idx = asis.findIndex(
          (a, i) => !consumed.has(i) && a.ability === f.ability && a.bonus === f.bonus,
        );
        if (idx === -1) {
          issues.push({
            code: 'ASI_MISMATCH',
            expected: [f.bonus],
            got: [],
            note: `Esperaba ${f.bonus} a ${f.ability} (${where}, fixed) pero no aparece.`,
          });
          return false;
        }
        consumed.add(idx);
      }
    }

    // 2) Choose — el remanente debe satisfacer las specs.
    for (const block of blocks) {
      if (!block.choose) continue;
      const remaining = asis.filter((_, i) => !consumed.has(i));
      const candidates: number[] = []; // índices en `asis`
      asis.forEach((_, i) => {
        if (!consumed.has(i)) candidates.push(i);
      });

      const spec = block.choose;
      // En modo "count": el user debe tener `count` picks, cada uno con bonus=amount,
      // ability ∈ from, distintos y no en excludedAbilities.
      if (spec.count !== null) {
        const expectedPicks = spec.count;
        // Tomamos los primeros `count` candidates que matchean los criterios.
        const matching = remaining.slice(0, expectedPicks);
        if (matching.length < expectedPicks) {
          issues.push({
            code: 'RACE_ASI_CHOOSE_WRONG_COUNT',
            where,
            expected: expectedPicks,
            got: remaining.length,
          });
          return false;
        }
        // Validar cada pick.
        const pickedAbilities = new Set<AbilityKey>();
        for (let i = 0; i < expectedPicks; i++) {
          const pick = matching[i]!;
          const ab = pick.ability as AbilityKey;
          if (!spec.from.includes(ab)) {
            issues.push({
              code: 'RACE_ASI_CHOOSE_INVALID_ABILITY',
              where,
              ability: ab,
              allowed: spec.from,
            });
            return false;
          }
          if (spec.excludedAbilities.has(ab)) {
            issues.push({ code: 'RACE_ASI_OVERLAP_WITH_FIXED', where, ability: ab });
            return false;
          }
          if (pickedAbilities.has(ab)) {
            issues.push({ code: 'ASI_DUPLICATE_ABILITY', ability: ab });
            return false;
          }
          pickedAbilities.add(ab);
          if (pick.bonus !== spec.amount) {
            issues.push({
              code: 'RACE_ASI_CHOOSE_WRONG_BONUS',
              where,
              ability: ab,
              expected: spec.amount,
              got: pick.bonus,
            });
            return false;
          }
          consumed.add(candidates[i]!);
        }
      } else {
        // Modo amount-alone (Custom Lineage): distribuir spec.amount puntos en
        // abilities distintas de spec.from. Los picks restantes deben sumar exacto.
        const pickedAbilities = new Set<AbilityKey>();
        let total = 0;
        for (let i = 0; i < remaining.length; i++) {
          const pick = remaining[i]!;
          const ab = pick.ability as AbilityKey;
          if (!spec.from.includes(ab)) {
            issues.push({
              code: 'RACE_ASI_CHOOSE_INVALID_ABILITY',
              where,
              ability: ab,
              allowed: spec.from,
            });
            return false;
          }
          if (spec.excludedAbilities.has(ab)) {
            issues.push({ code: 'RACE_ASI_OVERLAP_WITH_FIXED', where, ability: ab });
            return false;
          }
          if (pickedAbilities.has(ab)) {
            issues.push({ code: 'ASI_DUPLICATE_ABILITY', ability: ab });
            return false;
          }
          if (!Number.isInteger(pick.bonus) || pick.bonus < 1) {
            issues.push({
              code: 'RACE_ASI_CHOOSE_WRONG_BONUS',
              where,
              ability: ab,
              expected: 1,
              got: pick.bonus,
            });
            return false;
          }
          pickedAbilities.add(ab);
          total += pick.bonus;
          consumed.add(candidates[i]!);
        }
        if (total !== spec.amount) {
          issues.push({
            code: 'RACE_ASI_CHOOSE_WRONG_TOTAL',
            where,
            expected: spec.amount,
            got: total,
          });
          return false;
        }
      }
    }

    // 3) ¿Quedó algún ASI sin consumir? (extra no esperado).
    for (let i = 0; i < asis.length; i++) {
      if (!consumed.has(i)) {
        issues.push({
          code: 'ASI_MISMATCH',
          expected: [],
          got: [asis[i]!.bonus],
          note: `Extra ASI no esperado: ${asis[i]!.bonus} a ${asis[i]!.ability} (${where}).`,
        });
        return false;
      }
    }
    return true;
  };

  const raceOk = validateBlocks(raceBlocks, raceAsis, 'race');
  if (!raceOk) return { ok: false, issues };
  const subraceOk = validateBlocks(subraceBlocks, subraceAsis, 'subrace');
  if (!subraceOk) return { ok: false, issues };

  return finishWithSkillsAndFeats(
    input.appliedAsis.map((a) => ({
      ability: a.ability as AbilityKey,
      bonus: a.bonus,
      source: a.source,
    })),
    false,
    appliedLanguageChoices,
    input,
    raceData,
    subraceData,
  );
}

/**
 * Shared suffix for all ok-true paths in validateRaceSelection.
 * Runs skill choice validation + feat grant validation, then returns the final result.
 * Per decision #547: race feats BYPASS the `variantRules.feats === false` campaign toggle.
 */
function finishWithSkillsAndFeats(
  appliedAsis: AppliedAsi[],
  usedTashasCustomOrigin: boolean,
  appliedLanguageChoices: string[],
  input: ValidateRaceInput,
  raceData: RaceCompendiumData,
  subraceData: SubraceCompendiumData | null | undefined,
): RaceValidationResult {
  // ---- 6) Skill choices validation ----------------------------------------
  const skillResult = validateRaceSkillChoices({
    race: raceData,
    // exactOptionalPropertyTypes: pass null instead of undefined
    ...(subraceData !== undefined ? { subrace: subraceData } : {}),
    choices: input.skillChoices ?? [],
  });
  if (skillResult.issues.length > 0) {
    return { ok: false, issues: skillResult.issues };
  }

  // ---- 7) Feat grant validation -------------------------------------------
  const expectedFeatCount =
    sumAnyFeats(raceData.feats) + sumAnyFeats(subraceData?.feats);

  let appliedFeat: AppliedFeat | null = null;
  if (expectedFeatCount > 0) {
    if (!input.featChoice || !input.featContext) {
      // Missing feat pick for a race that requires one.
      const raceSrc = subraceData?.feats && sumAnyFeats(subraceData.feats) > 0
        ? { slug: subraceData.slug, source: subraceData.source }
        : { slug: raceData.slug, source: raceData.source };
      return {
        ok: false,
        issues: [{ code: 'RACE_FEAT_REQUIRED', race: raceSrc }],
      };
    }

    if (expectedFeatCount > 1) {
      // PHB has no race granting > 1 feat; defensive guard.
      return {
        ok: false,
        issues: [{
          code: 'RACE_CHOOSE_SHAPE_UNSUPPORTED',
          where: 'race',
          slug: raceData.slug,
          source: raceData.source,
        }],
      };
    }

    // Per decision #547: bypass variantRules.feats toggle for racial feats.
    // We build a synthetic rulesProfile with feats forced to true.
    const bypassProfile: typeof input.rulesProfile = {
      ...input.rulesProfile,
      variantRules: { ...input.rulesProfile.variantRules, feats: true },
    };

    const featResult = validateFeatSelection({
      featData: input.featChoice.featData,
      rulesProfile: bypassProfile,
      ctx: input.featContext,
      // exactOptionalPropertyTypes: only pass asiChoice when defined
      ...(input.featChoice.asiChoice !== undefined
        ? { asiChoice: input.featChoice.asiChoice }
        : {}),
    });

    if (!featResult.ok) {
      return {
        ok: false,
        issues: [{
          code: 'RACE_FEAT_INVALID',
          feat: {
            slug: input.featChoice.featData.slug,
            source: input.featChoice.featData.source,
          },
          wrapped: featResult.issues,
        }],
      };
    }
    appliedFeat = featResult.appliedFeat;
  }

  return {
    ok: true,
    appliedAsis,
    usedTashasCustomOrigin,
    appliedLanguageChoices,
    appliedFeat,
    appliedSkillChoices: skillResult.applied,
  };
}

/**
 * Multiset de bonuses esperados sumando race + subrace.
 * - fixed: cada entry contribuye su bonus.
 * - choose count+amount: contribuye `count` copias de `amount`.
 * - choose amount-alone: contribuye una sola entry de `amount` (flexible, el user
 *   puede distribuir como prefiera bajo Tasha's).
 *
 * Si la raza está vacía (MPMM convention), devolvemos el bag MPMM por default.
 */
function computeBag(
  raceBlocks: ProcessedBlock[],
  subraceBlocks: ProcessedBlock[],
): number[] {
  const bag: number[] = [];
  const allBlocks = [...raceBlocks, ...subraceBlocks];

  // MPMM: race vacía y subrace vacía → bag default.
  if (raceBlocks.length === 0 && subraceBlocks.length === 0) {
    return [...MPMM_DEFAULT_BAG];
  }

  for (const block of allBlocks) {
    for (const f of block.fixed) bag.push(f.bonus);
    if (block.choose) {
      if (block.choose.count !== null) {
        for (let i = 0; i < block.choose.count; i++) bag.push(block.choose.amount);
      } else {
        // amount-alone: lo tratamos como una sola entry (el user redistribuye libre).
        bag.push(block.choose.amount);
      }
    }
  }
  return bag;
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

function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

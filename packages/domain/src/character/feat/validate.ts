import { ABILITY_KEYS, type AbilityKey } from '../stats/types.js';
import type { RulesProfile } from '../../rules-profile/types.js';
import type {
  AppliedFeat,
  CharacterFeatContext,
  FeatAbilityBlock,
  FeatCompendiumData,
  FeatPrereqBlock,
  FeatValidationIssue,
  FeatValidationResult,
} from './types.js';

function entityKey(slug: string, source: string): string {
  return `${slug}|${source}`;
}

function isAbilityKey(s: string): s is AbilityKey {
  return (ABILITY_KEYS as readonly string[]).includes(s);
}

/**
 * Evalúa si un único prereq block se cumple para el character context.
 * Devuelve los issues si no se cumple, [] si OK.
 */
function evaluatePrereqBlock(
  block: FeatPrereqBlock,
  ctx: CharacterFeatContext,
): FeatValidationIssue[] {
  const issues: FeatValidationIssue[] = [];

  // ---- ability: array de Partial<AbilityScores>. UNO debe cumplirse. -----
  if (block.ability && block.ability.length > 0) {
    const meetsAny = block.ability.some((req) => {
      // Within an entry, all keys must be met.
      return Object.entries(req).every(([k, v]) => {
        if (!isAbilityKey(k)) return false;
        return ctx.effectiveScores[k] >= (v as number);
      });
    });
    if (!meetsAny) {
      issues.push({
        code: 'PREREQ_ABILITY_NOT_MET',
        required: block.ability,
        got: ctx.effectiveScores,
      });
    }
  }

  // ---- proficiency: array. UNA debe cumplirse. ---------------------------
  if (block.proficiency && block.proficiency.length > 0) {
    const meetsAny = block.proficiency.some((req) => {
      if (req.armor) {
        if (req.armor === 'medium') {
          return (
            ctx.armorProficiencies.includes('medium') ||
            ctx.armorProficiencies.includes('heavy') ||
            ctx.armorProficiencies.includes('all')
          );
        }
        if (req.armor === 'heavy') {
          return (
            ctx.armorProficiencies.includes('heavy') ||
            ctx.armorProficiencies.includes('all')
          );
        }
        return (
          ctx.armorProficiencies.includes(req.armor) ||
          ctx.armorProficiencies.includes('all')
        );
      }
      if (req.weapon) {
        return (
          ctx.weaponProficiencies.includes(req.weapon) ||
          (req.weapon === 'simple' && ctx.weaponProficiencies.includes('martial'))
        );
      }
      // Tools: chequeo aproximado (no tenemos un set normalizado).
      return false;
    });
    if (!meetsAny) {
      issues.push({
        code: 'PREREQ_PROFICIENCY_NOT_MET',
        required: block.proficiency,
        hint: 'El personaje no tiene la proficiencia requerida.',
      });
    }
  }

  // ---- race: lista de nombres. UNO debe coincidir. -----------------------
  if (block.race && block.race.length > 0) {
    // Soportamos solo match por slug/nombre exacto. "small race" (size-based)
    // requeriría info del compendio que no tenemos en el ctx — lo dejamos para 1.4f.2.
    const charRace = ctx.race?.slug?.toLowerCase() ?? null;
    const charRaceName = ctx.race?.name?.toLowerCase() ?? null;
    const expectedNames = block.race.map((r) => r.name.toLowerCase());
    const meetsAny = expectedNames.some(
      (n) => n === charRace || (charRaceName !== null && n === charRaceName),
    );
    if (!meetsAny) {
      issues.push({
        code: 'PREREQ_RACE_NOT_MET',
        required: expectedNames,
        gotRace: charRace,
      });
    }
  }

  // ---- spellcasting ------------------------------------------------------
  if (block.spellcasting === true) {
    if (!ctx.hasSpellcasting) {
      issues.push({ code: 'PREREQ_SPELLCASTING_NOT_MET' });
    }
  }

  // spellcasting2020 lo ignoramos (es la regla 2024).

  return issues;
}

/**
 * Resuelve el FeatAbility block + la elección del jugador en una lista plana
 * de ASIs aplicados.
 */
function resolveFeatAsis(
  abilityBlocks: FeatAbilityBlock[] | null | undefined,
  asiChoice: Array<{ ability: string; bonus: number }> | undefined,
): { ok: true; asis: Array<{ ability: AbilityKey; bonus: number }> } | { ok: false; issues: FeatValidationIssue[] } {
  const out: Array<{ ability: AbilityKey; bonus: number }> = [];

  if (!abilityBlocks || abilityBlocks.length === 0) {
    return { ok: true, asis: [] };
  }

  // Necesitamos saber si hay un `choose` block — si lo hay, el user debe proveer
  // la elección. Si todos son fijos, los aplicamos directo.
  let needsChoice = false;
  let expectedAmount = 0;
  let allowedFrom: string[] = [];

  for (const block of abilityBlocks) {
    if (block.choose) {
      needsChoice = true;
      expectedAmount = block.choose.amount ?? 1;
      allowedFrom = block.choose.from.map((s) => s.toLowerCase());
      break;
    }
    // Fixed contributions
    for (const k of ABILITY_KEYS) {
      const v = block[k];
      if (typeof v === 'number' && v !== 0) out.push({ ability: k, bonus: v });
    }
  }

  if (needsChoice) {
    if (!asiChoice || asiChoice.length === 0) {
      return {
        ok: false,
        issues: [
          {
            code: 'FEAT_ASI_REQUIRED',
            hint: `Este feat te deja elegir cómo distribuir ${expectedAmount} punto(s) entre [${allowedFrom.join(', ')}].`,
          },
        ],
      };
    }
    const totalBonus = asiChoice.reduce((s, c) => s + c.bonus, 0);
    if (totalBonus !== expectedAmount) {
      return {
        ok: false,
        issues: [
          {
            code: 'FEAT_ASI_INVALID',
            expectedAmount,
            gotAmount: totalBonus,
            from: allowedFrom,
          },
        ],
      };
    }
    const seen = new Set<AbilityKey>();
    for (const c of asiChoice) {
      if (!isAbilityKey(c.ability)) {
        return { ok: false, issues: [{ code: 'FEAT_ASI_UNKNOWN_ABILITY', ability: c.ability }] };
      }
      if (!allowedFrom.includes(c.ability)) {
        return {
          ok: false,
          issues: [
            { code: 'FEAT_ASI_INVALID', expectedAmount, gotAmount: totalBonus, from: allowedFrom },
          ],
        };
      }
      if (seen.has(c.ability)) {
        return {
          ok: false,
          issues: [
            { code: 'FEAT_ASI_INVALID', expectedAmount, gotAmount: totalBonus, from: allowedFrom },
          ],
        };
      }
      seen.add(c.ability);
      out.push({ ability: c.ability, bonus: c.bonus });
    }
  }

  return { ok: true, asis: out };
}

interface ValidateFeatInput {
  featData: FeatCompendiumData;
  rulesProfile: RulesProfile;
  ctx: CharacterFeatContext;
  /** Elección de ASI del jugador si el feat tiene un `choose` block en `ability`. */
  asiChoice?: Array<{ ability: string; bonus: number }>;
}

export function validateFeatSelection(input: ValidateFeatInput): FeatValidationResult {
  const issues: FeatValidationIssue[] = [];
  const { featData, rulesProfile, ctx } = input;

  // ---- 0) Feats habilitados ---------------------------------------------
  if (rulesProfile.variantRules.feats !== true) {
    issues.push({ code: 'FEATS_DISABLED_BY_CAMPAIGN' });
    return { ok: false, issues };
  }

  // ---- 1) Source + entity habilitada ------------------------------------
  if (rulesProfile.sources[featData.source] !== true) {
    issues.push({
      code: 'FEAT_DISABLED',
      feat: { slug: featData.slug, source: featData.source },
    });
  }
  if (rulesProfile.disabledEntities.feats.includes(entityKey(featData.slug, featData.source))) {
    issues.push({
      code: 'FEAT_DISABLED',
      feat: { slug: featData.slug, source: featData.source },
    });
  }

  // ---- 2) No duplicado --------------------------------------------------
  if (
    ctx.existingFeats.some(
      (f) => f.slug === featData.slug && f.source === featData.source,
    )
  ) {
    issues.push({
      code: 'FEAT_ALREADY_TAKEN',
      feat: { slug: featData.slug, source: featData.source },
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  // ---- 3) Prereqs: array OR. Al menos UN block debe cumplirse por completo
  // Si no hay prereqs definidos → cumple por default.
  if (featData.prerequisite && featData.prerequisite.length > 0) {
    let firstBlockIssues: FeatValidationIssue[] | null = null;
    let anyBlockMet = false;

    for (const block of featData.prerequisite) {
      const blockIssues = evaluatePrereqBlock(block, ctx);
      if (blockIssues.length === 0) {
        anyBlockMet = true;
        break;
      }
      if (firstBlockIssues === null) firstBlockIssues = blockIssues;
    }

    if (!anyBlockMet) {
      // Devolvemos los issues del PRIMER block (mensajes más concretos para el user).
      issues.push(...(firstBlockIssues ?? []));
      return { ok: false, issues };
    }
  }

  // ---- 4) Resolver ASIs del feat ----------------------------------------
  const asiResult = resolveFeatAsis(featData.ability, input.asiChoice);
  if (!asiResult.ok) return { ok: false, issues: asiResult.issues };

  return {
    ok: true,
    appliedFeat: {
      slug: featData.slug,
      source: featData.source,
      asisApplied: asiResult.asis,
    },
  };
}

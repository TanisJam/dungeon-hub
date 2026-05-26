import type { RulesProfile } from '../../rules-profile/types.js';
import type { AppliedAsi } from '../race/types.js';
import type { AbilityScores } from '../stats/types.js';
import type { ClassCompendiumData, SubclassCompendiumData } from '../class/types.js';
import { computeSubclassUnlockLevel } from '../class/validate.js';
import { computeEffectiveScores } from './effective-scores.js';
import { checkMulticlassPrereq } from './prereqs.js';
import { MULTICLASS_PROFICIENCIES } from './proficiencies.js';
import type { MulticlassValidationIssue, MulticlassValidationResult } from './types.js';
import type { AppliedClass } from '../class/types.js';

function entityKey(slug: string, source: string): string {
  return `${slug}|${source}`;
}

interface ValidateMulticlassInput {
  rulesProfile: RulesProfile;
  /** baseStats (pre-racial) del personaje. */
  baseStats?: AbilityScores | null;
  /** ASIs raciales ya aplicados. */
  asisApplied?: AppliedAsi[];
  /** Clases que el personaje ya tiene. Cada una con su slug. */
  existingClasses: Array<{ slug: string; source: string }>;
  /** Nueva clase a agregar como multiclass. */
  newClassData: ClassCompendiumData;
  /** Subclass para la nueva clase (solo si su unlock level = 1, como Cleric/Sorcerer/Warlock). */
  newSubclassData?: SubclassCompendiumData | null;
  /** Skills elegidas en multiclass (solo Bard/Ranger/Rogue las otorgan). */
  skillChoices?: string[];
  /**
   * CL-07: Tool choices for multiclass (e.g. Bard requires 1 musical instrument).
   * PHB p.164 — "One musical instrument of your choice".
   */
  toolChoices?: string[];
}

const DEFAULT_SUBCLASS_UNLOCK = 3;

export function validateMulticlassAddition(input: ValidateMulticlassInput): MulticlassValidationResult {
  const issues: MulticlassValidationIssue[] = [];
  const { rulesProfile, newClassData, newSubclassData, existingClasses } = input;
  const skillChoices = (input.skillChoices ?? []).map((s) => s.toLowerCase());

  // ---- 0) Multiclassing habilitado por el profile ------------------------
  if (rulesProfile.variantRules.multiclassing !== true) {
    issues.push({ code: 'MULTICLASS_DISABLED_BY_CAMPAIGN' });
    return { ok: false, issues };
  }

  // ---- 1) Source y entity habilitados ------------------------------------
  if (rulesProfile.sources[newClassData.source] !== true) {
    issues.push({
      code: 'CLASS_DISABLED',
      class: { slug: newClassData.slug, source: newClassData.source },
    });
  }
  if (
    rulesProfile.disabledEntities.classes.includes(
      entityKey(newClassData.slug, newClassData.source),
    )
  ) {
    issues.push({
      code: 'CLASS_DISABLED',
      class: { slug: newClassData.slug, source: newClassData.source },
    });
  }

  // ---- 2) No estar agregando la misma clase ya presente -----------------
  if (
    existingClasses.some(
      (c) => c.slug === newClassData.slug && c.source === newClassData.source,
    )
  ) {
    issues.push({
      code: 'CLASS_ALREADY_PRESENT',
      class: { slug: newClassData.slug, source: newClassData.source },
      hint: 'Para subir el nivel de una clase ya presente, usá el endpoint de level-up (Fase 1.8).',
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  // ---- 3) Need baseStats ------------------------------------------------
  if (!input.baseStats) {
    issues.push({
      code: 'NO_BASE_STATS',
      hint: 'El personaje no tiene baseStats todavía. Setealos con PUT /:id/stats antes de multiclassear.',
    });
    return { ok: false, issues };
  }

  // ---- 4) Compute effective scores y validar prereqs --------------------
  const effective = computeEffectiveScores(input.baseStats, input.asisApplied ?? []);

  const newCheck = checkMulticlassPrereq(newClassData.slug, effective);
  if (!newCheck) {
    // Sin entrada en la tabla — no podemos validar (probablemente homebrew).
    // Aceptamos por ahora pero emitimos warning explícito.
    issues.push({
      code: 'MULTICLASS_PROFS_TABLE_MISSING',
      classSlug: newClassData.slug,
      hint:
        `La clase "${newClassData.slug}" no está en la tabla canónica de multiclass (PHB p.163/164). ` +
        'Si es homebrew, agregala a packages/domain/src/character/multiclass/prereqs.ts y proficiencies.ts.',
    });
    return { ok: false, issues };
  }
  if (!newCheck.meetsAll) {
    issues.push({
      code: 'PREREQ_NOT_MET',
      class: { slug: newClassData.slug, source: newClassData.source },
      missing: newCheck.missing,
    });
  }

  // ---- 5) Verificar prereqs de clases EXISTENTES ------------------------
  // PHB regla: con multiclass, TODAS las clases deben cumplir su prereq.
  for (const existing of existingClasses) {
    const check = checkMulticlassPrereq(existing.slug, effective);
    if (check && !check.meetsAll) {
      issues.push({
        code: 'EXISTING_CLASS_PREREQ_BROKEN',
        class: { slug: existing.slug },
        missing: check.missing,
        hint:
          `Al multiclassear, todas las clases deben cumplir sus prereqs. ` +
          `"${existing.slug}" requiere ${check.missing
            .map((m) => `${m.ability.toUpperCase()} ≥ ${m.needed}`)
            .join(', ')}, ` +
          `pero los stats efectivos no llegan.`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // ---- 6) Subclass (level 1 multiclass — solo unlock-level-1 classes) ---
  const unlockLevel = computeSubclassUnlockLevel(newClassData) ?? DEFAULT_SUBCLASS_UNLOCK;
  const subclassUnlocked = 1 >= unlockLevel; // multiclass siempre arranca level 1

  if (subclassUnlocked && !newSubclassData) {
    issues.push({
      code: 'SUBCLASS_REQUIRED',
      classSlug: newClassData.slug,
      level: 1,
      unlockLevel,
    });
  } else if (!subclassUnlocked && newSubclassData) {
    issues.push({
      code: 'SUBCLASS_NOT_YET_AVAILABLE',
      classSlug: newClassData.slug,
      level: 1,
      unlockLevel,
    });
  } else if (newSubclassData) {
    if (rulesProfile.sources[newSubclassData.source] !== true) {
      issues.push({
        code: 'SUBCLASS_DISABLED',
        subclass: { slug: newSubclassData.slug, source: newSubclassData.source },
      });
    }
    if (
      rulesProfile.disabledEntities.subclasses.includes(
        entityKey(newSubclassData.slug, newSubclassData.source),
      )
    ) {
      issues.push({
        code: 'SUBCLASS_DISABLED',
        subclass: { slug: newSubclassData.slug, source: newSubclassData.source },
      });
    }
    if (
      newSubclassData.classSlug !== newClassData.slug ||
      newSubclassData.classSource !== newClassData.source
    ) {
      issues.push({
        code: 'SUBCLASS_DOES_NOT_BELONG_TO_CLASS',
        classSlug: newClassData.slug,
        classSource: newClassData.source,
        subclassClassSlug: newSubclassData.classSlug,
        subclassClassSource: newSubclassData.classSource,
      });
    }
  }

  // ---- 7) Skill choices del multiclass (Bard/Ranger/Rogue) --------------
  const mcProfs = MULTICLASS_PROFICIENCIES[newClassData.slug];
  if (!mcProfs) {
    issues.push({
      code: 'MULTICLASS_PROFS_TABLE_MISSING',
      classSlug: newClassData.slug,
      hint: 'Sin entrada en MULTICLASS_PROFICIENCIES — agregala a proficiencies.ts.',
    });
    return { ok: false, issues };
  }

  const expectedSkillCount = mcProfs.skillCount ?? 0;
  if (expectedSkillCount > 0) {
    if (skillChoices.length !== expectedSkillCount) {
      issues.push({
        code: 'MULTICLASS_SKILL_REQUIRED',
        classSlug: newClassData.slug,
        expectedCount: expectedSkillCount,
        gotCount: skillChoices.length,
        pool: mcProfs.skillPool ?? [],
      });
    }
    const seen = new Set<string>();
    for (const s of skillChoices) {
      if (seen.has(s)) {
        issues.push({ code: 'MULTICLASS_SKILL_DUPLICATE', skill: s });
        continue;
      }
      seen.add(s);
      if (mcProfs.skillPool && mcProfs.skillPool !== 'any') {
        if (!mcProfs.skillPool.includes(s)) {
          issues.push({
            code: 'MULTICLASS_SKILL_NOT_ALLOWED',
            classSlug: newClassData.slug,
            skill: s,
            pool: mcProfs.skillPool,
          });
        }
      }
    }
  }

  // ---- 7b) CL-07: Tool choices (e.g. Bard musical instrument) -------------
  // PHB p.164: "One musical instrument of your choice" for Bard multiclass.
  const toolChoiceSlots = mcProfs.toolChoices ?? [];
  const toolChoicesProvided = input.toolChoices ?? [];
  const expectedToolCount = toolChoiceSlots.reduce((sum, slot) => sum + slot.count, 0);

  if (expectedToolCount > 0) {
    if (toolChoicesProvided.length !== expectedToolCount) {
      issues.push({
        code: 'MULTICLASS_TOOL_REQUIRED',
        classSlug: newClassData.slug,
        expectedCount: expectedToolCount,
        gotCount: toolChoicesProvided.length,
        slots: toolChoiceSlots,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // ---- 8) Construir AppliedClass con profs REDUCIDAS --------------------
  const appliedClass: AppliedClass = {
    slug: newClassData.slug,
    source: newClassData.source,
    level: 1,
    subclass: newSubclassData
      ? { slug: newSubclassData.slug, source: newSubclassData.source }
      : null,
    hitDie: `d${newClassData.hd.faces}`,
    // Saving throws NO se ganan al multiclassear (PHB p.164).
    savingThrows: [],
    armorProficiencies: [...mcProfs.armor],
    weaponProficiencies: [...mcProfs.weapons],
    // CL-07: include collected tool choices alongside fixed tools.
    toolProficiencies: [...mcProfs.tools, ...toolChoicesProvided],
    skillChoices,
  };

  return { ok: true, appliedClass };
}

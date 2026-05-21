import type { RulesProfile } from '../../rules-profile/types.js';
import type {
  ClassCompendiumData,
  ClassValidationIssue,
  ClassValidationResult,
  SubclassCompendiumData,
} from './types.js';

function entityKey(slug: string, source: string): string {
  return `${slug}|${source}`;
}

/**
 * Extrae el nivel al que la clase desbloquea su subclass.
 *
 * 5etools codifica `classFeatures` como strings con formato:
 *   "Feature Name|Class|ClassSource|Level"  o
 *   "Feature Name|Class|ClassSource|Level|FeatureSource"
 *
 * El feature cuyo Name == subclassTitle de la clase es el que la desbloquea
 * (ej. "Arcane Tradition" para Wizard a nivel 2). Si no encuentra match,
 * devuelve null (cae al fallback del caller).
 */
export function computeSubclassUnlockLevel(classData: ClassCompendiumData): number | null {
  if (!classData.subclassTitle) return null;

  const title = classData.subclassTitle.toLowerCase();

  for (const f of classData.classFeatures) {
    const raw = typeof f === 'string' ? f : f.classFeature;
    if (!raw) continue;
    const parts = raw.split('|');
    const featureName = parts[0]?.toLowerCase() ?? '';
    if (featureName !== title) continue;
    const level = Number(parts[3]);
    if (Number.isFinite(level) && level >= 1 && level <= 20) return level;
  }

  return null;
}

/** Fallback razonable cuando no se puede derivar del data (raro). */
const DEFAULT_SUBCLASS_UNLOCK = 3;

interface ValidateClassInput {
  classData: ClassCompendiumData;
  subclassData?: SubclassCompendiumData | null;
  level: number;
  /** Skills elegidos por el jugador. */
  skillChoices?: string[];
  rulesProfile: RulesProfile;
}

export function validateClassSelection(input: ValidateClassInput): ClassValidationResult {
  const issues: ClassValidationIssue[] = [];
  const { classData, subclassData, level, rulesProfile } = input;
  const skillChoices = input.skillChoices ?? [];

  // ---- 1) Class habilitada en el profile ---------------------------------
  if (rulesProfile.sources[classData.source] !== true) {
    issues.push({
      code: 'CLASS_DISABLED',
      class: { slug: classData.slug, source: classData.source },
    });
  }
  if (
    rulesProfile.disabledEntities.classes.includes(entityKey(classData.slug, classData.source))
  ) {
    issues.push({
      code: 'CLASS_DISABLED',
      class: { slug: classData.slug, source: classData.source },
    });
  }

  // ---- 2) Level en rango -------------------------------------------------
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    issues.push({ code: 'LEVEL_OUT_OF_RANGE', level, min: 1, max: 20 });
  }

  // Cortocircuito si la clase o el nivel son inválidos.
  if (issues.length > 0) return { ok: false, issues };

  // ---- 3) Subclass unlock + selección ------------------------------------
  const unlockLevel = computeSubclassUnlockLevel(classData) ?? DEFAULT_SUBCLASS_UNLOCK;
  const subclassUnlocked = level >= unlockLevel;

  if (subclassUnlocked && !subclassData) {
    issues.push({
      code: 'SUBCLASS_REQUIRED',
      classSlug: classData.slug,
      level,
      unlockLevel,
    });
  } else if (!subclassUnlocked && subclassData) {
    issues.push({
      code: 'SUBCLASS_NOT_YET_AVAILABLE',
      classSlug: classData.slug,
      level,
      unlockLevel,
    });
  } else if (subclassData) {
    // Subclass habilitada en el profile + pertenece a la clase
    if (rulesProfile.sources[subclassData.source] !== true) {
      issues.push({
        code: 'SUBCLASS_DISABLED',
        subclass: { slug: subclassData.slug, source: subclassData.source },
      });
    }
    if (
      rulesProfile.disabledEntities.subclasses.includes(
        entityKey(subclassData.slug, subclassData.source),
      )
    ) {
      issues.push({
        code: 'SUBCLASS_DISABLED',
        subclass: { slug: subclassData.slug, source: subclassData.source },
      });
    }
    if (
      subclassData.classSlug !== classData.slug ||
      subclassData.classSource !== classData.source
    ) {
      issues.push({
        code: 'SUBCLASS_DOES_NOT_BELONG_TO_CLASS',
        classSlug: classData.slug,
        classSource: classData.source,
        subclassClassSlug: subclassData.classSlug,
        subclassClassSource: subclassData.classSource,
      });
    }
  }

  // ---- 4) Skill choices --------------------------------------------------
  const skillSpec = (classData.startingProficiencies.skills ?? [])[0] as
    | { choose?: { from: string[]; count: number } }
    | undefined;
  const expectedCount = skillSpec?.choose?.count ?? 0;
  const allowedSkills = (skillSpec?.choose?.from ?? []).map((s) => s.toLowerCase());

  if (expectedCount > 0) {
    // Validar cantidad
    if (skillChoices.length !== expectedCount) {
      issues.push({
        code: 'SKILL_CHOICES_REQUIRED',
        classSlug: classData.slug,
        expectedCount,
        gotCount: skillChoices.length,
      });
    }
    // Validar contenido
    const seen = new Set<string>();
    for (const skill of skillChoices) {
      const s = skill.toLowerCase();
      if (seen.has(s)) {
        issues.push({ code: 'SKILL_DUPLICATE', skill: s });
        continue;
      }
      seen.add(s);
      if (!allowedSkills.includes(s)) {
        issues.push({
          code: 'SKILL_NOT_IN_CLASS_LIST',
          classSlug: classData.slug,
          skill: s,
          allowed: allowedSkills,
        });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    appliedClass: {
      slug: classData.slug,
      source: classData.source,
      level,
      subclass: subclassData ? { slug: subclassData.slug, source: subclassData.source } : null,
      hitDie: `d${classData.hd.faces}`,
      savingThrows: [...classData.proficiency],
      armorProficiencies: [...(classData.startingProficiencies.armor ?? [])],
      weaponProficiencies: [...(classData.startingProficiencies.weapons ?? [])],
      toolProficiencies: [...(classData.startingProficiencies.tools ?? [])],
      skillChoices: skillChoices.map((s) => s.toLowerCase()),
    },
  };
}

import { ALL_SKILLS } from '../sheet/types.js';
import type { RulesProfile } from '../../rules-profile/types.js';
import type {
  AppliedBackground,
  BackgroundCompendiumData,
  BackgroundLanguageBlock,
  BackgroundSkillBlock,
  BackgroundToolBlock,
  BackgroundValidationIssue,
  BackgroundValidationResult,
} from './types.js';

function entityKey(slug: string, source: string): string {
  return `${slug}|${source}`;
}

/** Separa un block de skills en {fixed, chooseSpec}. */
function splitSkillBlock(block: BackgroundSkillBlock): {
  fixed: string[];
  choose: { from: string[]; count: number } | null;
} {
  const fixed: string[] = [];
  let choose: { from: string[]; count: number } | null = null;
  for (const [key, value] of Object.entries(block)) {
    if (key === 'choose' && value && typeof value === 'object') {
      const c = value as { from: string[]; count?: number };
      choose = { from: c.from.map((s) => s.toLowerCase()), count: c.count ?? 1 };
    } else if (key.startsWith('any') && typeof value === 'number') {
      const fixedSet = new Set(fixed);
      const pool = ALL_SKILLS.filter((s) => !fixedSet.has(s));
      if (!choose) {
        choose = { from: pool.slice(), count: value };
      } else {
        choose.count += value;
        for (const s of pool) {
          if (!choose.from.includes(s)) choose.from.push(s);
        }
      }
    } else if (value === true) {
      fixed.push(key.toLowerCase());
    }
  }
  return { fixed, choose };
}

/** Separa un block de languages en {fixed, anyCounts}. */
function splitLanguageBlock(block: BackgroundLanguageBlock): {
  fixed: string[];
  anyCount: number; // suma de anyStandard + anyExotic + any
} {
  const fixed: string[] = [];
  let anyCount = 0;
  for (const [key, value] of Object.entries(block)) {
    if (key === 'anyStandard' || key === 'anyExotic' || key === 'any') {
      if (typeof value === 'number') anyCount += value;
    } else if (value === true) {
      fixed.push(key.toLowerCase());
    }
  }
  return { fixed, anyCount };
}

/** Separa un block de tools. Devuelve fijos + counts por "any-kind". */
function splitToolBlock(block: BackgroundToolBlock): {
  fixed: string[];
  /** Mapa "anyGamingSet" → N, "anyArtisansTool" → N, etc. */
  anyCounts: Record<string, number>;
} {
  const fixed: string[] = [];
  const anyCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(block)) {
    if (key.startsWith('any') && typeof value === 'number') {
      anyCounts[key] = (anyCounts[key] ?? 0) + value;
    } else if (value === true) {
      fixed.push(key.toLowerCase());
    }
  }
  return { fixed, anyCounts };
}

interface ValidateBackgroundInput {
  backgroundData: BackgroundCompendiumData;
  rulesProfile: RulesProfile;
  /**
   * Skills elegidos por el jugador para llenar los choose blocks del background.
   * Solo necesario si el background tiene `choose`.
   */
  skillChoices?: string[];
  /** Idiomas elegidos por el jugador (para satisfacer anyStandard/anyExotic/any). */
  languageChoices?: string[];
  /** Tools elegidos. Mapa "anyGamingSet" → ["dice set"], "anyArtisansTool" → ["...tools"], etc. */
  toolChoices?: Record<string, string[]>;
}

export function validateBackgroundSelection(input: ValidateBackgroundInput): BackgroundValidationResult {
  const issues: BackgroundValidationIssue[] = [];
  const { backgroundData, rulesProfile } = input;
  const skillChoices = (input.skillChoices ?? []).map((s) => s.toLowerCase());
  const languageChoices = (input.languageChoices ?? []).map((s) => s.toLowerCase());
  const toolChoices = input.toolChoices ?? {};

  // ---- 1) Background habilitado ----------------------------------------
  if (rulesProfile.sources[backgroundData.source] !== true) {
    issues.push({
      code: 'BACKGROUND_DISABLED',
      background: { slug: backgroundData.slug, source: backgroundData.source },
    });
  }
  if (
    rulesProfile.disabledEntities.backgrounds.includes(
      entityKey(backgroundData.slug, backgroundData.source),
    )
  ) {
    issues.push({
      code: 'BACKGROUND_DISABLED',
      background: { slug: backgroundData.slug, source: backgroundData.source },
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  // ---- 2) Skills --------------------------------------------------------
  const allSkillsFixed: string[] = [];
  let totalSkillChooseCount = 0;
  const allowedSkillChoosePool = new Set<string>();

  for (const block of backgroundData.skillProficiencies ?? []) {
    const { fixed, choose } = splitSkillBlock(block);
    allSkillsFixed.push(...fixed);
    if (choose) {
      totalSkillChooseCount += choose.count;
      choose.from.forEach((s) => allowedSkillChoosePool.add(s));
    }
  }

  if (totalSkillChooseCount > 0) {
    if (skillChoices.length !== totalSkillChooseCount) {
      issues.push({
        code: 'BACKGROUND_SKILL_CHOICES_REQUIRED',
        expectedCount: totalSkillChooseCount,
        gotCount: skillChoices.length,
        allowed: [...allowedSkillChoosePool].sort(),
      });
    }
    const seen = new Set<string>();
    for (const skill of skillChoices) {
      if (seen.has(skill)) {
        issues.push({ code: 'BACKGROUND_SKILL_DUPLICATE', skill });
        continue;
      }
      seen.add(skill);
      if (allSkillsFixed.includes(skill)) {
        // Una skill choose no puede duplicar una skill que el background ya da fija
        issues.push({ code: 'BACKGROUND_SKILL_DUPLICATE', skill });
        continue;
      }
      if (!allowedSkillChoosePool.has(skill)) {
        issues.push({
          code: 'BACKGROUND_SKILL_NOT_ALLOWED',
          skill,
          allowed: [...allowedSkillChoosePool].sort(),
        });
      }
    }
  }

  // ---- 3) Languages -----------------------------------------------------
  const allLanguagesFixed: string[] = [];
  let totalLangAnyCount = 0;
  for (const block of backgroundData.languageProficiencies ?? []) {
    const { fixed, anyCount } = splitLanguageBlock(block);
    allLanguagesFixed.push(...fixed);
    totalLangAnyCount += anyCount;
  }

  if (totalLangAnyCount > 0) {
    if (languageChoices.length !== totalLangAnyCount) {
      issues.push({
        code: 'BACKGROUND_LANGUAGE_COUNT_MISMATCH',
        expectedCount: totalLangAnyCount,
        gotCount: languageChoices.length,
      });
    }
    const seen = new Set<string>();
    for (const lang of languageChoices) {
      if (seen.has(lang) || allLanguagesFixed.includes(lang)) {
        issues.push({ code: 'BACKGROUND_LANGUAGE_DUPLICATE', language: lang });
        continue;
      }
      seen.add(lang);
    }
  }

  // ---- 4) Tools ---------------------------------------------------------
  const allToolsFixed: string[] = [];
  const expectedToolCountsByKind: Record<string, number> = {};
  for (const block of backgroundData.toolProficiencies ?? []) {
    const { fixed, anyCounts } = splitToolBlock(block);
    allToolsFixed.push(...fixed);
    for (const [kind, n] of Object.entries(anyCounts)) {
      expectedToolCountsByKind[kind] = (expectedToolCountsByKind[kind] ?? 0) + n;
    }
  }

  for (const [kind, expected] of Object.entries(expectedToolCountsByKind)) {
    const got = (toolChoices[kind] ?? []).length;
    if (got !== expected) {
      issues.push({
        code: 'BACKGROUND_TOOL_COUNT_MISMATCH',
        kind,
        expectedCount: expected,
        gotCount: got,
      });
    }
  }
  const flatToolChoices = Object.values(toolChoices).flat().map((t) => t.toLowerCase());
  const seenTools = new Set<string>();
  for (const t of flatToolChoices) {
    if (seenTools.has(t) || allToolsFixed.includes(t)) {
      issues.push({ code: 'BACKGROUND_TOOL_DUPLICATE', tool: t });
      continue;
    }
    seenTools.add(t);
  }

  if (issues.length > 0) return { ok: false, issues };

  const applied: AppliedBackground = {
    slug: backgroundData.slug,
    source: backgroundData.source,
    skills: [...allSkillsFixed, ...skillChoices],
    languages: [...allLanguagesFixed, ...languageChoices],
    tools: [...allToolsFixed, ...flatToolChoices],
  };

  return { ok: true, appliedBackground: applied };
}

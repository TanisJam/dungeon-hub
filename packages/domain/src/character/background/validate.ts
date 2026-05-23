import { ALL_SKILLS } from '../sheet/types.js';
import type { RulesProfile } from '../../rules-profile/types.js';
import { expandToolFrom, patchAnyToolCount } from '../tool/pools.js';
import type {
  AppliedBackground,
  BackgroundCompendiumData,
  BackgroundLanguageBlock,
  BackgroundPackage,
  BackgroundSkillBlock,
  BackgroundToolBlock,
  BackgroundValidationIssue,
  BackgroundValidationResult,
  Customization,
  FeatureOption,
  MixedPoolShape,
  MixedPoolShapeKey,
  SkillToolLanguageProficienciesAlt,
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

/** Separa un block de tools. Devuelve fijos + counts por "any-kind" + choose pool. */
function splitToolBlock(block: BackgroundToolBlock): {
  fixed: string[];
  /** Mapa "anyGamingSet" → N, "anyArtisansTool" → N, etc. */
  anyCounts: Record<string, number>;
  /** choose-from-pool block expandido, o null si no existe. */
  choose: { from: string[]; count: number } | null;
} {
  const fixed: string[] = [];
  const anyCounts: Record<string, number> = {};
  let choose: { from: string[]; count: number } | null = null;
  for (const [key, value] of Object.entries(block)) {
    if (key === 'choose' && value && typeof value === 'object' && !Array.isArray(value)) {
      const c = value as { from: string[]; count?: number };
      choose = {
        from: expandToolFrom(c.from).map((s) => s.toLowerCase()),
        count: c.count ?? 1,
      };
    } else if (key.startsWith('any') && typeof value === 'number') {
      anyCounts[key] = (anyCounts[key] ?? 0) + value;
    } else if (value === true) {
      fixed.push(key.toLowerCase());
    }
  }
  return { fixed, anyCounts, choose };
}

// ── Slug helper ───────────────────────────────────────────────────────────────

/**
 * Converts a string to kebab-case (lowercase, spaces/punctuation → hyphens).
 * Used for feature slug derivation:
 *   kebab(bgName) + "-" + kebab(featureName.replace("Feature: ", ""))
 */
function toKebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // strip punctuation except spaces/hyphens
    .replace(/[\s_]+/g, '-')       // spaces → hyphens
    .replace(/-{2,}/g, '-')         // collapse multiple hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens
}

// ── A.9: splitMixedPoolBlock ─────────────────────────────────────────────────

/**
 * Parses the `skillToolLanguageProficiencies` field from a Custom Background
 * compendium entry and returns the three MixedPoolShape alternatives.
 *
 * Shape resolution rules (PHB p. 125):
 *   - Entry with only `anyLanguage` key → `lang2`
 *   - Entry with both `anyLanguage` and `anyTool` → `lang1tool1`
 *   - Entry with only `anyTool` key → `tool2`
 *
 * `anyTool` counts are patched from 1 → 2 via `patchAnyToolCount` to fix
 * the known 5etools data bug.
 *
 * Throws if an alternative contains an unrecognized key.
 */
export function splitMixedPoolBlock(
  field: SkillToolLanguageProficienciesAlt[],
): MixedPoolShape[] {
  return field.map((alt) => {
    const langCount = typeof alt['anyLanguage'] === 'number' ? alt['anyLanguage'] : 0;
    const rawToolCount = typeof alt['anyTool'] === 'number' ? alt['anyTool'] : 0;
    const toolCount = rawToolCount > 0 ? patchAnyToolCount(rawToolCount) : 0;

    const knownKeys = new Set(['anyLanguage', 'anyTool']);
    for (const key of Object.keys(alt)) {
      if (!knownKeys.has(key)) {
        throw new Error(
          `splitMixedPoolBlock: unrecognized key "${key}" in skillToolLanguageProficiencies alternative`,
        );
      }
    }

    let shapeKey: MixedPoolShapeKey;
    if (langCount > 0 && toolCount === 0) {
      shapeKey = 'lang2';
    } else if (langCount > 0 && toolCount > 0) {
      shapeKey = 'lang1tool1';
    } else if (langCount === 0 && toolCount > 0) {
      shapeKey = 'tool2';
    } else {
      throw new Error(
        `splitMixedPoolBlock: alternative with no recognized counts: ${JSON.stringify(alt)}`,
      );
    }

    return { shapeKey, langCount, toolCount };
  });
}

// ── A.11: splitEquipmentBlock ────────────────────────────────────────────────

/**
 * Builds the list of selectable equipment packages for the Custom Background
 * equipment picker.
 *
 * Each background with a non-empty `_` slot in its `startingEquipment` becomes
 * a selectable `BackgroundPackage`. Uppercase slot keys (`A`/`B`) are filtered
 * out per spec (only lowercase `a`/`b`/`c`/`d` alternatives are in scope).
 *
 * `coinAllowed` is always `true` for Custom Background (PHB p. 125).
 *
 * @param _startingEquipment - The Custom Background's own startingEquipment (ignored — Custom BG has no own equipment).
 * @param allBackgrounds - Full compendium list; packages are built from these.
 */
export function splitEquipmentBlock(
  _startingEquipment: Array<Record<string, unknown[]>> | null | undefined,
  allBackgrounds: BackgroundCompendiumData[],
): { packages: BackgroundPackage[]; coinAllowed: true } {
  const packages: BackgroundPackage[] = [];
  const LOWERCASE_SLOT_KEYS = new Set<string>(['a', 'b', 'c', 'd']);

  const renderItem = (item: unknown): string | null => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      if (typeof o.displayName === 'string') return o.displayName;
      if (typeof o.item === 'string') return o.item;
      if (typeof o.special === 'string') {
        const qty = typeof o.quantity === 'number' ? ` (×${o.quantity})` : '';
        return `${o.special}${qty}`;
      }
    }
    return null;
  };

  for (const bg of allBackgrounds) {
    const equip = bg.startingEquipment;
    if (!Array.isArray(equip) || equip.length === 0) continue;

    // 5etools shape: [{_: [...]}, {a: [...], b: [...]}]. Merge slot maps across objects.
    const merged: Record<string, unknown[]> = {};
    for (const slotObj of equip) {
      if (!slotObj || typeof slotObj !== 'object') continue;
      for (const [slot, items] of Object.entries(slotObj)) {
        if (!Array.isArray(items)) continue;
        (merged[slot] ??= []).push(...items);
      }
    }

    const alwaysGrantedRaw = merged['_'] ?? [];
    const alwaysGranted: string[] = alwaysGrantedRaw
      .map(renderItem)
      .filter((s): s is string => s !== null);

    const alternatives: Partial<Record<'a' | 'b' | 'c' | 'd', string[]>> = {};
    for (const slot of LOWERCASE_SLOT_KEYS) {
      const items = merged[slot];
      if (!items) continue;
      alternatives[slot as 'a' | 'b' | 'c' | 'd'] = items
        .map(renderItem)
        .filter((s): s is string => s !== null);
    }

    if (alwaysGranted.length === 0 && Object.keys(alternatives).length === 0) continue;

    packages.push({
      backgroundSlug: bg.slug,
      backgroundSource: bg.source,
      backgroundName: bg.name,
      alwaysGranted,
      alternatives,
    });
  }

  return { packages, coinAllowed: true };
}

// ── A.13: splitFeatureBlock ───────────────────────────────────────────────────

/**
 * Scans all backgrounds for entries where data.isFeature === true and
 * emits a FeatureOption[] for the Custom Background feature picker.
 *
 * Slug derivation rule (Mauricio's lock, #502):
 *   kebab(backgroundName) + "-" + kebab(featureName.replace("Feature: ", ""))
 *
 * Example: background "Acolyte", feature "Feature: Shelter of the Faithful"
 *   slug = "acolyte-shelter-of-the-faithful"
 *
 * Runtime uniqueness: if two features produce the same slug (from different
 * backgrounds), throws BACKGROUND_FEATURE_SLUG_COLLISION. This is a
 * developer-facing assertion, not a player-facing issue code.
 */
export function splitFeatureBlock(
  allBackgrounds: BackgroundCompendiumData[],
): { features: FeatureOption[] } {
  const slugMap = new Map<string, FeatureOption>();

  for (const bg of allBackgrounds) {
    if (!Array.isArray(bg.entries)) continue;

    for (const entry of bg.entries) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const data = e['data'] as Record<string, unknown> | undefined;
      if (!data || data['isFeature'] !== true) continue;

      const rawName = typeof e['name'] === 'string' ? e['name'] : '';
      if (!rawName) continue;

      const withoutPrefix = rawName.replace(/^Feature:\s*/i, '');
      const slug = `${toKebab(bg.name)}-${toKebab(withoutPrefix)}`;

      if (slugMap.has(slug)) {
        const existing = slugMap.get(slug)!;
        if (existing.sourceBackgroundSlug !== bg.slug) {
          throw new Error(
            `BACKGROUND_FEATURE_SLUG_COLLISION: slug "${slug}" is produced by both ` +
              `"${existing.sourceBackgroundSlug}" and "${bg.slug}". ` +
              `Add a source-suffix tie-breaker.`,
          );
        }
      }

      // Capture text from entries array
      const entryEntries = e['entries'];
      let text = '';
      if (Array.isArray(entryEntries) && entryEntries.length > 0) {
        const first = entryEntries[0];
        text = typeof first === 'string' ? first : JSON.stringify(first);
      }

      const feature: FeatureOption = {
        slug,
        sourceBackgroundSlug: bg.slug,
        sourceBackgroundSource: bg.source,
        name: rawName,
        text,
      };

      slugMap.set(slug, feature);
    }
  }

  return { features: Array.from(slugMap.values()) };
}

// ── A.15: Validation branches for Custom Background ──────────────────────────

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
  /** Custom Background customization choices (mixedPool, equipment, feature). */
  customization?: Customization;
  /** Full background compendium list — required for Custom Background validation. */
  allBackgrounds?: BackgroundCompendiumData[];
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
  // Skip the standard languageProficiencies validation for Custom Background when
  // skillToolLanguageProficiencies is present (F-01: 5etools data bug where Custom BG
  // incorrectly lists languageProficiencies=[{anyStandard:2}] — the mixed-pool block
  // replaces the language grant per PHB p.125). The mixed-pool validation in step 5 handles this.
  const skipLanguageValidation =
    backgroundData.slug === 'custom-background' &&
    (backgroundData.skillToolLanguageProficiencies?.length ?? 0) > 0;

  const allLanguagesFixed: string[] = [];
  let totalLangAnyCount = 0;

  if (!skipLanguageValidation) {
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
  }

  // ---- 4) Tools ---------------------------------------------------------
  const allToolsFixed: string[] = [];
  const expectedToolCountsByKind: Record<string, number> = {};
  const allowedToolChoosePool = new Set<string>();
  let totalToolChooseCount = 0;

  for (const block of backgroundData.toolProficiencies ?? []) {
    const { fixed, anyCounts, choose } = splitToolBlock(block);
    allToolsFixed.push(...fixed);
    for (const [kind, n] of Object.entries(anyCounts)) {
      expectedToolCountsByKind[kind] = (expectedToolCountsByKind[kind] ?? 0) + n;
    }
    if (choose) {
      totalToolChooseCount += choose.count;
      choose.from.forEach((s) => allowedToolChoosePool.add(s));
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

  if (totalToolChooseCount > 0) {
    const choosePicks = (toolChoices['choose'] ?? []).map((t) => t.toLowerCase());
    if (choosePicks.length !== totalToolChooseCount) {
      issues.push({
        code: 'BACKGROUND_TOOL_COUNT_MISMATCH',
        kind: 'choose',
        expectedCount: totalToolChooseCount,
        gotCount: choosePicks.length,
      });
    }
    for (const t of choosePicks) {
      if (!allowedToolChoosePool.has(t)) {
        issues.push({
          code: 'BACKGROUND_TOOL_NOT_ALLOWED',
          tool: t,
          allowed: [...allowedToolChoosePool].sort(),
        });
      }
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

  // ---- 5) Custom Background customization ----------------------------------
  // Only runs when the background has skillToolLanguageProficiencies (real Custom Background)
  // OR when customization was explicitly provided by the caller.
  const CUSTOM_BG_SLUG = 'custom-background';
  const hasCustomizationData =
    (backgroundData.skillToolLanguageProficiencies?.length ?? 0) > 0 ||
    input.customization !== undefined;
  if (backgroundData.slug === CUSTOM_BG_SLUG && hasCustomizationData) {
    const customization = input.customization;
    const allBackgrounds = input.allBackgrounds ?? [];

    // ---- 5a) Mixed Pool --------------------------------------------------
    const mixedPoolShapes = backgroundData.skillToolLanguageProficiencies
      ? splitMixedPoolBlock(backgroundData.skillToolLanguageProficiencies)
      : [];

    if (!customization?.mixedPool) {
      issues.push({ code: 'BACKGROUND_MIXED_POOL_SHAPE_REQUIRED' });
    } else {
      const { shape, langs, tools } = customization.mixedPool;
      const matchedShape = mixedPoolShapes.find((s) => s.shapeKey === shape);
      if (!matchedShape) {
        issues.push({ code: 'BACKGROUND_MIXED_POOL_SHAPE_REQUIRED' });
      } else {
        if (langs.length !== matchedShape.langCount) {
          issues.push({
            code: 'BACKGROUND_MIXED_POOL_COUNT_MISMATCH',
            axis: 'langs',
            expectedCount: matchedShape.langCount,
            gotCount: langs.length,
          });
        }
        if (tools.length !== matchedShape.toolCount) {
          issues.push({
            code: 'BACKGROUND_MIXED_POOL_COUNT_MISMATCH',
            axis: 'tools',
            expectedCount: matchedShape.toolCount,
            gotCount: tools.length,
          });
        }
      }
    }

    // ---- 5b) Equipment ---------------------------------------------------
    if (!customization?.equipment) {
      issues.push({ code: 'BACKGROUND_EQUIPMENT_REQUIRED' });
    } else if (customization.equipment.kind === 'package') {
      const { backgroundSlug, backgroundSource } = customization.equipment;
      const exists = allBackgrounds.some(
        (b) => b.slug === backgroundSlug && b.source === backgroundSource,
      );
      if (!exists) {
        issues.push({
          code: 'BACKGROUND_EQUIPMENT_BACKGROUND_UNKNOWN',
          backgroundSlug,
          backgroundSource,
        });
      }
    }
    // kind === 'coin' → no further check needed

    // ---- 5c) Feature -----------------------------------------------------
    if (!customization?.feature) {
      issues.push({ code: 'BACKGROUND_FEATURE_REQUIRED' });
    } else {
      const { features } = splitFeatureBlock(allBackgrounds);
      const featureExists = features.some((f) => f.slug === customization.feature!.slug);
      if (!featureExists) {
        issues.push({ code: 'BACKGROUND_FEATURE_UNKNOWN', slug: customization.feature.slug });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  const applied: AppliedBackground = {
    slug: backgroundData.slug,
    source: backgroundData.source,
    skills: [...allSkillsFixed, ...skillChoices],
    languages: [...allLanguagesFixed, ...languageChoices],
    tools: [...allToolsFixed, ...flatToolChoices],
  };

  if (input.customization !== undefined) {
    applied.customization = input.customization;
  }

  return { ok: true, appliedBackground: applied };
}

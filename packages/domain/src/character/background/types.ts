/**
 * Shape de un skillProficiencies block en 5etools:
 *   - keys directos (str → bool) = skills fijas
 *   - `choose: { from, count }` = N skills a elegir
 *   Pueden coexistir: { "history": true, "choose": { from: [...], count: 1 } }
 */
export interface BackgroundSkillBlock {
  choose?: { from: string[]; count?: number };
  [skillName: string]: boolean | { from: string[]; count?: number } | undefined;
}

/**
 * Shape de un languageProficiencies block:
 *   - `anyStandard: N` → user provee N idiomas standard
 *   - `anyExotic: N`   → user provee N exóticos
 *   - keys específicos (e.g., `elvish: true`)
 */
export interface BackgroundLanguageBlock {
  anyStandard?: number;
  anyExotic?: number;
  any?: number;
  [langName: string]: boolean | number | undefined;
}

/**
 * Shape de un toolProficiencies block:
 *   - `anyGamingSet: N`, `anyArtisansTool: N`, `anyMusicalInstrument: N`
 *   - keys específicos: `"thieves' tools": true`
 *   - `choose: { from: string[], count?: number }` — 5etools choose-from-pool shape
 */
export interface BackgroundToolBlock {
  anyGamingSet?: number;
  anyArtisansTool?: number;
  anyMusicalInstrument?: number;
  any?: number;
  choose?: { from: string[]; count?: number };
  [toolName: string]: boolean | number | { from: string[]; count?: number } | undefined;
}

/**
 * One alternative from the Custom Background `skillToolLanguageProficiencies` field.
 * Each key is a pool identifier (e.g. `anyLanguage`, `anyTool`) and its value is
 * the count of proficiencies the player must select from that pool.
 */
export type SkillToolLanguageProficienciesAlt = Record<string, number>;

/**
 * The `shapeKey` enum for Custom Background mixed-pool alternatives.
 * - `lang2`:      2 language picks
 * - `lang1tool1`: 1 language + 1 tool
 * - `tool2`:      2 tool picks
 */
export type MixedPoolShapeKey = 'lang2' | 'lang1tool1' | 'tool2';

/**
 * Parsed representation of one Custom Background mixed-pool alternative.
 */
export interface MixedPoolShape {
  shapeKey: MixedPoolShapeKey;
  langCount: number;
  toolCount: number;
}

/**
 * A background's starting-equipment package, as a selectable option
 * in the Custom Background equipment picker.
 *
 * `alwaysGranted` — raw item text from the `_` slot (always given).
 * `alternatives`  — `a`/`b`/`c`/`d` slot items; player picks one slot.
 *                   Uppercase keys (`A`/`B`) are filtered out (out of scope).
 */
export interface BackgroundPackage {
  backgroundSlug: string;
  backgroundSource: string;
  backgroundName: string;
  alwaysGranted: string[];
  alternatives: Partial<Record<'a' | 'b' | 'c' | 'd', string[]>>;
}

/**
 * A single feature option in the Custom Background feature picker.
 * Slug rule: kebab(backgroundName) + "-" + kebab(featureName.replace("Feature: ", "")).
 */
export interface FeatureOption {
  slug: string;
  sourceBackgroundSlug: string;
  sourceBackgroundSource: string;
  name: string;
  text: string;
}

/**
 * The `customization` sub-object stored under `AppliedBackground`.
 * All axes optional so legacy saves (pre-Custom-Background) remain valid.
 */
export interface Customization {
  mixedPool?: {
    shape: MixedPoolShapeKey;
    langs: string[];
    tools: string[];
  };
  equipment?:
    | { kind: 'package'; backgroundSlug: string; backgroundSource: string; choiceSlot?: 'a' | 'b' | 'c' | 'd' }
    | { kind: 'coin' };
  feature?: { slug: string };
}

export interface BackgroundCompendiumData {
  slug: string;
  source: string;
  name: string;
  skillProficiencies?: BackgroundSkillBlock[] | null;
  languageProficiencies?: BackgroundLanguageBlock[] | null;
  toolProficiencies?: BackgroundToolBlock[] | null;
  /** Custom Background only — 3-alternative shape picker (PHB p. 125). */
  skillToolLanguageProficiencies?: SkillToolLanguageProficienciesAlt[] | null;
  /** Raw starting equipment from 5etools (slot map). */
  startingEquipment?: Record<string, unknown[]> | null;
  /** Background entries (features, etc.) from 5etools. */
  entries?: unknown[] | null;
}

export type BackgroundValidationIssue =
  | { code: 'BACKGROUND_NOT_FOUND'; background: { slug: string; source: string } }
  | { code: 'BACKGROUND_DISABLED'; background: { slug: string; source: string } }
  | {
      code: 'BACKGROUND_SKILL_CHOICES_REQUIRED';
      expectedCount: number;
      gotCount: number;
      allowed: string[];
    }
  | { code: 'BACKGROUND_SKILL_NOT_ALLOWED'; skill: string; allowed: string[] }
  | { code: 'BACKGROUND_SKILL_DUPLICATE'; skill: string }
  | {
      code: 'BACKGROUND_LANGUAGE_COUNT_MISMATCH';
      expectedCount: number;
      gotCount: number;
    }
  | { code: 'BACKGROUND_LANGUAGE_DUPLICATE'; language: string }
  | {
      code: 'BACKGROUND_TOOL_COUNT_MISMATCH';
      kind: string;
      expectedCount: number;
      gotCount: number;
    }
  | { code: 'BACKGROUND_TOOL_DUPLICATE'; tool: string }
  | { code: 'BACKGROUND_TOOL_NOT_ALLOWED'; tool: string; allowed: string[] }
  // ── Custom Background customization issue codes (A.7) ──────────────────────
  | { code: 'BACKGROUND_MIXED_POOL_SHAPE_REQUIRED' }
  | {
      code: 'BACKGROUND_MIXED_POOL_COUNT_MISMATCH';
      axis: 'langs' | 'tools';
      expectedCount: number;
      gotCount: number;
    }
  | { code: 'BACKGROUND_EQUIPMENT_REQUIRED' }
  | { code: 'BACKGROUND_EQUIPMENT_BACKGROUND_UNKNOWN'; backgroundSlug: string; backgroundSource: string }
  | { code: 'BACKGROUND_FEATURE_REQUIRED' }
  | { code: 'BACKGROUND_FEATURE_UNKNOWN'; slug: string };

export interface AppliedBackground {
  slug: string;
  source: string;
  skills: string[];
  languages: string[];
  tools: string[];
  /** Custom Background customization choices. Undefined for all non-custom backgrounds. */
  customization?: Customization;
}

export type BackgroundValidationResult =
  | { ok: true; appliedBackground: AppliedBackground }
  | { ok: false; issues: BackgroundValidationIssue[] };

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
 */
export interface BackgroundToolBlock {
  anyGamingSet?: number;
  anyArtisansTool?: number;
  anyMusicalInstrument?: number;
  any?: number;
  [toolName: string]: boolean | number | undefined;
}

export interface BackgroundCompendiumData {
  slug: string;
  source: string;
  name: string;
  skillProficiencies?: BackgroundSkillBlock[] | null;
  languageProficiencies?: BackgroundLanguageBlock[] | null;
  toolProficiencies?: BackgroundToolBlock[] | null;
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
  | { code: 'BACKGROUND_TOOL_DUPLICATE'; tool: string };

export interface AppliedBackground {
  slug: string;
  source: string;
  skills: string[];
  languages: string[];
  tools: string[];
}

export type BackgroundValidationResult =
  | { ok: true; appliedBackground: AppliedBackground }
  | { ok: false; issues: BackgroundValidationIssue[] };

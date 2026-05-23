// Parser para el shape de backgrounds del compendium 5etools.

import { ALL_SKILLS } from '@dungeon-hub/domain/character/sheet';
import { expandToolFrom } from '@dungeon-hub/domain/character/tool';

export type SkillBlock = {
  choose?: { from: string[]; count?: number };
  [k: string]: boolean | { from: string[]; count?: number } | undefined;
};

export type LangBlock = {
  anyStandard?: number;
  anyExotic?: number;
  any?: number;
  [k: string]: boolean | number | undefined;
};

export type ToolBlock = {
  anyGamingSet?: number;
  anyArtisansTool?: number;
  anyMusicalInstrument?: number;
  any?: number;
  choose?: { from: string[]; count?: number };
  [k: string]: boolean | number | { from: string[]; count?: number } | undefined;
};

export type BackgroundData = {
  name: string;
  source: string;
  page?: number;
  skillProficiencies?: SkillBlock[] | null;
  languageProficiencies?: LangBlock[] | null;
  toolProficiencies?: ToolBlock[] | null;
  entries?: unknown[];
};

export type ParsedBackground = {
  fixedSkills: string[];
  skillChoose: { from: string[]; count: number } | null;
  fixedLanguages: string[];
  /** Map de "anyStandard|anyExotic|any" → cuántos pickear. */
  languageChooseCounts: Record<string, number>;
  fixedTools: string[];
  /** Map de "anyGamingSet|anyArtisansTool|...|any" → cuántos pickear. */
  toolChooseCounts: Record<string, number>;
  /** choose:{from,count} block expanded to concrete slugs, or null if not present. */
  toolChoose: { from: string[]; count: number } | null;
};

export function parseBackground(data: BackgroundData): ParsedBackground {
  const out: ParsedBackground = {
    fixedSkills: [],
    skillChoose: null,
    fixedLanguages: [],
    languageChooseCounts: {},
    fixedTools: [],
    toolChooseCounts: {},
    toolChoose: null,
  };

  // ---- Skills
  for (const block of data.skillProficiencies ?? []) {
    for (const [k, v] of Object.entries(block)) {
      if (k === 'choose' && typeof v === 'object' && v !== null) {
        const c = v as { from: string[]; count?: number };
        // Si vienen varios choose en distintos blocks, los acumulamos
        if (!out.skillChoose) {
          out.skillChoose = { from: [...c.from], count: c.count ?? 1 };
        } else {
          out.skillChoose.count += c.count ?? 1;
          for (const s of c.from) {
            if (!out.skillChoose.from.includes(s)) out.skillChoose.from.push(s);
          }
        }
      } else if (typeof v === 'number' && k.startsWith('any')) {
        // Numeric-any shape: {any:N} → synthesize skillChoose from ALL_SKILLS minus fixed
        const fixedLower = new Set(out.fixedSkills);
        const pool = ALL_SKILLS.filter((s) => !fixedLower.has(s));
        if (!out.skillChoose) {
          out.skillChoose = { from: [...pool], count: v };
        } else {
          out.skillChoose.count += v;
          for (const s of pool) {
            if (!out.skillChoose.from.includes(s)) out.skillChoose.from.push(s);
          }
        }
      } else if (v === true) {
        out.fixedSkills.push(k.toLowerCase());
      }
    }
  }

  // ---- Languages
  for (const block of data.languageProficiencies ?? []) {
    for (const [k, v] of Object.entries(block)) {
      if (typeof v === 'number' && k.startsWith('any')) {
        out.languageChooseCounts[k] = (out.languageChooseCounts[k] ?? 0) + v;
      } else if (v === true) {
        out.fixedLanguages.push(k.toLowerCase());
      }
    }
  }

  // ---- Tools
  for (const block of data.toolProficiencies ?? []) {
    for (const [k, v] of Object.entries(block)) {
      if (k === 'choose' && typeof v === 'object' && v !== null) {
        const c = v as { from: string[]; count?: number };
        const expanded = expandToolFrom(c.from);
        const count = c.count ?? 1;
        if (!out.toolChoose) {
          out.toolChoose = { from: expanded, count };
        } else {
          out.toolChoose.count += count;
          for (const s of expanded) {
            if (!out.toolChoose.from.includes(s)) out.toolChoose.from.push(s);
          }
        }
      } else if (typeof v === 'number' && k.startsWith('any')) {
        out.toolChooseCounts[k] = (out.toolChooseCounts[k] ?? 0) + v;
      } else if (v === true) {
        out.fixedTools.push(k.toLowerCase());
      }
    }
  }

  return out;
}

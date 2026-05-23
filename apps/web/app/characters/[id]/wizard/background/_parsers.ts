// Parser para el shape de backgrounds del compendium 5etools.

import { ALL_SKILLS } from '@dungeon-hub/domain/character/sheet';
import { expandToolFrom } from '@dungeon-hub/domain/character/tool';
import {
  splitMixedPoolBlock,
  splitEquipmentBlock,
  splitFeatureBlock,
} from '@dungeon-hub/domain/character/background';
import type {
  MixedPoolShape,
  BackgroundPackage,
  FeatureOption,
  BackgroundCompendiumData,
} from '@dungeon-hub/domain/character/background';

export type { BackgroundCompendiumData };

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
  slug?: string;
  page?: number;
  skillProficiencies?: SkillBlock[] | null;
  languageProficiencies?: LangBlock[] | null;
  toolProficiencies?: ToolBlock[] | null;
  skillToolLanguageProficiencies?: Array<Record<string, number>> | null;
  /** 5etools shape: array of slot-keyed objects, merged at consumption time. */
  startingEquipment?: Array<Record<string, unknown[]>> | null;
  entries?: unknown[];
};

export type ParsedCustomization = {
  mixedPool: MixedPoolShape[];
  equipment: { packages: BackgroundPackage[]; coinAllowed: true };
  feature: { features: FeatureOption[] };
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
  /** Custom Background customization data. Undefined for non-custom backgrounds. */
  customization?: ParsedCustomization;
};

const CUSTOM_BG_SLUG = 'custom-background';

export function parseBackground(
  data: BackgroundData,
  allBackgrounds?: BackgroundCompendiumData[],
): ParsedBackground {
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
  // PHB 125: Custom Background's mixed pool REPLACES the base language block.
  // 5etools ships both (data bug per audit #473 F-01) — skip the base when customization exists.
  const isCustomWithMixedPool =
    data.slug === CUSTOM_BG_SLUG && Array.isArray(data.skillToolLanguageProficiencies);
  const languageBlocks = isCustomWithMixedPool ? [] : (data.languageProficiencies ?? []);
  for (const block of languageBlocks) {
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

  // ---- Custom Background customization
  if (data.slug === CUSTOM_BG_SLUG && allBackgrounds && data.skillToolLanguageProficiencies) {
    const mixedPool = splitMixedPoolBlock(data.skillToolLanguageProficiencies);
    const equipment = splitEquipmentBlock(data.startingEquipment, allBackgrounds);
    const { features } = splitFeatureBlock(allBackgrounds);
    out.customization = { mixedPool, equipment, feature: { features } };
  }

  return out;
}

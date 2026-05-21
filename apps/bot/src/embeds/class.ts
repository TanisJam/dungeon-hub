import { EmbedBuilder } from 'discord.js';
import { titleCase } from '../utils.js';

export interface ClassRow {
  slug: string;
  source: string;
  name: string;
  data: FiveeClassData;
}

interface FiveeClassData {
  name: string;
  source: string;
  page?: number;
  hd?: { number: number; faces: number };
  proficiency?: string[];
  primaryAbility?: Array<Record<string, boolean>>;
  startingProficiencies?: {
    armor?: Array<string | { proficiency: string; full?: string }>;
    weapons?: Array<string | { proficiency: string; full?: string }>;
    tools?: Array<string | { full?: string }>;
    skills?: Array<{ choose?: { from: string[]; count?: number } } | string>;
  };
  classFeatures?: Array<string | { classFeature: string }>;
  subclassTitle?: string;
}

const ABILITY_NAMES: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

function formatHitDie(hd: FiveeClassData['hd']): string {
  if (!hd) return '—';
  return `d${hd.faces}`;
}

function formatPrimaryAbility(primary: FiveeClassData['primaryAbility']): string | null {
  if (!primary || primary.length === 0) return null;
  const abilities = new Set<string>();
  for (const entry of primary) {
    for (const [k, v] of Object.entries(entry)) {
      if (v === true && ABILITY_NAMES[k]) abilities.add(ABILITY_NAMES[k]);
    }
  }
  if (abilities.size === 0) return null;
  return Array.from(abilities).join(' or ');
}

function formatSaves(saves: string[] | undefined): string {
  if (!saves || saves.length === 0) return '—';
  return saves.map((s) => ABILITY_NAMES[s.toLowerCase()] ?? s.toUpperCase()).join(', ');
}

function formatProficiencyList(
  items:
    | Array<string | { proficiency?: string; full?: string }>
    | undefined,
): string {
  if (!items || items.length === 0) return 'none';
  return items
    .map((it) => {
      if (typeof it === 'string') return it;
      return it.full ?? it.proficiency ?? '—';
    })
    .join(', ');
}

type SkillEntry = string | { choose?: { from?: string[]; count?: number } };

function formatSkills(skills: SkillEntry[] | undefined): string {
  if (!skills || skills.length === 0) return 'none';
  const out: string[] = [];
  for (const s of skills) {
    if (typeof s === 'string') out.push(titleCase(s));
    else if (typeof s === 'object' && s.choose?.from) {
      const count = s.choose.count ?? 1;
      out.push(`Choose ${count} from: ${s.choose.from.map(titleCase).join(', ')}`);
    }
  }
  return out.length > 0 ? out.join(' · ') : 'none';
}

/**
 * Parse "Feature Name|Class|ClassSource|Level" → {name, level}.
 * Algunos entries vienen como `{ classFeature: "..." }`.
 */
function parseFeatureRef(ref: string | { classFeature: string }): { name: string; level: number } | null {
  const raw = typeof ref === 'string' ? ref : ref.classFeature;
  const parts = raw.split('|');
  if (parts.length < 4) return null;
  const name = parts[0] ?? '';
  const level = parseInt(parts[3] ?? '0', 10);
  if (!name || !Number.isFinite(level)) return null;
  return { name, level };
}

function groupFeaturesByLevel(
  features: FiveeClassData['classFeatures'] | undefined,
  maxLevel: number,
): Map<number, string[]> {
  const byLevel = new Map<number, string[]>();
  if (!features) return byLevel;
  for (const f of features) {
    const parsed = parseFeatureRef(f);
    if (!parsed) continue;
    if (parsed.level > maxLevel) continue;
    const list = byLevel.get(parsed.level) ?? [];
    list.push(parsed.name);
    byLevel.set(parsed.level, list);
  }
  return byLevel;
}

export function buildClassEmbed(klass: ClassRow, level: number | null): EmbedBuilder {
  const d = klass.data;
  const hd = formatHitDie(d.hd);
  const primary = formatPrimaryAbility(d.primaryAbility);

  const tagline = [`Hit Die: ${hd}`, primary ? `Primary: ${primary}` : null]
    .filter((x): x is string => Boolean(x))
    .join(' · ');

  const embed = new EmbedBuilder()
    .setTitle(klass.name)
    .setDescription(`*${tagline}*`)
    .setColor(0xc0392b); // red

  embed.addFields(
    { name: 'Saving Throws', value: formatSaves(d.proficiency), inline: true },
    {
      name: 'Armor',
      value: formatProficiencyList(d.startingProficiencies?.armor),
      inline: true,
    },
    {
      name: 'Weapons',
      value: formatProficiencyList(d.startingProficiencies?.weapons),
      inline: true,
    },
  );

  const tools = formatProficiencyList(d.startingProficiencies?.tools);
  if (tools !== 'none') {
    embed.addFields({ name: 'Tools', value: tools, inline: false });
  }

  embed.addFields({
    name: 'Skills',
    value: formatSkills(d.startingProficiencies?.skills as SkillEntry[] | undefined),
    inline: false,
  });

  // Si no se pidió level, mostramos features hasta 5 (entry-mid game). Si sí, hasta ese nivel.
  const targetLevel = level ?? 5;
  const byLevel = groupFeaturesByLevel(d.classFeatures, targetLevel);
  const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

  if (sortedLevels.length > 0) {
    const lines = sortedLevels.map((lv) => {
      const names = byLevel.get(lv)!.join(', ');
      return `**L${lv}:** ${names}`;
    });
    let text = lines.join('\n');
    if (text.length > 1000) text = text.slice(0, 999) + '…';
    embed.addFields({
      name: level ? `Features (up to level ${level})` : 'Features (up to level 5)',
      value: text,
    });
  }

  if (d.subclassTitle) {
    embed.addFields({ name: 'Subclass', value: d.subclassTitle, inline: true });
  }

  embed.setFooter({
    text: `${klass.source}${d.page ? ` p.${d.page}` : ''} · ${klass.slug}`,
  });

  return embed;
}

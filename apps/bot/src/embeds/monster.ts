import { EmbedBuilder } from 'discord.js';
import { flattenEntries, renderInline } from '../render-5etools.js';

export interface MonsterRow {
  slug: string;
  source: string;
  name: string;
  cr: string | null;
  crNumeric: string | null; // numeric() en drizzle viene como string
  type: string | null;
  size: string | null;
  data: FiveeMonsterData;
}

interface FiveeMonsterData {
  name: string;
  source: string;
  page?: number;
  size?: string[];
  type?: string | { type: string; tags?: string[] };
  alignment?: Array<string | { alignment?: string[]; chance?: number }>;
  ac?: Array<number | { ac: number; condition?: string; from?: string[] }>;
  hp?: { average?: number; formula?: string; special?: string };
  speed?: Record<string, number | { number: number; condition?: string } | boolean>;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  save?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', string>>;
  skill?: Record<string, string>;
  senses?: string[];
  passive?: number;
  languages?: string[];
  cr?: string | { cr: string; lair?: string; coven?: string };
  immune?: Array<string | { immune?: string[]; note?: string; cond?: boolean }>;
  resist?: Array<string | { resist?: string[]; note?: string; cond?: boolean }>;
  vulnerable?: Array<string | { vulnerable?: string[]; note?: string }>;
  conditionImmune?: Array<string | { conditionImmune?: string[]; note?: string }>;
  trait?: Array<{ name: string; entries: unknown[] }>;
  action?: Array<{ name: string; entries: unknown[] }>;
  reaction?: Array<{ name: string; entries: unknown[] }>;
  legendary?: Array<{ name: string; entries: unknown[] }>;
  legendaryHeader?: string[];
  spellcasting?: Array<Record<string, unknown>>;
  environment?: string[];
}

const SIZE_NAMES: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
  V: 'Varies',
};

const ALIGNMENT_NAMES: Record<string, string> = {
  L: 'lawful',
  N: 'neutral',
  C: 'chaotic',
  G: 'good',
  E: 'evil',
  A: 'any alignment',
  U: 'unaligned',
};

// Color por CR tier — visual cue de peligro.
const CR_COLOR_TIERS: Array<{ max: number; color: number }> = [
  { max: 1, color: 0x95a5a6 }, // gris (mooks)
  { max: 4, color: 0x27ae60 }, // verde (low)
  { max: 10, color: 0x3498db }, // azul (mid)
  { max: 16, color: 0x9b59b6 }, // morado (high)
  { max: 30, color: 0xe74c3c }, // rojo (deadly)
];

function colorForCr(crNumeric: string | null): number {
  if (!crNumeric) return 0x7f8c8d;
  const n = Number(crNumeric);
  for (const tier of CR_COLOR_TIERS) {
    if (n <= tier.max) return tier.color;
  }
  return 0xe74c3c;
}

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function formatType(raw: FiveeMonsterData['type']): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  const tags = raw.tags && raw.tags.length > 0 ? ` (${raw.tags.join(', ')})` : '';
  return `${raw.type}${tags}`;
}

function formatSize(raw: string[] | undefined): string {
  if (!raw || raw.length === 0) return '';
  return raw.map((s) => SIZE_NAMES[s] ?? s).join('/');
}

function formatAlignment(raw: FiveeMonsterData['alignment']): string {
  if (!raw || raw.length === 0) return '';
  const parts = raw
    .map((a) => {
      if (typeof a === 'string') return ALIGNMENT_NAMES[a] ?? a.toLowerCase();
      if (a.alignment) return a.alignment.map((x) => ALIGNMENT_NAMES[x] ?? x).join(' ');
      return '';
    })
    .filter(Boolean);
  return parts.join(' or ');
}

function formatAc(raw: FiveeMonsterData['ac']): string {
  if (!raw || raw.length === 0) return '—';
  return raw
    .map((entry) => {
      if (typeof entry === 'number') return String(entry);
      const from = entry.from && entry.from.length > 0 ? ` (${entry.from.join(', ')})` : '';
      const cond = entry.condition ? ` ${entry.condition}` : '';
      return `${entry.ac}${from}${cond}`;
    })
    .join(', ');
}

function formatHp(raw: FiveeMonsterData['hp']): string {
  if (!raw) return '—';
  if (raw.special) return raw.special;
  const formula = raw.formula ? ` (${raw.formula})` : '';
  return `${raw.average ?? '?'}${formula}`;
}

function formatSpeed(raw: FiveeMonsterData['speed']): string {
  if (!raw) return '—';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'boolean') continue; // canHover etc.
    if (typeof v === 'number') {
      if (k === 'walk') parts.unshift(`${v} ft.`);
      else parts.push(`${k} ${v} ft.`);
    } else if (v && typeof v === 'object' && typeof v.number === 'number') {
      const label = k === 'walk' ? `${v.number} ft.` : `${k} ${v.number} ft.`;
      const cond = v.condition ? ` ${v.condition}` : '';
      if (k === 'walk') parts.unshift(`${label}${cond}`);
      else parts.push(`${label}${cond}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

function formatSaves(raw: FiveeMonsterData['save']): string | null {
  if (!raw) return null;
  const parts = Object.entries(raw).map(([k, v]) => `${k.toUpperCase()} ${v}`);
  return parts.length > 0 ? parts.join(', ') : null;
}

function formatSkills(raw: FiveeMonsterData['skill']): string | null {
  if (!raw) return null;
  const parts = Object.entries(raw).map(
    ([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)} ${v}`,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Concatena un array que puede mezclar strings con objetos {X: [...], note, cond}. */
function flattenDamageList(
  raw: Array<string | Record<string, unknown>> | undefined,
  innerKey: string,
): string | null {
  if (!raw || raw.length === 0) return null;
  const parts: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      parts.push(entry);
    } else {
      const inner = entry[innerKey];
      if (Array.isArray(inner)) {
        const note = typeof entry['note'] === 'string' ? ` (${entry['note']})` : '';
        parts.push(`${(inner as string[]).join(', ')}${note}`);
      }
    }
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

/** Renderiza un array de {name, entries} a líneas markdown compactas. */
function formatNamedEntries(
  entries: Array<{ name: string; entries: unknown[] }> | undefined,
  maxTotal = 1000,
): string | null {
  if (!entries || entries.length === 0) return null;
  const lines: string[] = [];
  for (const e of entries) {
    const body = flattenEntries(e.entries, 300);
    if (body) lines.push(`**${e.name}.** ${body}`);
    else lines.push(`**${e.name}.**`);
  }
  const joined = lines.join('\n\n');
  return joined.length > maxTotal ? joined.slice(0, maxTotal - 1) + '…' : joined;
}

/**
 * Spellcasting block en 5etools tiene shape variable. Renderizamos
 * heuristicamente lo más útil: headerEntries + listas (will/daily/...).
 */
function formatSpellcasting(
  raw: Array<Record<string, unknown>> | undefined,
): string | null {
  if (!raw || raw.length === 0) return null;
  const out: string[] = [];
  for (const block of raw) {
    if (typeof block['name'] === 'string') out.push(`**${block['name']}.**`);
    const headers = block['headerEntries'];
    if (Array.isArray(headers)) {
      const txt = flattenEntries(headers, 250);
      if (txt) out.push(txt);
    }
    const at = block['at'];
    if (Array.isArray(at)) out.push(`At will: ${at.map((s) => renderInline(String(s))).join(', ')}`);
    const will = block['will'];
    if (Array.isArray(will))
      out.push(`At will: ${(will as unknown[]).map((s) => renderInline(String(s))).join(', ')}`);
    const daily = block['daily'];
    if (daily && typeof daily === 'object') {
      for (const [tier, spellsRaw] of Object.entries(daily)) {
        if (Array.isArray(spellsRaw)) {
          const label = tier.replace(/e$/, '/day each').replace(/^(\d+)$/, '$1/day');
          out.push(
            `${label}: ${(spellsRaw as unknown[]).map((s) => renderInline(String(s))).join(', ')}`,
          );
        }
      }
    }
    const spells = block['spells'];
    if (spells && typeof spells === 'object') {
      for (const [lvl, info] of Object.entries(spells)) {
        if (info && typeof info === 'object' && Array.isArray((info as { spells?: unknown[] }).spells)) {
          const slots = (info as { slots?: number }).slots ?? '?';
          const lvlLabel = lvl === '0' ? 'Cantrips' : `Level ${lvl} (${slots} slots)`;
          const spellList = ((info as { spells: unknown[] }).spells as unknown[])
            .map((s) => renderInline(String(s)))
            .join(', ');
          out.push(`${lvlLabel}: ${spellList}`);
        }
      }
    }
  }
  const joined = out.join('\n');
  return joined.length > 0 ? truncate(joined, 1020) : null;
}

export function buildMonsterEmbed(m: MonsterRow): EmbedBuilder {
  const d = m.data;
  const size = formatSize(d.size);
  const type = formatType(d.type);
  const align = formatAlignment(d.alignment);
  const cr = m.cr ?? '—';

  const taglineParts = [size, type, align ? `· ${align}` : null].filter(Boolean) as string[];
  const tagline = taglineParts.join(' ');

  const embed = new EmbedBuilder()
    .setTitle(`🐉 ${m.name}`)
    .setDescription(
      `*${tagline}*\n` +
        `**CR** ${cr} · **AC** ${formatAc(d.ac)} · **HP** ${formatHp(d.hp)}\n` +
        `**Speed** ${formatSpeed(d.speed)}`,
    )
    .setColor(colorForCr(m.crNumeric));

  // ---- Ability scores ----
  const abilities = (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const)
    .map((a) => {
      const sc = d[a];
      if (sc === undefined) return '';
      return `**${a.toUpperCase()}** ${sc} (${abilityMod(sc)})`;
    })
    .filter(Boolean)
    .join(' · ');
  if (abilities) embed.addFields({ name: 'Abilities', value: abilities });

  // ---- Saves + Skills (line-level meta) ----
  const meta: string[] = [];
  const saves = formatSaves(d.save);
  if (saves) meta.push(`**Saving Throws**: ${saves}`);
  const skills = formatSkills(d.skill);
  if (skills) meta.push(`**Skills**: ${skills}`);
  const immune = flattenDamageList(d.immune, 'immune');
  if (immune) meta.push(`**Damage Immunities**: ${immune}`);
  const resist = flattenDamageList(d.resist, 'resist');
  if (resist) meta.push(`**Damage Resistances**: ${resist}`);
  const vuln = flattenDamageList(d.vulnerable, 'vulnerable');
  if (vuln) meta.push(`**Damage Vulnerabilities**: ${vuln}`);
  const condImm = flattenDamageList(d.conditionImmune, 'conditionImmune');
  if (condImm) meta.push(`**Condition Immunities**: ${condImm}`);
  if (d.senses && d.senses.length > 0) {
    const senses = [...d.senses, ...(d.passive !== undefined ? [`passive Perception ${d.passive}`] : [])];
    meta.push(`**Senses**: ${senses.join(', ')}`);
  } else if (d.passive !== undefined) {
    meta.push(`**Senses**: passive Perception ${d.passive}`);
  }
  if (d.languages && d.languages.length > 0) {
    meta.push(`**Languages**: ${d.languages.join(', ')}`);
  }
  if (meta.length > 0) {
    embed.addFields({ name: '​', value: truncate(meta.join('\n'), 1020) });
  }

  // ---- Traits, Spellcasting, Actions, Reactions, Legendary ----
  const traits = formatNamedEntries(d.trait);
  if (traits) embed.addFields({ name: 'Traits', value: traits });

  const spellcasting = formatSpellcasting(d.spellcasting);
  if (spellcasting) embed.addFields({ name: 'Spellcasting', value: spellcasting });

  const actions = formatNamedEntries(d.action);
  if (actions) embed.addFields({ name: 'Actions', value: actions });

  const reactions = formatNamedEntries(d.reaction);
  if (reactions) embed.addFields({ name: 'Reactions', value: reactions });

  const legendary = formatNamedEntries(d.legendary);
  if (legendary) {
    const header =
      d.legendaryHeader && d.legendaryHeader.length > 0
        ? flattenEntries(d.legendaryHeader, 250) + '\n\n'
        : '';
    embed.addFields({
      name: 'Legendary Actions',
      value: truncate(`${header}${legendary}`, 1020),
    });
  }

  embed.setFooter({
    text: `${m.source}${d.page ? ` p.${d.page}` : ''} · ${m.slug}`,
  });
  return embed;
}

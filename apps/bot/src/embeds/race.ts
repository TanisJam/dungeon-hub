import { EmbedBuilder } from 'discord.js';
import { flattenEntries, renderInline } from '../render-5etools.js';
import { titleCase } from '../utils.js';

export interface RaceRow {
  slug: string;
  source: string;
  name: string;
  isSubrace: boolean;
  parentSlug: string | null;
  parentSource: string | null;
  data: FiveeRaceData;
}

interface FiveeRaceData {
  name: string;
  source: string;
  page?: number;
  size?: string[];
  speed?: number | Record<string, number | boolean>;
  ability?: Array<Record<string, number | { from?: string[]; amount?: number; count?: number }>>;
  age?: { mature?: number; max?: number };
  languageProficiencies?: Array<Record<string, boolean | number>>;
  traitTags?: string[];
  entries?: unknown[];
  raceName?: string; // subrace -> parent race name
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

function formatSize(size: string[] | undefined): string {
  if (!size || size.length === 0) return 'Medium';
  return size.map((s) => SIZE_NAMES[s] ?? s).join('/');
}

function formatSpeed(speed: FiveeRaceData['speed']): string {
  if (speed === undefined) return '30 ft.';
  if (typeof speed === 'number') return `${speed} ft.`;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(speed)) {
    if (v === false) continue;
    const amount = typeof v === 'number' ? v : 30;
    if (k === 'walk') parts.unshift(`${amount} ft.`);
    else parts.push(`${k} ${amount} ft.`);
  }
  return parts.join(', ');
}

function formatAbilities(ability: FiveeRaceData['ability']): string | null {
  if (!ability || ability.length === 0) return null;
  const lines: string[] = [];
  for (const entry of ability) {
    const fixed: string[] = [];
    let choose: string | null = null;
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'choose' && typeof v === 'object' && v !== null) {
        const c = v as { from?: string[]; amount?: number; count?: number };
        const amount = c.amount ?? 1;
        const count = c.count ?? 1;
        const from = (c.from ?? []).map((a) => a.toUpperCase()).join(', ');
        choose = `+${amount} to ${count} of: ${from}`;
      } else if (typeof v === 'number') {
        const sign = v >= 0 ? '+' : '';
        fixed.push(`${sign}${v} ${k.toUpperCase()}`);
      }
    }
    if (fixed.length > 0) lines.push(fixed.join(', '));
    if (choose) lines.push(choose);
  }
  return lines.length > 0 ? lines.join(' · ') : null;
}

function formatLanguages(langs: FiveeRaceData['languageProficiencies']): string | null {
  if (!langs || langs.length === 0) return null;
  const out: string[] = [];
  for (const entry of langs) {
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'anyStandard' || k === 'any') {
        out.push(`${typeof v === 'number' ? v : 1} of your choice`);
      } else if (v === true) {
        out.push(titleCase(k));
      }
    }
  }
  return out.length > 0 ? out.join(', ') : null;
}

/**
 * Si entries tiene bloques nombrados (`{type:entries, name, entries}`), los
 * extraemos como pares (header, text). Si no, devolvemos un único bloque "desc".
 */
function extractTraits(entries: unknown[] | undefined): Array<{ name: string; text: string }> {
  if (!entries) return [];
  const traits: Array<{ name: string; text: string }> = [];
  for (const e of entries) {
    if (e == null) continue;
    if (typeof e === 'string') {
      // Texto suelto sin header → trait sin nombre.
      const txt = renderInline(e);
      if (txt) traits.push({ name: 'Description', text: txt });
      continue;
    }
    if (typeof e !== 'object') continue;
    const obj = e as Record<string, unknown>;
    if (obj['type'] === 'entries' && typeof obj['name'] === 'string') {
      const text = flattenEntries(obj['entries'] ?? [], 600);
      if (text) traits.push({ name: obj['name'] as string, text });
    }
  }
  return traits;
}

export function buildRaceEmbed(race: RaceRow): EmbedBuilder {
  const d = race.data;
  const size = formatSize(d.size);
  const speed = formatSpeed(d.speed);

  const subraceMarker =
    race.isSubrace && d.raceName ? ` *(subrace of ${d.raceName})*` : '';

  const embed = new EmbedBuilder()
    .setTitle(race.name)
    .setDescription(`*${size} race · Speed ${speed}*${subraceMarker}`)
    .setColor(0x27ae60); // green

  const abilities = formatAbilities(d.ability);
  if (abilities) {
    embed.addFields({ name: 'Ability Score Increase', value: abilities, inline: true });
  }

  const langs = formatLanguages(d.languageProficiencies);
  if (langs) {
    embed.addFields({ name: 'Languages', value: langs, inline: true });
  }

  const traits = extractTraits(d.entries);
  // Discord cap: max 25 fields. Empezamos con +3 ya agregados, así que dejamos
  // espacio. Concatenamos traits en máx 18 fields (resto truncado).
  for (const t of traits.slice(0, 18)) {
    embed.addFields({ name: t.name, value: t.text });
  }
  if (traits.length > 18) {
    embed.addFields({ name: '…', value: `${traits.length - 18} more traits truncated` });
  }

  embed.setFooter({
    text: `${race.source}${d.page ? ` p.${d.page}` : ''} · ${race.slug}`,
  });

  return embed;
}

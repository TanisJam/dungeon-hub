import { EmbedBuilder } from 'discord.js';
import { flattenEntries, renderInline } from '../render-5etools.js';

/**
 * Spell row tal como vuelve de `/compendium/spells/:slug` en el backend
 * (toda la fila de `compendium_spells`, con `data` = payload original de 5etools).
 */
export interface SubclassGrant {
  classSlug: string;
  classSource: string;
  subclassSlug: string;
  subclassSource: string;
  subclassName: string;
}

export interface SpellRow {
  slug: string;
  source: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  subclassGrants: SubclassGrant[];
  data: FiveeSpellData;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatSubclassGrant(g: SubclassGrant): string {
  // 5etools mete el source code entre paréntesis cuando hay versiones del mismo
  // subclass en distintas fuentes (e.g. "Zeal (PSA)"). Limpiamos eso primero.
  // Luego strip-eamos sufijos genéricos ("Domain", "Patron", etc.) para que
  // "Light Domain Cleric" quede como "Light Cleric".
  const trimmed = g.subclassName
    .replace(/\s*\([A-Z0-9]+\)\s*$/i, '')
    .replace(/\s+Domain$/i, '')
    .replace(/\s+Patron$/i, '')
    .replace(/\s+Tradition$/i, '')
    .replace(/\s+Origin$/i, '');
  return `${trimmed} ${titleCase(g.classSlug)}`;
}

interface FiveeSpellData {
  name: string;
  source: string;
  page?: number;
  level: number;
  school: string;
  time?: Array<{ number: number; unit: string; condition?: string }>;
  range?: {
    type: string;
    distance?: { type: string; amount?: number };
  };
  components?: { v?: boolean; s?: boolean; m?: string | { text: string; cost?: number; consume?: boolean | string } };
  duration?: Array<{
    type: string;
    duration?: { type: string; amount: number };
    concentration?: boolean;
  }>;
  entries?: unknown[];
  entriesHigherLevel?: unknown[];
  meta?: { ritual?: boolean };
}

const SCHOOL_NAMES: Record<string, string> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  V: 'Evocation',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
};

const SCHOOL_COLORS: Record<string, number> = {
  A: 0x4a90e2, // Abjuration - blue
  C: 0xf5a623, // Conjuration - orange
  D: 0x9b59b6, // Divination - purple
  E: 0xe91e63, // Enchantment - pink
  V: 0xe74c3c, // Evocation - red
  I: 0x16a085, // Illusion - teal
  N: 0x2c3e50, // Necromancy - dark
  T: 0xf39c12, // Transmutation - yellow
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

function levelHeader(level: number, school: string, ritual: boolean): string {
  const schoolName = SCHOOL_NAMES[school] ?? school;
  const base = level === 0 ? `${schoolName} cantrip` : `${ordinal(level)}-level ${schoolName}`;
  return ritual ? `${base} (ritual)` : base;
}

function castingTime(time: FiveeSpellData['time']): string {
  if (!time || time.length === 0) return '—';
  return time
    .map((t) => {
      const unit = t.unit.toLowerCase();
      const base = `${t.number} ${unit}${t.number !== 1 && !unit.endsWith('s') ? 's' : ''}`;
      return t.condition ? `${base}, ${t.condition}` : base;
    })
    .join(' or ');
}

function rangeText(range: FiveeSpellData['range']): string {
  if (!range) return '—';
  if (range.type === 'point' && range.distance) {
    const d = range.distance;
    if (d.type === 'self') return 'Self';
    if (d.type === 'touch') return 'Touch';
    if (d.type === 'sight') return 'Sight';
    if (d.type === 'unlimited') return 'Unlimited';
    if (d.amount !== undefined) return `${d.amount} ${d.type}`;
    return d.type;
  }
  if (range.type === 'special') return 'Special';
  if (range.distance?.amount !== undefined) {
    return `Self (${range.distance.amount}-${range.distance.type} ${range.type})`;
  }
  return range.type;
}

function componentsText(components: FiveeSpellData['components']): string {
  if (!components) return '—';
  const parts: string[] = [];
  if (components.v) parts.push('V');
  if (components.s) parts.push('S');
  if (components.m) {
    const m = typeof components.m === 'string' ? components.m : components.m.text;
    parts.push(`M (${m})`);
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

function durationText(duration: FiveeSpellData['duration']): string {
  if (!duration || duration.length === 0) return '—';
  return duration
    .map((d) => {
      if (d.type === 'instant') return 'Instantaneous';
      if (d.type === 'permanent') return 'Until dispelled';
      if (d.type === 'special') return 'Special';
      if (d.type === 'timed' && d.duration) {
        const conc = d.concentration ? 'Concentration, up to ' : '';
        return `${conc}${d.duration.amount} ${d.duration.type}${d.duration.amount !== 1 ? 's' : ''}`;
      }
      return d.type;
    })
    .join(' or ');
}

export function buildSpellEmbed(spell: SpellRow): EmbedBuilder {
  const d = spell.data;
  const ritual = d.meta?.ritual === true;
  const embed = new EmbedBuilder()
    .setTitle(spell.name)
    .setDescription(`*${levelHeader(spell.level, spell.school, ritual)}*`)
    .setColor(SCHOOL_COLORS[spell.school] ?? 0x95a5a6)
    .addFields(
      { name: 'Casting Time', value: castingTime(d.time), inline: true },
      { name: 'Range', value: rangeText(d.range), inline: true },
      { name: 'Components', value: componentsText(d.components), inline: true },
      { name: 'Duration', value: durationText(d.duration), inline: true },
    );

  if (spell.classes.length > 0) {
    embed.addFields({
      name: 'Classes',
      value: spell.classes.map(titleCase).join(', '),
      inline: true,
    });
  }

  if (spell.subclassGrants.length > 0) {
    const grants = spell.subclassGrants.map(formatSubclassGrant);
    // Dedup display strings (ej. dos sources de Light Cleric).
    const unique = Array.from(new Set(grants));
    embed.addFields({
      name: 'Bonus via',
      value: unique.join(', '),
      inline: true,
    });
  }

  if (d.entries) {
    const desc = flattenEntries(d.entries, 1600);
    if (desc) embed.addFields({ name: 'Description', value: desc });
  }

  if (d.entriesHigherLevel) {
    // El field se llama "At Higher Levels", y el primer entry de 5etools típicamente
    // también es `{type: "entries", name: "At Higher Levels", ...}` — lo que duplica
    // el header dentro del valor. Desempaquetamos un nivel si el name coincide.
    const stripped = stripRedundantHeader(d.entriesHigherLevel, 'At Higher Levels');
    const higher = flattenEntries(stripped, 600);
    if (higher) embed.addFields({ name: 'At Higher Levels', value: higher });
  }

  embed.setFooter({
    text: `${spell.source}${d.page ? ` p.${d.page}` : ''} · ${spell.slug}`,
  });

  return embed;
}

/**
 * Si `entries` es un array con un único `{type: "entries", name, entries: [...]}`
 * cuyo `name` coincide con `headerName`, devuelve el `entries` interno para
 * evitar duplicar el header. Si no, devuelve el input original.
 */
function stripRedundantHeader(entries: unknown, headerName: string): unknown {
  if (!Array.isArray(entries) || entries.length !== 1) return entries;
  const inner = entries[0];
  if (
    inner != null &&
    typeof inner === 'object' &&
    (inner as Record<string, unknown>)['type'] === 'entries' &&
    typeof (inner as Record<string, unknown>)['name'] === 'string' &&
    ((inner as Record<string, unknown>)['name'] as string).toLowerCase() ===
      headerName.toLowerCase() &&
    Array.isArray((inner as Record<string, unknown>)['entries'])
  ) {
    return (inner as Record<string, unknown>)['entries'];
  }
  return entries;
}

// Mantener export del renderer por si otros embeds lo necesitan
export { renderInline };

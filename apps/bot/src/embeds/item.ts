import { EmbedBuilder } from 'discord.js';
import { flattenEntries } from '../render-5etools.js';

export interface ItemRow {
  slug: string;
  source: string;
  name: string;
  type: string | null;
  weight: string | null;
  data: FiveeItemData;
}

interface FiveeItemData {
  name: string;
  source: string;
  page?: number;
  type?: string;
  weight?: number;
  value?: number; // costo en copper pieces
  weaponCategory?: string;
  property?: string[];
  rarity?: string;
  reqAttune?: boolean | string;
  dmg1?: string;
  dmg2?: string;
  dmgType?: string;
  range?: string;
  ac?: number;
  strength?: string; // STR mínimo para vestir armor pesada
  stealth?: boolean; // armor con disadvantage en stealth
  entries?: unknown[];
}

const TYPE_NAMES: Record<string, string> = {
  M: 'Melee weapon',
  R: 'Ranged weapon',
  A: 'Ammunition',
  LA: 'Light armor',
  MA: 'Medium armor',
  HA: 'Heavy armor',
  S: 'Shield',
  GV: 'Generic variant',
  G: 'Adventuring gear',
  T: 'Tool',
  AT: "Artisan's tool",
  TG: 'Trade good',
  TAH: 'Tack and harness',
  INS: 'Musical instrument',
  GS: 'Gaming set',
  P: 'Potion',
  SC: 'Spell scroll',
  RD: 'Rod',
  WD: 'Wand',
  RG: 'Ring',
  W: 'Wondrous item',
  $: 'Currency',
};

const DAMAGE_TYPE_NAMES: Record<string, string> = {
  B: 'bludgeoning',
  P: 'piercing',
  S: 'slashing',
  A: 'acid',
  C: 'cold',
  F: 'fire',
  L: 'lightning',
  N: 'necrotic',
  O: 'force',
  Y: 'psychic',
  R: 'radiant',
  T: 'thunder',
};

const PROPERTY_NAMES: Record<string, string> = {
  A: 'Ammunition',
  F: 'Finesse',
  H: 'Heavy',
  L: 'Light',
  LD: 'Loading',
  R: 'Reach',
  S: 'Special',
  T: 'Thrown',
  '2H': 'Two-handed',
  V: 'Versatile',
};

const RARITY_COLORS: Record<string, number> = {
  none: 0x95a5a6,
  common: 0xffffff,
  uncommon: 0x1abc9c,
  rare: 0x3498db,
  'very rare': 0x9b59b6,
  legendary: 0xe67e22,
  artifact: 0xe74c3c,
};

function formatType(d: FiveeItemData, fallback: string | null): string {
  // El type viene como "M|PHB", "LA|PHB", etc. — strip source suffix
  const raw = d.type ?? fallback ?? '';
  const base = raw.split('|')[0] ?? '';
  return TYPE_NAMES[base] ?? base ?? 'Item';
}

function formatCost(value: number | undefined): string | null {
  if (value === undefined) return null;
  // 5etools stores cost in copper pieces. Render en la moneda más útil.
  if (value === 0) return 'free';
  if (value % 10000 === 0) return `${value / 10000} pp`;
  if (value % 100 === 0) return `${value / 100} gp`;
  if (value % 10 === 0) return `${value / 10} sp`;
  return `${value} cp`;
}

function formatDamage(d: FiveeItemData): string | null {
  if (!d.dmg1) return null;
  const type = d.dmgType ? DAMAGE_TYPE_NAMES[d.dmgType] ?? d.dmgType : '';
  const versatile = d.dmg2 ? ` (${d.dmg2} versatile)` : '';
  return `${d.dmg1}${versatile} ${type}`.trim();
}

function formatProperties(props: string[] | undefined): string | null {
  if (!props || props.length === 0) return null;
  return props
    .map((p) => {
      const code = p.split('|')[0] ?? p;
      return PROPERTY_NAMES[code] ?? code;
    })
    .join(', ');
}

function formatAttunement(req: FiveeItemData['reqAttune']): string | null {
  if (req === undefined || req === false) return null;
  if (req === true) return 'requires attunement';
  return `requires attunement ${req}`;
}

export function buildItemEmbed(item: ItemRow): EmbedBuilder {
  const d = item.data;
  const rarity = (d.rarity ?? 'none').toLowerCase();
  const typeName = formatType(d, item.type);
  const attune = formatAttunement(d.reqAttune);

  const tagline = [
    typeName,
    rarity !== 'none' ? rarity : null,
    attune ? `(${attune})` : null,
  ]
    .filter((x): x is string => Boolean(x))
    .join(' · ');

  const embed = new EmbedBuilder()
    .setTitle(item.name)
    .setDescription(`*${tagline}*`)
    .setColor(RARITY_COLORS[rarity] ?? 0x95a5a6);

  // Combat stats inline para weapons / armor
  const damage = formatDamage(d);
  const props = formatProperties(d.property);
  const weight = item.weight ?? (d.weight !== undefined ? String(d.weight) : null);
  const cost = formatCost(d.value);

  if (damage) embed.addFields({ name: 'Damage', value: damage, inline: true });
  if (d.range) embed.addFields({ name: 'Range', value: `${d.range} ft.`, inline: true });
  if (d.ac !== undefined) {
    const acStr = d.strength ? `${d.ac} (Str ${d.strength})` : String(d.ac);
    embed.addFields({ name: 'AC', value: acStr, inline: true });
  }
  if (props) embed.addFields({ name: 'Properties', value: props, inline: true });
  if (cost) embed.addFields({ name: 'Cost', value: cost, inline: true });
  if (weight) embed.addFields({ name: 'Weight', value: `${weight} lb`, inline: true });
  if (d.stealth) embed.addFields({ name: 'Stealth', value: 'Disadvantage', inline: true });

  if (d.entries) {
    // Discord embed field value cap is 1024 chars — dejamos margen para no romper.
    const desc = flattenEntries(d.entries, 1020);
    if (desc) embed.addFields({ name: 'Description', value: desc });
  }

  embed.setFooter({
    text: `${item.source}${d.page ? ` p.${d.page}` : ''} · ${item.slug}`,
  });

  return embed;
}

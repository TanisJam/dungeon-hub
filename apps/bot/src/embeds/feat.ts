import { EmbedBuilder } from 'discord.js';
import { flattenEntries } from '../render-5etools.js';
import { formatPrerequisite } from '../format-prerequisite.js';

export interface FeatRow {
  slug: string;
  source: string;
  name: string;
  prerequisites: unknown;
  data: FiveeFeatData;
}

interface FiveeFeatData {
  name: string;
  source: string;
  page?: number;
  prerequisite?: unknown[];
  ability?: Array<Record<string, number | { from: string[]; amount?: number; count?: number }>>;
  entries?: unknown[];
}

function formatAbilityGrant(ability: FiveeFeatData['ability']): string | null {
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
        const from = (c.from ?? []).map((a) => a.toUpperCase()).join('/');
        choose = `+${amount} to ${count > 1 ? `${count} of ` : ''}${from}`;
      } else if (typeof v === 'number') {
        fixed.push(`+${v} ${k.toUpperCase()}`);
      }
    }
    if (fixed.length > 0) lines.push(fixed.join(', '));
    if (choose) lines.push(choose);
  }
  return lines.length > 0 ? lines.join(' or ') : null;
}

export function buildFeatEmbed(feat: FeatRow): EmbedBuilder {
  const d = feat.data;
  const embed = new EmbedBuilder()
    .setTitle(feat.name)
    .setColor(0x9b59b6); // purple

  const prereq = formatPrerequisite(d.prerequisite ?? feat.prerequisites);
  if (prereq) {
    embed.setDescription(`**Prerequisite:** ${prereq}`);
  }

  const asi = formatAbilityGrant(d.ability);
  if (asi) {
    embed.addFields({ name: 'Ability Score Increase', value: asi, inline: false });
  }

  if (d.entries) {
    const desc = flattenEntries(d.entries, 2000);
    if (desc) embed.addFields({ name: 'Description', value: desc });
  }

  embed.setFooter({
    text: `${feat.source}${d.page ? ` p.${d.page}` : ''} · ${feat.slug}`,
  });

  return embed;
}

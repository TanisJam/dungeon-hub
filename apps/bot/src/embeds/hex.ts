import { EmbedBuilder } from 'discord.js';

export interface HexRow {
  id: string;
  campaignId: string;
  parentHexId: string | null;
  scale: 'region' | 'subhex' | string;
  q: number;
  r: number;
  worldX: number | null;
  worldY: number | null;
  name: string | null;
  terrain: string | null;
  status: HexStatus;
  playerNotes: string | null;
  dmNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HexStatus = 'unexplored' | 'rumored' | 'explored' | 'cleared';

export interface PoiRow {
  id: string;
  hexId: string;
  name: string;
  description: string | null;
  status: PoiStatus;
  worldX: number | null;
  worldY: number | null;
  dmNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PoiStatus = 'unknown' | 'discovered' | 'cleared';

const HEX_BADGE: Record<HexStatus, string> = {
  unexplored: '⬛ unexplored',
  rumored: '🌫️ rumored',
  explored: '🗺️ explored',
  cleared: '✅ cleared',
};

const POI_BADGE: Record<PoiStatus, string> = {
  unknown: '❔ unknown',
  discovered: '🔎 discovered',
  cleared: '✅ cleared',
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

function hexLabel(h: HexRow): string {
  return h.name ?? `(${h.q}, ${h.r})`;
}

export function buildHexListEmbed(hexes: HexRow[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Map').setColor(0x6c5ce7);
  if (hexes.length === 0) {
    embed.setDescription('_No hay hexes visibles. Vení a explorar._');
    return embed;
  }
  const lines = hexes.slice(0, 25).map((h) => {
    const terrain = h.terrain ? ` · ${h.terrain}` : '';
    return `**${hexLabel(h)}** \`${h.q},${h.r}\` — ${HEX_BADGE[h.status]}${terrain}`;
  });
  embed.setDescription(truncate(lines.join('\n'), 4000));
  embed.setFooter({
    text: hexes.length > 25 ? `${hexes.length} hexes (mostrando 25)` : `${hexes.length} hexes`,
  });
  return embed;
}

export function buildHexDetailEmbed(hex: HexRow, pois: PoiRow[]): EmbedBuilder {
  const title = hexLabel(hex);
  const headerBits = [HEX_BADGE[hex.status]];
  if (hex.terrain) headerBits.push(hex.terrain);
  headerBits.push(`hex \`${hex.q},${hex.r}\``);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`*${headerBits.join(' · ')}*`)
    .setColor(0x6c5ce7);

  if (hex.playerNotes) {
    embed.addFields({ name: 'Notes', value: truncate(hex.playerNotes, 1020) });
  }

  if (pois.length > 0) {
    const poiLines = pois.slice(0, 20).map((p) => {
      const desc = p.description ? ` — ${truncate(p.description, 120)}` : '';
      return `• **${p.name}** ${POI_BADGE[p.status]}${desc}`;
    });
    embed.addFields({
      name: `POIs (${pois.length})`,
      value: truncate(poiLines.join('\n'), 1020),
    });
  } else {
    embed.addFields({ name: 'POIs', value: '_ninguno_', inline: false });
  }

  if (hex.parentHexId) {
    embed.setFooter({
      text: `hex ${shortId(hex.id)} · parent ${shortId(hex.parentHexId)}`,
    });
  } else {
    embed.setFooter({ text: `hex ${shortId(hex.id)} · ${hex.scale}` });
  }
  return embed;
}

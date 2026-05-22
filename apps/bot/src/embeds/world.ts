import { EmbedBuilder } from 'discord.js';
import { discordTimestamp } from './session.js';

export interface FactionRow {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  state: 'active' | 'dormant' | 'destroyed' | 'disbanded';
  reputation: number | null;
  dmNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NpcRow {
  id: string;
  campaignId: string;
  name: string;
  race: string | null;
  description: string | null;
  status: 'alive' | 'dead' | 'missing' | 'unknown';
  factionId: string | null;
  hexId: string | null;
  worldX: number | null;
  worldY: number | null;
  dmNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorldEventRow {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  visibility: 'public' | 'dm-only';
  occurredAt: string;
  sourceSessionId: string | null;
  tags: string[];
  dmNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

const FACTION_BADGE: Record<FactionRow['state'], string> = {
  active: '🟢 active',
  dormant: '⚪ dormant',
  destroyed: '💀 destroyed',
  disbanded: '🪦 disbanded',
};

const NPC_BADGE: Record<NpcRow['status'], string> = {
  alive: '🟢 alive',
  dead: '💀 dead',
  missing: '❓ missing',
  unknown: '❔ unknown',
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

export function buildFactionsEmbed(factions: FactionRow[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Factions').setColor(0x8e44ad);
  if (factions.length === 0) {
    embed.setDescription('_No hay factions registradas._');
    return embed;
  }
  const lines = factions.slice(0, 25).map((f) => {
    const rep = f.reputation !== null ? ` · rep ${f.reputation}` : '';
    const desc = f.description ? `\n${truncate(f.description, 150)}` : '';
    return `**${f.name}** — ${FACTION_BADGE[f.state]}${rep}${desc}`;
  });
  embed.setDescription(truncate(lines.join('\n\n'), 4000));
  embed.setFooter({
    text: factions.length > 25 ? `${factions.length} factions (mostrando 25)` : `${factions.length} factions`,
  });
  return embed;
}

export function buildNpcsEmbed(npcs: NpcRow[], statusFilter?: NpcRow['status']): EmbedBuilder {
  const title = statusFilter ? `NPCs (${statusFilter})` : 'NPCs';
  const embed = new EmbedBuilder().setTitle(title).setColor(0x16a085);
  if (npcs.length === 0) {
    embed.setDescription('_No hay NPCs._');
    return embed;
  }
  const lines = npcs.slice(0, 25).map((n) => {
    const race = n.race ? ` (${n.race})` : '';
    const bits: string[] = [NPC_BADGE[n.status]];
    if (n.factionId) bits.push(`faction \`${shortId(n.factionId)}\``);
    if (n.hexId) bits.push(`hex \`${shortId(n.hexId)}\``);
    return `**${n.name}**${race} — ${bits.join(' · ')}`;
  });
  embed.setDescription(truncate(lines.join('\n'), 4000));
  embed.setFooter({
    text: npcs.length > 25 ? `${npcs.length} npcs (mostrando 25)` : `${npcs.length} npcs`,
  });
  return embed;
}

export function buildWorldEventsEmbed(events: WorldEventRow[], tagFilter?: string): EmbedBuilder {
  const title = tagFilter ? `World Events #${tagFilter}` : 'World Events';
  const embed = new EmbedBuilder().setTitle(title).setColor(0xc0392b);
  if (events.length === 0) {
    embed.setDescription('_No hay events registrados._');
    return embed;
  }

  // Ordenados desc por occurredAt — el backend ya ordena, pero por las dudas.
  const sorted = [...events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  const lines = sorted.slice(0, 15).map((e) => {
    const when = discordTimestamp(e.occurredAt, 'R') ?? '';
    const tags = e.tags.length > 0 ? ` · ${e.tags.map((t) => `\`${t}\``).join(' ')}` : '';
    const visibility = e.visibility === 'dm-only' ? ' 🔒' : '';
    const desc = e.description ? `\n${truncate(e.description, 200)}` : '';
    return `**${e.title}**${visibility}\n${when}${tags}${desc}`;
  });
  embed.setDescription(truncate(lines.join('\n\n'), 4000));
  embed.setFooter({
    text: events.length > 15 ? `${events.length} events (mostrando 15)` : `${events.length} events`,
  });
  return embed;
}

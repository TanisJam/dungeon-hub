import { EmbedBuilder } from 'discord.js';

export interface SessionRow {
  id: string;
  campaignId: string;
  gmUserId: string;
  title: string;
  description: string | null;
  status: SessionStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  levelMin: number | null;
  levelMax: number | null;
  maxPlayers: number | null;
  locationHexId: string | null;
  summary: string | null;
  dmNotes?: string | null;
  rewards?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SessionParticipant {
  characterId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface SessionDetail extends SessionRow {
  participants: SessionParticipant[];
}

export type SessionStatus =
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

const STATUS_META: Record<SessionStatus, { label: string; color: number }> = {
  scheduled: { label: '📅 Scheduled', color: 0x3498db },
  active: { label: '🟢 Active', color: 0x2ecc71 },
  paused: { label: '⏸️ Paused', color: 0xf39c12 },
  completed: { label: '✅ Completed', color: 0x95a5a6 },
  cancelled: { label: '❌ Cancelled', color: 0xe74c3c },
};

/**
 * Discord renderea `<t:UNIX:fmt>` en la zona horaria del usuario.
 * fmt: f=full, R=relative ("in 3 days"), d=date short.
 */
export function discordTimestamp(iso: string | null, fmt: 'f' | 'R' | 'd' = 'f'): string | null {
  if (!iso) return null;
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(ts)) return null;
  return `<t:${ts}:${fmt}>`;
}

function formatLevelRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return min === max ? `L${min}` : `L${min}-${max}`;
  if (min !== null) return `L${min}+`;
  return `up to L${max!}`;
}

export function buildSessionListItem(s: SessionRow): string {
  const meta = STATUS_META[s.status];
  const when = discordTimestamp(s.scheduledAt, 'R') ?? '—';
  const level = formatLevelRange(s.levelMin, s.levelMax);
  const bits = [meta.label, when, level].filter(Boolean);
  return `**${s.title}**\n${bits.join(' · ')}`;
}

export function buildSessionDetailEmbed(s: SessionDetail): EmbedBuilder {
  const meta = STATUS_META[s.status];

  const dateLines: string[] = [];
  const scheduled = discordTimestamp(s.scheduledAt);
  const started = discordTimestamp(s.startedAt);
  const ended = discordTimestamp(s.endedAt);
  if (scheduled) dateLines.push(`📅 Scheduled: ${scheduled}`);
  if (started) dateLines.push(`▶ Started: ${started}`);
  if (ended) dateLines.push(`⏹ Ended: ${ended}`);

  const headerBits = [meta.label];
  const level = formatLevelRange(s.levelMin, s.levelMax);
  if (level) headerBits.push(level);
  if (s.maxPlayers !== null) headerBits.push(`max ${s.maxPlayers} players`);

  const embed = new EmbedBuilder()
    .setTitle(s.title)
    .setDescription(`*${headerBits.join(' · ')}*`)
    .setColor(meta.color);

  if (dateLines.length > 0) {
    embed.addFields({ name: 'When', value: dateLines.join('\n'), inline: false });
  }

  if (s.description) {
    embed.addFields({ name: 'Description', value: truncate(s.description, 1020) });
  }
  if (s.summary) {
    embed.addFields({ name: 'Summary', value: truncate(s.summary, 1020) });
  }

  const active = s.participants.filter((p) => p.leftAt === null);
  const partLine =
    active.length === 0
      ? '_no participants yet_'
      : `${active.length} active${s.participants.length !== active.length ? ` · ${s.participants.length - active.length} left` : ''}`;
  embed.addFields({ name: 'Participants', value: partLine, inline: true });

  if (s.locationHexId) {
    embed.addFields({ name: 'Location', value: `hex \`${shortId(s.locationHexId)}\``, inline: true });
  }

  embed.setFooter({ text: `session ${shortId(s.id)}` });
  return embed;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

import { EmbedBuilder } from 'discord.js';

export interface JournalEntryRow {
  id: string;
  campaignId: string;
  title: string;
  body: string | null;
  visibility: 'public' | 'dm-only';
  tags: string[];
  authorUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

export function buildJournalListEmbed(
  entries: JournalEntryRow[],
  tagFilter?: string,
): EmbedBuilder {
  const title = tagFilter ? `Lore #${tagFilter}` : 'Lore';
  const embed = new EmbedBuilder().setTitle(title).setColor(0xd4a373);
  if (entries.length === 0) {
    embed.setDescription('_No hay entries en el journal._');
    return embed;
  }
  const lines = entries.slice(0, 20).map((e) => {
    const visibility = e.visibility === 'dm-only' ? ' 🔒' : '';
    const tags = e.tags.length > 0 ? ` · ${e.tags.map((t) => `\`${t}\``).join(' ')}` : '';
    const preview = e.body ? `\n${truncate(e.body, 150)}` : '';
    return `**${e.title}**${visibility}${tags}${preview}`;
  });
  embed.setDescription(truncate(lines.join('\n\n'), 4000));
  embed.setFooter({
    text: entries.length > 20 ? `${entries.length} entries (mostrando 20)` : `${entries.length} entries`,
  });
  return embed;
}

export function buildJournalEntryEmbed(entry: JournalEntryRow): EmbedBuilder {
  const visibility = entry.visibility === 'dm-only' ? ' 🔒 *DM only*' : '';
  const embed = new EmbedBuilder()
    .setTitle(entry.title)
    .setColor(entry.visibility === 'dm-only' ? 0xe74c3c : 0xd4a373);

  if (visibility) embed.setDescription(visibility.trim());

  if (entry.body) {
    embed.addFields({ name: 'Body', value: truncate(entry.body, 1020) });
  }
  if (entry.tags.length > 0) {
    embed.addFields({
      name: 'Tags',
      value: entry.tags.map((t) => `\`${t}\``).join(' '),
      inline: false,
    });
  }
  embed.setFooter({ text: `entry ${shortId(entry.id)}` });
  return embed;
}

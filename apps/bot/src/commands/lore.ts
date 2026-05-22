import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { api } from '../api-client.js';
import { env } from '../env.js';
import {
  buildJournalEntryEmbed,
  buildJournalListEmbed,
  type JournalEntryRow,
} from '../embeds/journal.js';

function endpoint(path: string): string {
  return `/api/v1/campaigns/${env.CAMPAIGN_ID}${path}`;
}

export const data: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
  .setName('lore')
  .setDescription('Campaign journal/lore: list, show')
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List journal entries')
      .addStringOption((opt) =>
        opt.setName('tag').setDescription('Filter by tag').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('show')
      .setDescription('Show a journal entry by title')
      .addStringOption((opt) =>
        opt
          .setName('entry')
          .setDescription('Entry title (autocompletes)')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.options.getSubcommand() !== 'show') {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused().toLowerCase().trim();
  try {
    const list = await api.get<{ data: JournalEntryRow[] }>(
      endpoint('/journal-entries'),
      { limit: 100 },
    );
    const filtered = focused
      ? list.data.filter((e) => e.title.toLowerCase().includes(focused))
      : list.data;
    const choices = filtered.slice(0, 25).map((e) => ({
      name: truncate(e.title, 100),
      value: e.id,
    }));
    await interaction.respond(choices);
  } catch (err) {
    console.error('[lore] autocomplete failed:', err);
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return runList(interaction);
  if (sub === 'show') return runShow(interaction);
}

async function runList(interaction: ChatInputCommandInteraction): Promise<void> {
  const tag = interaction.options.getString('tag', false);
  await interaction.deferReply();
  try {
    const params: Record<string, string | number> = { limit: 50 };
    if (tag) params['tag'] = tag;
    const list = await api.get<{ data: JournalEntryRow[] }>(
      endpoint('/journal-entries'),
      params,
    );
    await interaction.editReply({
      embeds: [buildJournalListEmbed(list.data, tag ?? undefined)],
    });
  } catch (err) {
    console.error('[lore list] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

async function runShow(interaction: ChatInputCommandInteraction): Promise<void> {
  const idOrTitle = interaction.options.getString('entry', true);
  await interaction.deferReply();
  try {
    let entryId = idOrTitle;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrTitle)) {
      const list = await api.get<{ data: JournalEntryRow[] }>(
        endpoint('/journal-entries'),
        { limit: 100 },
      );
      const lower = idOrTitle.toLowerCase();
      const match = list.data.find((e) => e.title.toLowerCase().includes(lower));
      if (!match) {
        await interaction.editReply(`No encontré ninguna entry llamada "${idOrTitle}".`);
        return;
      }
      entryId = match.id;
    }
    const entry = await api.get<JournalEntryRow>(
      `/api/v1/journal-entries/${encodeURIComponent(entryId)}`,
    );
    await interaction.editReply({ embeds: [buildJournalEntryEmbed(entry)] });
  } catch (err) {
    console.error('[lore show] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

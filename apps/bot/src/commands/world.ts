import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { api } from '../api-client.js';
import { env } from '../env.js';
import {
  buildFactionsEmbed,
  buildNpcsEmbed,
  buildWorldEventsEmbed,
  type FactionRow,
  type NpcRow,
  type WorldEventRow,
} from '../embeds/world.js';

const STATUS_CHOICES: Array<{ name: string; value: NpcRow['status'] }> = [
  { name: 'alive', value: 'alive' },
  { name: 'dead', value: 'dead' },
  { name: 'missing', value: 'missing' },
  { name: 'unknown', value: 'unknown' },
];

export const data: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
  .setName('world')
  .setDescription('West Marches world: events, factions, npcs')
  .addSubcommand((sub) =>
    sub
      .setName('events')
      .setDescription('Timeline of world events')
      .addStringOption((opt) =>
        opt.setName('tag').setDescription('Filter by tag (e.g. "political", "calamity")').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('factions').setDescription('List factions in the campaign'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('npcs')
      .setDescription('List NPCs in the campaign')
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('Filter by status')
          .setRequired(false)
          .addChoices(...STATUS_CHOICES),
      ),
  );

function endpoint(path: string): string {
  return `/api/v1/campaigns/${env.CAMPAIGN_ID}${path}`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'events') return runEvents(interaction);
  if (sub === 'factions') return runFactions(interaction);
  if (sub === 'npcs') return runNpcs(interaction);
}

async function runEvents(interaction: ChatInputCommandInteraction): Promise<void> {
  const tag = interaction.options.getString('tag', false);
  await interaction.deferReply();
  try {
    const params: Record<string, string | number> = { limit: 50 };
    if (tag) params['tag'] = tag;
    const list = await api.get<{ data: WorldEventRow[] }>(endpoint('/world-events'), params);
    await interaction.editReply({
      embeds: [buildWorldEventsEmbed(list.data, tag ?? undefined)],
    });
  } catch (err) {
    console.error('[world events] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

async function runFactions(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const list = await api.get<{ data: FactionRow[] }>(endpoint('/factions'));
    await interaction.editReply({ embeds: [buildFactionsEmbed(list.data)] });
  } catch (err) {
    console.error('[world factions] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

async function runNpcs(interaction: ChatInputCommandInteraction): Promise<void> {
  const status = interaction.options.getString('status', false) as NpcRow['status'] | null;
  await interaction.deferReply();
  try {
    const list = await api.get<{ data: NpcRow[] }>(endpoint('/npcs'));
    // Backend no filtra por status — lo hacemos client-side.
    const filtered = status ? list.data.filter((n) => n.status === status) : list.data;
    await interaction.editReply({
      embeds: [buildNpcsEmbed(filtered, status ?? undefined)],
    });
  } catch (err) {
    console.error('[world npcs] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildClassEmbed, type ClassRow } from '../embeds/class.js';
import { slugify } from '../utils.js';

interface ListResponse {
  data: Array<{ slug: string; source: string; name: string }>;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('class')
  .setDescription('Look up a D&D 5e class')
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Class name (e.g. "wizard", "fighter")').setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('level')
      .setDescription('Show features unlocked up to this level (1-20)')
      .setMinValue(1)
      .setMaxValue(20)
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  const level = interaction.options.getInteger('level', false);
  await interaction.deferReply();

  const slug = slugify(name);

  try {
    const klass = await api.get<ClassRow>(`/api/v1/compendium/classes/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildClassEmbed(klass, level)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[class] direct lookup failed:', err);
      await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
      return;
    }
  }

  try {
    const list = await api.get<ListResponse>('/api/v1/compendium/classes', {
      campaign: env.CAMPAIGN_ID,
      q: name,
      limit: 1,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(`No encontré ninguna class llamada "${name}".`);
      return;
    }
    const klass = await api.get<ClassRow>(
      `/api/v1/compendium/classes/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    await interaction.editReply({ embeds: [buildClassEmbed(klass, level)] });
  } catch (err) {
    console.error('[class] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildItemEmbed, type ItemRow } from '../embeds/item.js';
import { slugify } from '../utils.js';

interface ListResponse {
  data: Array<{ slug: string; source: string; name: string }>;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('item')
  .setDescription('Look up a D&D 5e item or piece of equipment')
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Item name (e.g. "longsword", "ring of protection")').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  const slug = slugify(name);

  try {
    const item = await api.get<ItemRow>(`/api/v1/compendium/items/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildItemEmbed(item)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[item] direct lookup failed:', err);
      await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
      return;
    }
  }

  try {
    const list = await api.get<ListResponse>('/api/v1/compendium/items', {
      campaign: env.CAMPAIGN_ID,
      q: name,
      limit: 1,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(`No encontré ningún item llamado "${name}".`);
      return;
    }
    const item = await api.get<ItemRow>(
      `/api/v1/compendium/items/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    await interaction.editReply({ embeds: [buildItemEmbed(item)] });
  } catch (err) {
    console.error('[item] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

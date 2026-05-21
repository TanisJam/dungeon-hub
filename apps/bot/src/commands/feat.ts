import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildFeatEmbed, type FeatRow } from '../embeds/feat.js';
import { slugify } from '../utils.js';

interface ListResponse {
  data: Array<{ slug: string; source: string; name: string }>;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('feat')
  .setDescription('Look up a D&D 5e feat')
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Feat name (e.g. "sharpshooter", "great weapon master")').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  const slug = slugify(name);

  try {
    const feat = await api.get<FeatRow>(`/api/v1/compendium/feats/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildFeatEmbed(feat)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[feat] direct lookup failed:', err);
      await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
      return;
    }
  }

  try {
    const list = await api.get<ListResponse>('/api/v1/compendium/feats', {
      campaign: env.CAMPAIGN_ID,
      q: name,
      limit: 1,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(`No encontré ningún feat llamado "${name}".`);
      return;
    }
    const feat = await api.get<FeatRow>(
      `/api/v1/compendium/feats/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    await interaction.editReply({ embeds: [buildFeatEmbed(feat)] });
  } catch (err) {
    console.error('[feat] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildRaceEmbed, type RaceRow } from '../embeds/race.js';
import { slugify } from '../utils.js';

interface ListResponse {
  data: Array<{ slug: string; source: string; name: string; isSubrace: boolean }>;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('race')
  .setDescription('Look up a D&D 5e race or subrace')
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Race or subrace (e.g. "elf", "high elf", "tiefling")').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  const slug = slugify(name);

  try {
    const race = await api.get<RaceRow>(`/api/v1/compendium/races/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildRaceEmbed(race)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[race] direct lookup failed:', err);
      await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
      return;
    }
  }

  try {
    const list = await api.get<ListResponse>('/api/v1/compendium/races', {
      campaign: env.CAMPAIGN_ID,
      q: name,
      limit: 1,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(`No encontré ninguna race llamada "${name}".`);
      return;
    }
    const race = await api.get<RaceRow>(
      `/api/v1/compendium/races/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    await interaction.editReply({ embeds: [buildRaceEmbed(race)] });
  } catch (err) {
    console.error('[race] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

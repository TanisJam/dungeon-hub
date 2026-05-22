import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildClassEmbed, type ClassRow } from '../embeds/class.js';
import { slugify } from '../utils.js';
import {
  decodeChoiceValue,
  encodeChoiceValue,
  fetchAutocomplete,
} from '../autocomplete.js';
import { buildPickerRow } from '../picker.js';

interface ListResponse {
  data: Array<{ slug: string; source: string; name: string }>;
}

const ENDPOINT = '/api/v1/compendium/classes';

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('class')
  .setDescription('Look up a D&D 5e class')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Class name (e.g. "wizard", "fighter")')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('level')
      .setDescription('Show features unlocked up to this level (1-20)')
      .setMinValue(1)
      .setMaxValue(20)
      .setRequired(false),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = await fetchAutocomplete('classes', focused);
  await interaction.respond(choices);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawName = interaction.options.getString('name', true);
  const level = interaction.options.getInteger('level', false);
  await interaction.deferReply();

  const decoded = decodeChoiceValue(rawName);
  if (decoded) {
    try {
      const row = await api.get<ClassRow>(
        `${ENDPOINT}/${encodeURIComponent(decoded.slug)}`,
        { campaign: env.CAMPAIGN_ID, source: decoded.source },
      );
      await interaction.editReply({ embeds: [buildClassEmbed(row, level)] });
      return;
    } catch (err) {
      console.error('[class] autocomplete lookup failed:', err);
    }
  }

  const slug = slugify(rawName);
  try {
    const row = await api.get<ClassRow>(`${ENDPOINT}/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildClassEmbed(row, level)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[class] direct lookup failed:', err);
      await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
      return;
    }
  }

  try {
    const searchTerm = rawName.replace(/[-_]+/g, ' ').trim();
    const list = await api.get<ListResponse>(ENDPOINT, {
      campaign: env.CAMPAIGN_ID,
      q: searchTerm,
      limit: 25,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(`No encontré ninguna class llamada "${rawName}".`);
      return;
    }
    const row = await api.get<ClassRow>(
      `${ENDPOINT}/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    const pickerRow = buildPickerRow('classes', list.data, encodeChoiceValue(first));
    await interaction.editReply({
      embeds: [buildClassEmbed(row, level)],
      components: pickerRow ? [pickerRow] : [],
    });
  } catch (err) {
    console.error('[class] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

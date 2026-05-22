import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildItemEmbed, type ItemRow } from '../embeds/item.js';
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

const ENDPOINT = '/api/v1/compendium/items';

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('item')
  .setDescription('Look up a D&D 5e item or piece of equipment')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Item name (e.g. "longsword", "ring of protection")')
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = await fetchAutocomplete('items', focused);
  await interaction.respond(choices);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawName = interaction.options.getString('name', true);
  await interaction.deferReply();

  const decoded = decodeChoiceValue(rawName);
  if (decoded) {
    try {
      const row = await api.get<ItemRow>(
        `${ENDPOINT}/${encodeURIComponent(decoded.slug)}`,
        { campaign: env.CAMPAIGN_ID, source: decoded.source },
      );
      await interaction.editReply({ embeds: [buildItemEmbed(row)] });
      return;
    } catch (err) {
      console.error('[item] autocomplete lookup failed:', err);
    }
  }

  const slug = slugify(rawName);
  try {
    const row = await api.get<ItemRow>(`${ENDPOINT}/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildItemEmbed(row)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[item] direct lookup failed:', err);
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
      await interaction.editReply(`No encontré ningún item llamado "${rawName}".`);
      return;
    }
    const row = await api.get<ItemRow>(
      `${ENDPOINT}/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    const pickerRow = buildPickerRow('items', list.data, encodeChoiceValue(first));
    await interaction.editReply({
      embeds: [buildItemEmbed(row)],
      components: pickerRow ? [pickerRow] : [],
    });
  } catch (err) {
    console.error('[item] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildSpellEmbed, type SpellRow } from '../embeds/spell.js';
import { slugify } from '../utils.js';
import {
  decodeChoiceValue,
  encodeChoiceValue,
  fetchAutocomplete,
} from '../autocomplete.js';
import { buildPickerRow } from '../picker.js';

interface SpellListResponse {
  data: Array<{
    slug: string;
    source: string;
    name: string;
    level: number;
    school: string;
  }>;
}

const ENDPOINT = '/api/v1/compendium/spells';

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('spell')
  .setDescription('Look up a D&D 5e spell from the campaign compendium')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Spell name (e.g. "fireball", "misty step")')
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = await fetchAutocomplete('spells', focused);
  await interaction.respond(choices);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawName = interaction.options.getString('name', true);
  await interaction.deferReply();

  // Strategy 1: autocomplete pick — value es "slug|source", lookup directo.
  const decoded = decodeChoiceValue(rawName);
  if (decoded) {
    try {
      const row = await api.get<SpellRow>(
        `${ENDPOINT}/${encodeURIComponent(decoded.slug)}`,
        { campaign: env.CAMPAIGN_ID, source: decoded.source },
      );
      await interaction.editReply({ embeds: [buildSpellEmbed(row)] });
      return;
    } catch (err) {
      console.error('[spell] autocomplete lookup failed:', err);
      // fall through
    }
  }

  // Strategy 2: slugify exacto.
  const slug = slugify(rawName);
  try {
    const row = await api.get<SpellRow>(`${ENDPOINT}/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildSpellEmbed(row)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[spell] direct lookup failed:', err);
      await interaction.editReply(
        `Error consultando el compendium: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return;
    }
  }

  // Strategy 3: search por nombre. Mostramos el primero + picker con el resto.
  try {
    const searchTerm = rawName.replace(/[-_]+/g, ' ').trim();
    const list = await api.get<SpellListResponse>(ENDPOINT, {
      campaign: env.CAMPAIGN_ID,
      q: searchTerm,
      limit: 25,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(
        `No encontré ningún spell llamado "${rawName}" en este compendium.`,
      );
      return;
    }
    const row = await api.get<SpellRow>(
      `${ENDPOINT}/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    const pickerRow = buildPickerRow('spells', list.data, encodeChoiceValue(first));
    await interaction.editReply({
      embeds: [buildSpellEmbed(row)],
      components: pickerRow ? [pickerRow] : [],
    });
  } catch (err) {
    console.error('[spell] search fallback failed:', err);
    await interaction.editReply(
      `Error consultando el compendium: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}

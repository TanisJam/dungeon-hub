import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildRaceEmbed, type RaceRow } from '../embeds/race.js';
import { slugify } from '../utils.js';
import {
  decodeChoiceValue,
  encodeChoiceValue,
  fetchAutocomplete,
} from '../autocomplete.js';
import { buildPickerRow } from '../picker.js';

interface ListResponse {
  data: Array<{
    slug: string;
    source: string;
    name: string;
    isSubrace: boolean;
  }>;
}

const ENDPOINT = '/api/v1/compendium/races';

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('race')
  .setDescription('Look up a D&D 5e race or subrace')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Race or subrace (e.g. "elf", "high elf", "tiefling")')
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = await fetchAutocomplete('races', focused);
  await interaction.respond(choices);
}

async function fetchRow(slug: string, source?: string): Promise<RaceRow> {
  return api.get<RaceRow>(`${ENDPOINT}/${encodeURIComponent(slug)}`, {
    campaign: env.CAMPAIGN_ID,
    ...(source ? { source } : {}),
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawName = interaction.options.getString('name', true);
  await interaction.deferReply();

  // Strategy 1: autocomplete pick (slug|source directo).
  const decoded = decodeChoiceValue(rawName);
  if (decoded) {
    try {
      const row = await fetchRow(decoded.slug, decoded.source);
      await interaction.editReply({ embeds: [buildRaceEmbed(row)] });
      return;
    } catch (err) {
      console.error('[race] autocomplete lookup failed:', err);
    }
  }

  // Strategy 2: slug directo (razas base sin espacios: "elf", "tiefling").
  const slug = slugify(rawName);
  const slugCandidates = [slug];

  // Strategy 3 (candidates extra): subrace pattern `parent--subrace`.
  // Importer guarda subraces como `{slugify(raceName)}--{slugify(subraceName)}`.
  // Si user escribe "high elf" → intentamos `elf--high` (último word como parent)
  // y también `high--elf` (primer word como parent).
  const words = slug.split('-').filter(Boolean);
  if (words.length >= 2) {
    const last = words[words.length - 1]!;
    const rest = words.slice(0, -1).join('-');
    const first = words[0]!;
    const tail = words.slice(1).join('-');
    slugCandidates.push(`${last}--${rest}`, `${first}--${tail}`);
  }

  for (const candidate of slugCandidates) {
    try {
      const row = await fetchRow(candidate);
      await interaction.editReply({ embeds: [buildRaceEmbed(row)] });
      return;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) {
        console.error('[race] direct lookup failed:', err);
        await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
        return;
      }
    }
  }

  // Strategy 4: search por nombre + picker.
  try {
    const searchTerm = rawName.replace(/[-_]+/g, ' ').trim();
    const list = await api.get<ListResponse>(ENDPOINT, {
      campaign: env.CAMPAIGN_ID,
      q: searchTerm,
      limit: 25,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(`No encontré ninguna race llamada "${rawName}".`);
      return;
    }
    const row = await fetchRow(first.slug, first.source);
    const pickerRow = buildPickerRow('races', list.data, encodeChoiceValue(first));
    await interaction.editReply({
      embeds: [buildRaceEmbed(row)],
      components: pickerRow ? [pickerRow] : [],
    });
  } catch (err) {
    console.error('[race] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

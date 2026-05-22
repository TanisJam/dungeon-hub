import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildMonsterEmbed, type MonsterRow } from '../embeds/monster.js';
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
    cr: string | null;
    type: string | null;
  }>;
}

const ENDPOINT = '/api/v1/compendium/monsters';

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('monster')
  .setDescription('Buscar un monster del bestiary')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Monster name (e.g. "ancient red dragon", "goblin", "lich")')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('cr')
      .setDescription('Filtrar por CR (ej. "5", "1/4", "5-10", "<=2", ">=20")')
      .setRequired(false),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = await fetchAutocomplete('monsters', focused);
  await interaction.respond(choices);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawName = interaction.options.getString('name', true);
  const cr = interaction.options.getString('cr', false);
  await interaction.deferReply();

  // Strategy 1: vino de autocomplete → slug|source directo.
  const decoded = decodeChoiceValue(rawName);
  if (decoded) {
    try {
      const row = await api.get<MonsterRow>(
        `${ENDPOINT}/${encodeURIComponent(decoded.slug)}`,
        { campaign: env.CAMPAIGN_ID, source: decoded.source },
      );
      await interaction.editReply({ embeds: [buildMonsterEmbed(row)] });
      return;
    } catch (err) {
      console.error('[monster] autocomplete lookup failed:', err);
    }
  }

  // Strategy 2: slug exacto.
  const slug = slugify(rawName);
  try {
    const row = await api.get<MonsterRow>(`${ENDPOINT}/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildMonsterEmbed(row)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[monster] direct lookup failed:', err);
      await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
      return;
    }
  }

  // Strategy 3: search por nombre con filtros + picker para más matches.
  try {
    const searchTerm = rawName.replace(/[-_]+/g, ' ').trim();
    const params: Record<string, string | number> = {
      campaign: env.CAMPAIGN_ID,
      q: searchTerm,
      limit: 25,
    };
    if (cr) params['cr'] = cr;

    const list = await api.get<ListResponse>(ENDPOINT, params);
    const first = list.data[0];
    if (!first) {
      const crNote = cr ? ` con CR ${cr}` : '';
      await interaction.editReply(
        `No encontré ningún monster llamado "${rawName}"${crNote}.`,
      );
      return;
    }
    const row = await api.get<MonsterRow>(
      `${ENDPOINT}/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    const pickerRow = buildPickerRow('monsters', list.data, encodeChoiceValue(first));
    await interaction.editReply({
      embeds: [buildMonsterEmbed(row)],
      components: pickerRow ? [pickerRow] : [],
    });
  } catch (err) {
    console.error('[monster] search fallback failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

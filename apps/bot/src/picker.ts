import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type StringSelectMenuInteraction,
  type EmbedBuilder,
} from 'discord.js';
import { api } from './api-client.js';
import { env } from './env.js';
import { encodeChoiceValue, type Resource } from './autocomplete.js';
import { buildSpellEmbed, type SpellRow } from './embeds/spell.js';
import { buildFeatEmbed, type FeatRow } from './embeds/feat.js';
import { buildItemEmbed, type ItemRow } from './embeds/item.js';
import { buildRaceEmbed, type RaceRow } from './embeds/race.js';
import { buildClassEmbed, type ClassRow } from './embeds/class.js';
import { buildMonsterEmbed, type MonsterRow } from './embeds/monster.js';

/**
 * Custom_id format para identificar el picker en MessageComponent interactions.
 * `pick:{resource}` — el value de cada option encodea slug|source vía encodeChoiceValue.
 */
const PICKER_PREFIX = 'pick:';

export function isPickerCustomId(customId: string): boolean {
  return customId.startsWith(PICKER_PREFIX);
}

interface CandidateRow {
  slug: string;
  source: string;
  name: string;
}

/**
 * Construye el select menu con candidates alternativos. El primer candidate
 * normalmente es el que ya se está mostrando como embed — lo excluimos.
 *
 * Devuelve null si solo hay 1 candidato (no hace falta picker).
 */
export function buildPickerRow(
  resource: Resource,
  candidates: CandidateRow[],
  selectedValue?: string,
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (candidates.length <= 1) return null;

  // Discord limita a 25 opciones por menu.
  const options = candidates.slice(0, 25).map((row) => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(truncate(row.name, 100))
      .setValue(encodeChoiceValue(row))
      .setDescription(truncate(`source: ${row.source}`, 100));
    if (selectedValue && encodeChoiceValue(row) === selectedValue) {
      opt.setDefault(true);
    }
    return opt;
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${PICKER_PREFIX}${resource}`)
    .setPlaceholder('Más resultados — elegí otro')
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Handler para cuando el usuario clickea una opción del select menu.
 * Re-fetcha el item completo y reemplaza el embed. El select menu queda
 * intacto (Discord lo mantiene visible con su estado) para permitir más cambios.
 */
export async function handlePickerInteraction(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const resource = interaction.customId.slice(PICKER_PREFIX.length) as Resource;
  const value = interaction.values[0];
  if (!value) {
    await interaction.deferUpdate();
    return;
  }
  const [slug, source] = value.split('|');
  if (!slug || !source) {
    await interaction.deferUpdate();
    return;
  }

  await interaction.deferUpdate();

  try {
    const embed = await fetchAndBuildEmbed(resource, slug, source);
    // Solo actualizamos el embed — components quedan tal cual están en el mensaje.
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(`[picker ${resource}] failed:`, err);
    await interaction
      .followUp({
        content: `Error al cargar el item: ${err instanceof Error ? err.message : 'unknown'}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }
}

async function fetchAndBuildEmbed(
  resource: Resource,
  slug: string,
  source: string,
): Promise<EmbedBuilder> {
  const base = `/api/v1/compendium/${resource}/${encodeURIComponent(slug)}`;
  const query = { campaign: env.CAMPAIGN_ID, source };

  switch (resource) {
    case 'spells': {
      const row = await api.get<SpellRow>(base, query);
      return buildSpellEmbed(row);
    }
    case 'feats': {
      const row = await api.get<FeatRow>(base, query);
      return buildFeatEmbed(row);
    }
    case 'items': {
      const row = await api.get<ItemRow>(base, query);
      return buildItemEmbed(row);
    }
    case 'races': {
      const row = await api.get<RaceRow>(base, query);
      return buildRaceEmbed(row);
    }
    case 'classes': {
      const row = await api.get<ClassRow>(base, query);
      return buildClassEmbed(row, null);
    }
    case 'monsters': {
      const row = await api.get<MonsterRow>(base, query);
      return buildMonsterEmbed(row);
    }
  }
}

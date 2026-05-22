import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { api } from '../api-client.js';
import { env } from '../env.js';
import {
  buildHexDetailEmbed,
  buildHexListEmbed,
  type HexRow,
  type PoiRow,
} from '../embeds/hex.js';

function endpoint(path: string): string {
  return `/api/v1/campaigns/${env.CAMPAIGN_ID}${path}`;
}

export const data: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
  .setName('map')
  .setDescription('West Marches hexcrawl map: list, show')
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List hexes in the campaign')
      .addStringOption((opt) =>
        opt
          .setName('scope')
          .setDescription('Top-level hexes (default) or all visible')
          .setRequired(false)
          .addChoices(
            { name: 'top (regions)', value: 'top' },
            { name: 'all visible', value: 'all' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('show')
      .setDescription('Show a hex with its POIs')
      .addStringOption((opt) =>
        opt
          .setName('hex')
          .setDescription('Hex name or coords (autocompletes)')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.options.getSubcommand() !== 'show') {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused().toLowerCase().trim();
  try {
    const list = await api.get<{ data: HexRow[] }>(endpoint('/hexes'), { parent: 'all' });
    const filtered = focused
      ? list.data.filter((h) => {
          const name = (h.name ?? '').toLowerCase();
          const coords = `${h.q},${h.r}`;
          return name.includes(focused) || coords.includes(focused);
        })
      : list.data;
    const choices = filtered.slice(0, 25).map((h) => ({
      name: truncate(`${h.name ?? '(unnamed)'} (${h.q},${h.r}) ${h.status}`, 100),
      value: h.id,
    }));
    await interaction.respond(choices);
  } catch (err) {
    console.error('[map] autocomplete failed:', err);
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return runList(interaction);
  if (sub === 'show') return runShow(interaction);
}

async function runList(interaction: ChatInputCommandInteraction): Promise<void> {
  const scope = interaction.options.getString('scope', false) ?? 'top';
  await interaction.deferReply();
  try {
    const list = await api.get<{ data: HexRow[] }>(endpoint('/hexes'), { parent: scope });
    await interaction.editReply({ embeds: [buildHexListEmbed(list.data)] });
  } catch (err) {
    console.error('[map list] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

async function runShow(interaction: ChatInputCommandInteraction): Promise<void> {
  const idOrName = interaction.options.getString('hex', true);
  await interaction.deferReply();
  try {
    let hexId = idOrName;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName)) {
      // Búsqueda por nombre (case-insensitive contains) o por coords "q,r".
      const list = await api.get<{ data: HexRow[] }>(endpoint('/hexes'), { parent: 'all' });
      const lower = idOrName.toLowerCase();
      const match = list.data.find((h) => {
        if ((h.name ?? '').toLowerCase().includes(lower)) return true;
        if (`${h.q},${h.r}` === lower.replace(/\s/g, '')) return true;
        return false;
      });
      if (!match) {
        await interaction.editReply(`No encontré ningún hex "${idOrName}".`);
        return;
      }
      hexId = match.id;
    }

    const [hex, pois] = await Promise.all([
      api.get<HexRow>(`/api/v1/hexes/${encodeURIComponent(hexId)}`),
      api.get<{ data: PoiRow[] }>(`/api/v1/hexes/${encodeURIComponent(hexId)}/pois`),
    ]);
    await interaction.editReply({ embeds: [buildHexDetailEmbed(hex, pois.data)] });
  } catch (err) {
    console.error('[map show] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

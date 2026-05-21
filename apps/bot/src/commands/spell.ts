import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';
import { env } from '../env.js';
import { buildSpellEmbed, type SpellRow } from '../embeds/spell.js';

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface SpellListResponse {
  data: Array<{ slug: string; source: string; name: string; level: number; school: string }>;
  total: number;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('spell')
  .setDescription('Look up a D&D 5e spell from the campaign compendium')
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Spell name (e.g. "fireball", "misty step")').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  const slug = slugify(name);

  // Intento 1: lookup directo por slug. Es lo más común y barato.
  try {
    const spell = await api.get<SpellRow>(`/api/v1/compendium/spells/${encodeURIComponent(slug)}`, {
      campaign: env.CAMPAIGN_ID,
    });
    await interaction.editReply({ embeds: [buildSpellEmbed(spell)] });
    return;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      console.error('[spell] direct lookup failed:', err);
      await interaction.editReply(`Error consultando el compendium: ${err instanceof Error ? err.message : 'unknown'}`);
      return;
    }
    // 404 → fallback a búsqueda por substring
  }

  // Intento 2: search por nombre. Tomamos el primer resultado.
  try {
    const list = await api.get<SpellListResponse>('/api/v1/compendium/spells', {
      campaign: env.CAMPAIGN_ID,
      q: name,
      limit: 1,
    });
    const first = list.data[0];
    if (!first) {
      await interaction.editReply(`No encontré ningún spell llamado "${name}" en este compendium.`);
      return;
    }
    const spell = await api.get<SpellRow>(
      `/api/v1/compendium/spells/${encodeURIComponent(first.slug)}`,
      { campaign: env.CAMPAIGN_ID, source: first.source },
    );
    await interaction.editReply({ embeds: [buildSpellEmbed(spell)] });
  } catch (err) {
    console.error('[spell] search fallback failed:', err);
    await interaction.editReply(`Error consultando el compendium: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

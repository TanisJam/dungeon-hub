import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, LinkRequiredError } from '../api-client.js';
import { env } from '../env.js';
import {
  buildCharacterSheetEmbed,
  type CharacterRow,
  type CharacterDetail,
  type CharacterSheetResponse,
  type RecentGrant,
} from '../embeds/character.js';

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('mi-hoja')
  .setDescription('Mostrar tu character activo (solo vos lo ves)');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const list = await api.getAs<{ data: CharacterRow[] }>(
      interaction.user.id,
      '/api/v1/characters',
      { campaign: env.CAMPAIGN_ID, status: 'active' },
    );

    if (list.data.length === 0) {
      await interaction.editReply(
        'No tenés un character activo. Creá uno en la web app y pedile al GM que lo apruebe.',
      );
      return;
    }

    if (list.data.length > 1) {
      const names = list.data.map((c) => `• ${c.name}`).join('\n');
      await interaction.editReply(
        `Tenés ${list.data.length} characters activos:\n${names}\n\nUsá \`/character show name:<nombre>\` para elegir uno.`,
      );
      return;
    }

    const id = list.data[0]!.id;
    const [detail, sheetRes, grantsRes] = await Promise.all([
      api.getAs<CharacterDetail>(interaction.user.id, `/api/v1/characters/${id}`),
      api.getAs<CharacterSheetResponse>(interaction.user.id, `/api/v1/characters/${id}/sheet`),
      api
        .getAs<{ events: RecentGrant[] }>(
          interaction.user.id,
          `/api/v1/characters/${id}/recent-grants`,
          { limit: 3 },
        )
        .catch(() => ({ events: [] as RecentGrant[] })),
    ]);

    await interaction.editReply({
      embeds: [buildCharacterSheetEmbed(detail, sheetRes, grantsRes.events)],
    });
  } catch (err) {
    if (err instanceof LinkRequiredError) {
      await interaction.editReply(
        'Para usar este comando tenés que vincular tu Discord. Hacé `/link` y seguí los pasos.',
      );
      return;
    }
    console.error('[mi-hoja] failed:', err);
    await interaction.editReply(
      `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}

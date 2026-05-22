import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, ApiError } from '../api-client.js';

interface LinkRequestResponse {
  token: string;
  url: string;
  expiresAt: string;
  ttlSeconds: number;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Vincular tu cuenta de Discord con tu user del backend');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Ephemeral: solo el user que invocó ve la respuesta. El link es de un solo
  // uso pero igual no queremos que aparezca en el canal público.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordId = interaction.user.id;
  const discordUsername = interaction.user.username;

  try {
    const res = await api.post<LinkRequestResponse>('/api/v1/auth/link/request', {
      discord_id: discordId,
      discord_username: discordUsername,
    });

    const ttlMin = Math.round(res.ttlSeconds / 60);
    await interaction.editReply({
      content:
        `🔗 **Vinculá tu cuenta de Discord**\n\n` +
        `Abrí este link en el navegador y confirmá:\n${res.url}\n\n` +
        `⏱ El link vence en ${ttlMin} minutos.\n` +
        `⚠️ Vas a tener que loguearte con tu cuenta del backend (Supabase) para confirmar.`,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      await interaction.editReply({
        content:
          '✓ Tu Discord ya está vinculado a una cuenta del backend. ' +
          'Si querés cambiarlo, contactá al GM.',
      });
      return;
    }
    console.error('[link] failed:', err);
    await interaction.editReply({
      content: `❌ Error generando el link: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
}

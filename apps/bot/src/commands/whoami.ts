import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, LinkRequiredError } from '../api-client.js';

interface MeResponse {
  id: string;
  username: string;
  role: 'player' | 'gm' | 'admin';
  discordId: string | null;
  discordUsername: string | null;
  canImpersonate: boolean;
  impersonatedBy: string | null;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('whoami')
  .setDescription('Mostrar tu Discord ID y estado de vinculación');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordId = interaction.user.id;
  const discordTag = interaction.user.username;

  try {
    const me = await api.getAs<MeResponse>(discordId, '/api/v1/auth/me');
    await interaction.editReply({
      content:
        `**Tu identidad**\n` +
        `Discord: \`${discordTag}\` (${discordId})\n` +
        `Backend user: \`${me.username}\` (role: ${me.role})\n` +
        `✓ Vinculación activa.`,
    });
  } catch (err) {
    if (err instanceof LinkRequiredError) {
      await interaction.editReply({
        content:
          `**Tu identidad**\n` +
          `Discord: \`${discordTag}\` (${discordId})\n` +
          `Backend user: ❌ no vinculado\n\n` +
          `Hacé \`/link\` para vincular tu cuenta y empezar a usar los comandos de personaje.`,
      });
      return;
    }
    console.error('[whoami] failed:', err);
    await interaction.editReply({
      content: `❌ Error: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
}

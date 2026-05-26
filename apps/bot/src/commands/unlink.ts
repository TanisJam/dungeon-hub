import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { api, LinkRequiredError } from '../api-client.js';

interface RevokeResponse {
  ok: true;
  previousDiscordId: string | null;
  previousDiscordUsername: string | null;
}

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription('Desvincular tu cuenta de Discord del backend (revertible con /link)');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordId = interaction.user.id;

  try {
    const res = await api.postAs<RevokeResponse>(discordId, '/api/v1/auth/link/revoke');
    await interaction.editReply({
      content:
        `✓ Cuenta desvinculada.\n\n` +
        `Tu Discord (\`${discordId}\`) ya no apunta a ningún user del backend. ` +
        `Hacé \`/link\` para vincular otra cuenta.`,
    });
    // Useful for the case where the caller already wasn't linked (postAs would have thrown).
    // Kept here for completeness — the previous fields are surfaced for transparency.
    void res;
  } catch (err) {
    if (err instanceof LinkRequiredError) {
      await interaction.editReply({
        content:
          `Tu Discord no está vinculado a ninguna cuenta del backend. ` +
          `No hay nada que desvincular. Hacé \`/link\` si querés vincular una cuenta.`,
      });
      return;
    }
    console.error('[unlink] failed:', err);
    await interaction.editReply({
      content: `❌ Error: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
}

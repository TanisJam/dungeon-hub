import {
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { api } from '../api-client.js';
import { env } from '../env.js';
import {
  buildSessionDetailEmbed,
  buildSessionListItem,
  type SessionDetail,
  type SessionRow,
  type SessionStatus,
} from '../embeds/session.js';

const ENDPOINT = '/api/v1/sessions';

const STATUS_CHOICES: Array<{ name: string; value: SessionStatus }> = [
  { name: 'scheduled', value: 'scheduled' },
  { name: 'active', value: 'active' },
  { name: 'paused', value: 'paused' },
  { name: 'completed', value: 'completed' },
  { name: 'cancelled', value: 'cancelled' },
];

export const data: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
  .setName('session')
  .setDescription('West Marches sessions: list, show')
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List sessions in the campaign')
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('Filter by status')
          .setRequired(false)
          .addChoices(...STATUS_CHOICES),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('show')
      .setDescription('Show details of a session')
      .addStringOption((opt) =>
        opt
          .setName('session')
          .setDescription('Session title (autocompletes)')
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
    const list = await api.get<{ data: SessionRow[] }>(ENDPOINT, {
      campaignId: env.CAMPAIGN_ID,
    });
    // Discord no filtra por nosotros: matcheamos en cliente y devolvemos hasta 25.
    const filtered = focused
      ? list.data.filter((s) => s.title.toLowerCase().includes(focused))
      : list.data;
    const choices = filtered.slice(0, 25).map((s) => ({
      name: truncate(`${s.title} (${s.status})`, 100),
      value: s.id,
    }));
    await interaction.respond(choices);
  } catch (err) {
    console.error('[session] autocomplete failed:', err);
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return runList(interaction);
  if (sub === 'show') return runShow(interaction);
}

async function runList(interaction: ChatInputCommandInteraction): Promise<void> {
  const status = interaction.options.getString('status', false) as SessionStatus | null;
  await interaction.deferReply();

  try {
    const params: Record<string, string> = { campaignId: env.CAMPAIGN_ID };
    if (status) params['status'] = status;
    const list = await api.get<{ data: SessionRow[] }>(ENDPOINT, params);

    if (list.data.length === 0) {
      const tag = status ? ` con status \`${status}\`` : '';
      await interaction.editReply(`No hay sesiones${tag} en esta campaña.`);
      return;
    }

    // Embed con resumen — máx 25 sesiones por embed.
    const description = list.data
      .slice(0, 25)
      .map((s) => `• ${buildSessionListItem(s)}`)
      .join('\n\n');

    const titleSuffix = status ? ` (${status})` : '';
    const footer =
      list.data.length > 25 ? `Mostrando 25 de ${list.data.length}` : `${list.data.length} sesiones`;

    const embed = new EmbedBuilder()
      .setTitle(`Sesiones${titleSuffix}`)
      .setDescription(truncate(description, 4000))
      .setColor(0x9b59b6)
      .setFooter({ text: footer });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[session list] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

async function runShow(interaction: ChatInputCommandInteraction): Promise<void> {
  const idOrTitle = interaction.options.getString('session', true);
  await interaction.deferReply();

  try {
    // Si vino de autocomplete, idOrTitle es el UUID. Si es texto raw, intentamos
    // buscar por título (case-insensitive contains) en la lista de la campaña.
    let sessionId = idOrTitle;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrTitle)) {
      const list = await api.get<{ data: SessionRow[] }>(ENDPOINT, {
        campaignId: env.CAMPAIGN_ID,
      });
      const lower = idOrTitle.toLowerCase();
      const match = list.data.find((s) => s.title.toLowerCase().includes(lower));
      if (!match) {
        await interaction.editReply(`No encontré ninguna sesión llamada "${idOrTitle}".`);
        return;
      }
      sessionId = match.id;
    }

    const detail = await api.get<SessionDetail>(`${ENDPOINT}/${encodeURIComponent(sessionId)}`);
    await interaction.editReply({ embeds: [buildSessionDetailEmbed(detail)] });
  } catch (err) {
    console.error('[session show] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

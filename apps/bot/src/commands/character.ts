import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { api, LinkRequiredError } from '../api-client.js';
import { env } from '../env.js';
import {
  buildCharacterSheetEmbed,
  buildCharactersListEmbed,
  type CharacterDetail,
  type CharacterRow,
  type CharacterSheetResponse,
} from '../embeds/character.js';

export const data: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
  .setName('character')
  .setDescription('Tus characters: list, show')
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Lista todos tus characters en la campaign'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('show')
      .setDescription('Ver la ficha de uno de tus characters')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Character name (autocompletes)')
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
    const list = await api.getAs<{ data: CharacterRow[] }>(
      interaction.user.id,
      '/api/v1/characters',
      { campaign: env.CAMPAIGN_ID },
    );
    const filtered = focused
      ? list.data.filter((c) => c.name.toLowerCase().includes(focused))
      : list.data;
    const choices = filtered.slice(0, 25).map((c) => ({
      name: `${c.name} (${c.status})`.slice(0, 100),
      value: c.id,
    }));
    await interaction.respond(choices);
  } catch (err) {
    // Si el user no está linkeado el autocomplete devuelve []. El comando real
    // mostrará el mensaje de error en su execute.
    if (!(err instanceof LinkRequiredError)) {
      console.error('[character] autocomplete failed:', err);
    }
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return runList(interaction);
  if (sub === 'show') return runShow(interaction);
}

async function replyLinkRequired(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.editReply({
    content:
      `Para usar los comandos de personaje primero tenés que vincular tu Discord ` +
      `con tu cuenta del backend. Hacé \`/link\` y seguí los pasos.`,
  });
}

async function runList(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const list = await api.getAs<{ data: CharacterRow[] }>(
      interaction.user.id,
      '/api/v1/characters',
      { campaign: env.CAMPAIGN_ID },
    );
    await interaction.editReply({ embeds: [buildCharactersListEmbed(list.data)] });
  } catch (err) {
    if (err instanceof LinkRequiredError) return replyLinkRequired(interaction);
    console.error('[character list] failed:', err);
    await interaction.editReply({ content: `Error: ${err instanceof Error ? err.message : 'unknown'}` });
  }
}

async function runShow(interaction: ChatInputCommandInteraction): Promise<void> {
  const idOrName = interaction.options.getString('name', true);
  await interaction.deferReply();
  try {
    // Si vino de autocomplete, idOrName es UUID; si no, buscar por nombre.
    let characterId = idOrName;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName)) {
      const list = await api.getAs<{ data: CharacterRow[] }>(
        interaction.user.id,
        '/api/v1/characters',
        { campaign: env.CAMPAIGN_ID },
      );
      const lower = idOrName.toLowerCase();
      const match = list.data.find((c) => c.name.toLowerCase().includes(lower));
      if (!match) {
        await interaction.editReply(`No encontré ningún character llamado "${idOrName}".`);
        return;
      }
      characterId = match.id;
    }

    // El sheet endpoint trae el cómputo derivado; el detail trae los raw
    // (incluye current HP que el sheet no tiene). Las traemos en paralelo.
    const [detail, sheetRes] = await Promise.all([
      api.getAs<CharacterDetail>(interaction.user.id, `/api/v1/characters/${characterId}`),
      api.getAs<CharacterSheetResponse>(
        interaction.user.id,
        `/api/v1/characters/${characterId}/sheet`,
      ),
    ]);

    await interaction.editReply({
      embeds: [buildCharacterSheetEmbed(detail, sheetRes.sheet)],
    });
  } catch (err) {
    if (err instanceof LinkRequiredError) return replyLinkRequired(interaction);
    console.error('[character show] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

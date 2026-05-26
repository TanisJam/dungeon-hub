import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { api, ApiError, LinkRequiredError } from '../api-client.js';
import { env } from '../env.js';
import {
  buildCharacterSheetEmbed,
  buildCharactersListEmbed,
  buildHpDeltaEmbed,
  buildLongRestEmbed,
  buildShortRestEmbed,
  type CharacterDetail,
  type CharacterRow,
  type CharacterSheetResponse,
  type HpDeltaResponse,
  type LongRestResponse,
  type ShortRestResponse,
  type RecentGrant,
} from '../embeds/character.js';

const REST_TYPES = [
  { name: 'short', value: 'short' as const },
  { name: 'long', value: 'long' as const },
];

export const data: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
  .setName('character')
  .setDescription('Tus characters: list, show, hp, rest')
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
  )
  .addSubcommand((sub) =>
    sub
      .setName('hp')
      .setDescription('Aplicar daño (negativo) o curación (positivo)')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Character name (autocompletes)')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('delta')
          .setDescription('Cambio de HP (ej. -8 para daño, +5 para cura)')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('note')
          .setDescription('Nota opcional (ej. "fireball del lich")')
          .setRequired(false)
          .setMaxLength(200),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('rest')
      .setDescription('Tomar un short rest o long rest')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Character name (autocompletes)')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Tipo de descanso')
          .setRequired(true)
          .addChoices(...REST_TYPES),
      ),
  );

const SUBCOMMANDS_WITH_NAME_AUTOCOMPLETE = new Set(['show', 'hp', 'rest']);

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!SUBCOMMANDS_WITH_NAME_AUTOCOMPLETE.has(interaction.options.getSubcommand())) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused().toLowerCase().trim();
  try {
    // SCN-BOT-05: autocomplete should only surface active characters for players.
    const list = await api.getAs<{ data: CharacterRow[] }>(
      interaction.user.id,
      '/api/v1/characters',
      { campaign: env.CAMPAIGN_ID, status: 'active' },
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
  if (sub === 'hp') return runHp(interaction);
  if (sub === 'rest') return runRest(interaction);
}

async function replyLinkRequired(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.editReply({
    content:
      `Para usar los comandos de personaje primero tenés que vincular tu Discord ` +
      `con tu cuenta del backend. Hacé \`/link\` y seguí los pasos.`,
  });
}

async function replyForbidden(
  interaction: ChatInputCommandInteraction,
  err: ApiError,
): Promise<void> {
  // FORBIDDEN típicamente significa: no sos owner del character.
  const msg = err.body.includes('Solo el dueño')
    ? 'Solo podés modificar tu propio character (no el de otro jugador).'
    : `Permiso denegado: ${err.body}`;
  await interaction.editReply({ content: `❌ ${msg}` });
}

/**
 * Resuelve un character por id (UUID directo, vía autocomplete) o por nombre
 * (substring match en /characters del user actual). Devuelve null si no
 * encuentra y ya respondió al usuario con el mensaje "no encontré".
 */
async function resolveCharacterId(
  interaction: ChatInputCommandInteraction,
  idOrName: string,
): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName)) {
    return idOrName;
  }
  const list = await api.getAs<{ data: CharacterRow[] }>(
    interaction.user.id,
    '/api/v1/characters',
    { campaign: env.CAMPAIGN_ID },
  );
  const lower = idOrName.toLowerCase();
  const match = list.data.find((c) => c.name.toLowerCase().includes(lower));
  if (!match) {
    await interaction.editReply(`No encontré ningún character llamado "${idOrName}".`);
    return null;
  }
  return match.id;
}

async function runList(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    // SCN-BOT-01: players see only active characters. No GM context in bot v1.
    const list = await api.getAs<{ data: CharacterRow[] }>(
      interaction.user.id,
      '/api/v1/characters',
      { campaign: env.CAMPAIGN_ID, status: 'active' },
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
    const characterId = await resolveCharacterId(interaction, idOrName);
    if (!characterId) return;

    // El sheet endpoint trae el cómputo derivado; el detail trae los raw
    // (incluye current HP que el sheet no tiene). Las traemos en paralelo.
    const [detail, sheetRes, grantsRes] = await Promise.all([
      api.getAs<CharacterDetail>(interaction.user.id, `/api/v1/characters/${characterId}`),
      api.getAs<CharacterSheetResponse>(
        interaction.user.id,
        `/api/v1/characters/${characterId}/sheet`,
      ),
      api
        .getAs<{ events: RecentGrant[] }>(
          interaction.user.id,
          `/api/v1/characters/${characterId}/recent-grants`,
          { limit: 3 },
        )
        .catch(() => ({ events: [] as RecentGrant[] })),
    ]);

    await interaction.editReply({
      embeds: [buildCharacterSheetEmbed(detail, sheetRes, grantsRes.events)],
    });
  } catch (err) {
    if (err instanceof LinkRequiredError) return replyLinkRequired(interaction);
    console.error('[character show] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

async function runHp(interaction: ChatInputCommandInteraction): Promise<void> {
  const idOrName = interaction.options.getString('name', true);
  const delta = interaction.options.getInteger('delta', true);
  const note = interaction.options.getString('note', false);

  if (delta === 0) {
    await interaction.reply({
      content: 'El delta no puede ser 0 — usá un número positivo (cura) o negativo (daño).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  try {
    const characterId = await resolveCharacterId(interaction, idOrName);
    if (!characterId) return;

    const body: { delta: number; note?: string } = { delta };
    if (note) body.note = note;

    const res = await api.postAs<HpDeltaResponse>(
      interaction.user.id,
      `/api/v1/characters/${characterId}/hp`,
      body,
    );
    await interaction.editReply({
      embeds: [buildHpDeltaEmbed(res, note ?? null)],
    });
  } catch (err) {
    if (err instanceof LinkRequiredError) return replyLinkRequired(interaction);
    if (err instanceof ApiError && err.status === 403) return replyForbidden(interaction, err);
    if (err instanceof ApiError && err.status === 400 && err.body.includes('HP_NOT_INITIALIZED')) {
      await interaction.editReply({
        content:
          '⚠️ Este character no tiene HP max definido todavía. ' +
          'Hacé `/character rest name:<nombre> type:long` primero para inicializarlo.',
      });
      return;
    }
    console.error('[character hp] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

async function runRest(interaction: ChatInputCommandInteraction): Promise<void> {
  const idOrName = interaction.options.getString('name', true);
  const type = interaction.options.getString('type', true) as 'short' | 'long';

  await interaction.deferReply();
  try {
    const characterId = await resolveCharacterId(interaction, idOrName);
    if (!characterId) return;

    if (type === 'long') {
      const res = await api.postAs<LongRestResponse>(
        interaction.user.id,
        `/api/v1/characters/${characterId}/rest/long`,
        {},
      );
      await interaction.editReply({ embeds: [buildLongRestEmbed(res)] });
    } else {
      // Short rest sin gastar hit dice por defecto — el jugador puede pasar
      // hitDiceToSpend manualmente, pero para MVP del bot solo refrescamos
      // los recursos que no requieren input (warlock slots, charges, etc.).
      // El backend acepta body vacío y devuelve hpRecovered=0.
      const res = await api.postAs<ShortRestResponse>(
        interaction.user.id,
        `/api/v1/characters/${characterId}/rest/short`,
        {},
      );
      await interaction.editReply({ embeds: [buildShortRestEmbed(res)] });
    }
  } catch (err) {
    if (err instanceof LinkRequiredError) return replyLinkRequired(interaction);
    if (err instanceof ApiError && err.status === 403) return replyForbidden(interaction, err);
    console.error('[character rest] failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}


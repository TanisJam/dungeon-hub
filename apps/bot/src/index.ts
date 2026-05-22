import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { env } from './env.js';
import { commands } from './commands/index.js';
import { api } from './api-client.js';
import { handlePickerInteraction, isPickerCustomId } from './picker.js';

const client = new Client({
  // Solo necesitamos guild interactions para slash commands. No leemos contenido
  // de mensajes, no escuchamos miembros — privilegio mínimo.
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✓ Bot logged in as ${c.user.tag}`);
  // Warm up: hacemos un login contra Supabase para que el token quede cacheado
  // antes de la primera interacción. Si falla acá, falla loud antes de que un
  // user tipee un comando.
  try {
    await api.ensureToken();
    console.log('✓ Supabase auth ready');
  } catch (err) {
    console.error('✗ Supabase auth failed — bot is up but API calls will fail:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Autocomplete: Discord da 3s para responder, no podemos defer. Delegamos
  // al handler del comando si existe; si no, silencio (Discord muestra "loading").
  if (interaction.isAutocomplete()) {
    const command = commands[interaction.commandName];
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      console.error(`[bot] autocomplete ${interaction.commandName} failed:`, err);
      // Best-effort: respondemos vacío para no dejar el dropdown colgado.
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  // Picker select menu: user clickeó otra opción del dropdown de candidates.
  if (interaction.isStringSelectMenu() && isPickerCustomId(interaction.customId)) {
    try {
      await handlePickerInteraction(interaction);
    } catch (err) {
      console.error(`[bot] picker ${interaction.customId} failed:`, err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands[interaction.commandName];
  if (!command) {
    console.warn(`[bot] unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[bot] command ${interaction.commandName} failed:`, err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`⚠️ Error: ${msg}`).catch(() => {});
    } else {
      await interaction
        .reply({ content: `⚠️ Error: ${msg}`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
});

client.login(env.DISCORD_TOKEN).catch((err) => {
  console.error('Failed to log in to Discord:', err);
  process.exit(1);
});

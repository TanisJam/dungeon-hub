import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { env } from './env.js';
import { commands } from './commands/index.js';
import { api } from './api-client.js';

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

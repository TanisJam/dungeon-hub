/**
 * Registra los slash commands del bot en Discord.
 *
 * - Si `DISCORD_GUILD_ID` está definido: registra como GUILD commands (instantáneo).
 *   Usar en dev para iterar rápido.
 * - Si no está: registra como GLOBAL commands (tarda hasta 1h en propagar).
 *   Usar solo en producción.
 *
 * Correr con: `pnpm --filter @dungeon-hub/bot register-commands`
 */
import { REST, Routes } from 'discord.js';
import { env } from '../env.js';
import { commands } from '../commands/index.js';

async function main() {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const body = Object.values(commands).map((c) => c.data.toJSON());

  if (env.DISCORD_GUILD_ID) {
    const route = Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID);
    const result = (await rest.put(route, { body })) as unknown[];
    console.log(`✓ Registered ${result.length} guild commands in ${env.DISCORD_GUILD_ID}`);
  } else {
    const route = Routes.applicationCommands(env.DISCORD_CLIENT_ID);
    const result = (await rest.put(route, { body })) as unknown[];
    console.log(`✓ Registered ${result.length} global commands (may take up to 1h to propagate)`);
  }
}

main().catch((err) => {
  console.error('Failed to register commands:', err);
  process.exit(1);
});

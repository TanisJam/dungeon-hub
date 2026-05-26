import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import * as spell from './spell.js';
import * as feat from './feat.js';
import * as item from './item.js';
import * as race from './race.js';
import * as klass from './class.js';
import * as session from './session.js';
import * as world from './world.js';
import * as lore from './lore.js';
import * as wmap from './map.js';
import * as link from './link.js';
import * as whoami from './whoami.js';
import * as character from './character.js';
import * as monster from './monster.js';
import * as miHoja from './mi-hoja.js';

/**
 * Discord.js v14 separa los builders por shape — los simples sin subcomandos son
 * `SlashCommandOptionsOnlyBuilder`, los que tienen subcomandos son
 * `SlashCommandSubcommandsOnlyBuilder`. Aceptamos cualquiera de los 3 shapes
 * porque para registrarlos solo necesitamos `.toJSON()`.
 */
export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface Command {
  data: CommandData;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Record<string, Command> = {
  [spell.data.name]: spell,
  [feat.data.name]: feat,
  [item.data.name]: item,
  [race.data.name]: race,
  [klass.data.name]: klass,
  [session.data.name]: session,
  [world.data.name]: world,
  [lore.data.name]: lore,
  [wmap.data.name]: wmap,
  [link.data.name]: link,
  [whoami.data.name]: whoami,
  [character.data.name]: character,
  [monster.data.name]: monster,
  [miHoja.data.name]: miHoja,
};

import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import * as spell from './spell.js';
import * as feat from './feat.js';
import * as item from './item.js';
import * as race from './race.js';
import * as klass from './class.js';

export interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Record<string, Command> = {
  [spell.data.name]: spell,
  [feat.data.name]: feat,
  [item.data.name]: item,
  [race.data.name]: race,
  [klass.data.name]: klass,
};

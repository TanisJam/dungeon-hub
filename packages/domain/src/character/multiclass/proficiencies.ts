/**
 * Tabla de proficiencies de multiclass según PHB p.164 (más Artificer TCE p.7).
 *
 * IMPORTANTE: estas son las profs REDUCIDAS que ganás al ENTRAR multiclass,
 * NO las profs completas que da la clase a un personaje que la elige de inicio.
 *
 * Algunas clases (Bard, Ranger, Rogue) dejan elegir una skill extra al
 * multiclassing — la lista de la cual elegir vive en `skillPool`.
 *
 * Ítems "anyX" en toolChoices: el user provee strings concretos en el body.
 */
export interface MulticlassProficiencies {
  armor: string[];
  weapons: string[];
  /** Tools fijas (ej. "thieves' tools"). */
  tools: string[];
  /** Tools "a elegir" tipo "anyMusicalInstrument: 1". */
  toolChoices?: Array<{ kind: string; count: number }>;
  /** Si esta clase otorga 1 skill al multiclassing. */
  skillCount?: number;
  /**
   * Pool de skills de la cual elegir.
   *   - 'any' → cualquier skill del juego (Bard).
   *   - string[] → lista concreta (Ranger usa su class skill list; Rogue idem).
   */
  skillPool?: 'any' | readonly string[];
}

const RANGER_SKILL_POOL = [
  'animal handling',
  'athletics',
  'insight',
  'investigation',
  'nature',
  'perception',
  'stealth',
  'survival',
] as const;

const ROGUE_SKILL_POOL = [
  'acrobatics',
  'athletics',
  'deception',
  'insight',
  'intimidation',
  'investigation',
  'perception',
  'performance',
  'persuasion',
  'sleight of hand',
  'stealth',
] as const;

export const MULTICLASS_PROFICIENCIES: Readonly<Record<string, MulticlassProficiencies>> =
  Object.freeze({
    barbarian: { armor: ['shield'], weapons: ['simple', 'martial'], tools: [] },
    bard: {
      armor: ['light'],
      weapons: [],
      tools: [],
      toolChoices: [{ kind: 'anyMusicalInstrument', count: 1 }],
      skillCount: 1,
      skillPool: 'any',
    },
    cleric: { armor: ['light', 'medium', 'shield'], weapons: [], tools: [] },
    druid: { armor: ['light', 'medium', 'shield'], weapons: [], tools: [] },
    fighter: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
    },
    monk: { armor: [], weapons: ['simple', 'shortswords'], tools: [] },
    paladin: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
    },
    ranger: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
      skillCount: 1,
      skillPool: RANGER_SKILL_POOL,
    },
    rogue: {
      armor: ['light'],
      weapons: [],
      tools: ["thieves' tools"],
      skillCount: 1,
      skillPool: ROGUE_SKILL_POOL,
    },
    sorcerer: { armor: [], weapons: [], tools: [] },
    warlock: { armor: ['light'], weapons: ['simple'], tools: [] },
    wizard: { armor: [], weapons: [], tools: [] },
    artificer: {
      armor: ['light', 'medium', 'shield'],
      weapons: [],
      tools: ["thieves' tools", "tinker's tools"],
    },
  });

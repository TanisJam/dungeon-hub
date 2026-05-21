/**
 * Spellcasting — slots, pact magic, prep limits.
 *
 * Sources:
 * - Full / half / third caster tables: PHB p.113, Paladin p.85, Ranger p.91,
 *   Eldritch Knight p.74, Arcane Trickster p.98.
 * - Multiclass formula: PHB p.165.
 * - Pact Magic: PHB p.107.
 * - Artificer: TCE p.10 (half-caster con slots a level 1, multiclass ceil/2).
 */

/** Slots por spell level. Índice 0 = 1st level, 1 = 2nd, ..., 8 = 9th. */
export type SpellSlots = readonly [number, number, number, number, number, number, number, number, number];

export const NO_SLOTS: SpellSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0];

export interface PactMagic {
  /** Nivel de los slots de Pact Magic (1..5). */
  slotLevel: number;
  /** Cantidad de slots por short rest. */
  slotCount: number;
}

export interface SpellSlotsResult {
  /** Slots regulares (no incluye pact). Suma de full + multi + half/third single-class. */
  slots: SpellSlots;
  /** Pact Magic de Warlock — separado de los slots regulares (recargan en short rest). */
  pactMagic: PactMagic | null;
}

/**
 * Clasificación del caster por clase (+subclass para third casters).
 *  - full:      Bard, Cleric, Druid, Sorcerer, Wizard
 *  - half:      Paladin, Ranger
 *  - artificer: Artificer (half-caster con peculiaridades — ver compute)
 *  - third:     Fighter[Eldritch Knight], Rogue[Arcane Trickster]
 *  - warlock:   Pact Magic (separado)
 *  - none:      clase sin spellcasting
 */
export type CasterType = 'full' | 'half' | 'artificer' | 'third' | 'warlock' | 'none';

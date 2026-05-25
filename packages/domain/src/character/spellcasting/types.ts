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

// ── Slot Consumption Types (SP-05) ─────────────────────────────────────────

/**
 * Stable string literal union for slot-consumption issue codes.
 * engram #556 convention: count-mismatch uses expectedCount/gotCount;
 * single-value-mismatch uses expected/got.
 */
export type SlotIssueCode =
  | 'SLOT_LEVEL_OUT_OF_RANGE'
  | 'SLOT_NOT_AVAILABLE'
  | 'NO_PACT_MAGIC'
  | 'PACT_LEVEL_MISMATCH';

/** Input to consumeSpellSlot (pure — no IO). */
export interface SlotConsumptionInput {
  /** Max slots per level (9-tuple from computeSpellSlots). */
  slotsMax: SpellSlots;
  /** Slots already used per level (9-tuple, index 0 = level 1). */
  slotsUsed: readonly number[];
  /** Warlock pact magic (null for non-warlocks). */
  pactMagic: PactMagic | null;
  /** Pact slots already used. */
  pactSlotsUsed: number;
  /** Spell level to consume (1..9). */
  level: number;
  /** 'regular' for standard multi-class slot pool; 'pact' for warlock pact magic. */
  slotType: 'regular' | 'pact';
  /** Defaults to 1. Hardcoded to max 1 for MVP per PHB p.201. */
  count?: number;
}

/** Result of consumeSpellSlot. */
export type SlotConsumptionResult =
  | { ok: true; slotsUsed: readonly number[]; pactSlotsUsed: number }
  | {
      ok: false;
      issues: Array<
        | { code: 'SLOT_LEVEL_OUT_OF_RANGE'; got: number }
        | { code: 'SLOT_NOT_AVAILABLE'; level: number; slotType: 'regular' | 'pact'; expectedCount: number; gotCount: number }
        | { code: 'NO_PACT_MAGIC' }
        | { code: 'PACT_LEVEL_MISMATCH'; expected: number; got: number }
      >;
    };

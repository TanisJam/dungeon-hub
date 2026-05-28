/**
 * Action pipeline phase enums and ActionInFlight for the Resolution Engine.
 *
 * Named phases (design ref: sdd/resolution-engine/design — RESOLVED OPEN ITEM 3):
 *   Attack:  DECLARED → TO_HIT → ON_HIT → DAMAGE → ON_DAMAGE_APPLIED → RESOLVED
 *   Spell:   DECLARED → CAST_ANNOUNCED → RESOLVING → RESOLVED
 *             └── reaction window at CAST_ANNOUNCED:
 *                   INTERRUPTED → counter-success → CANCELLED (terminal)
 *                              → counter-fail/declined → RESOLVING
 *
 * Terminal states: RESOLVED, CANCELLED. Advancing from a terminal state is an error.
 *
 * // REQ-PIPELINE-01: PHB action sequence; Counterspell reaction window (PHB 228).
 */

// ── Attack pipeline phases ────────────────────────────────────────────────────

export type AttackPhase =
  | 'DECLARED'
  | 'TO_HIT'
  | 'ON_HIT'
  | 'DAMAGE'
  | 'ON_DAMAGE_APPLIED'
  | 'RESOLVED';

// ── Spell pipeline phases ─────────────────────────────────────────────────────

/**
 * CAST_ANNOUNCED: slot is spent, effects not yet applied.
 * This is the ONLY interruption point — Counterspell hooks exactly here.
 * INTERRUPTED: a reaction fired; waiting for counter-resolution.
 * CANCELLED: terminal — no effects applied (counter succeeded or action cancelled).
 * RESOLVED: terminal — effects applied.
 */
export type SpellPhase =
  | 'DECLARED'
  | 'CAST_ANNOUNCED'
  | 'INTERRUPTED'
  | 'RESOLVING'
  | 'RESOLVED'
  | 'CANCELLED';

// ── ActionInFlight ────────────────────────────────────────────────────────────

/**
 * An action progressing through the pipeline state machine.
 *
 * Phase is now typed as the union of both phase enums (+ common terminal).
 * The state machine validates legal transitions per action type.
 *
 * Pure / JSON-serializable: no class instances or functions.
 */
export interface ActionInFlight {
  id: string;
  type: 'attack' | 'spell';
  phase: AttackPhase | SpellPhase;
  /** Present for spell actions; absent for attacks. */
  spellLevel?: number;
}

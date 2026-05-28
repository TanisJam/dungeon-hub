/**
 * CastEvent and pipeline event types for the Resolution Engine.
 *
 * CastEvent is emitted when a spell action enters CAST_ANNOUNCED phase.
 * Reactions (like Counterspell) listen for CastEvent via their EventTrigger predicate.
 *
 * // REQ-PIPELINE-01: Counterspell reaction window — PHB 228.
 */
import type { EntityId } from '../types.js';

// ── CastEvent ─────────────────────────────────────────────────────────────────

/**
 * Emitted when a spell reaches CAST_ANNOUNCED phase.
 * Carries enough information for reaction predicates (Counterspell range check, etc.)
 */
export interface CastEvent {
  kind: 'cast';
  actionId: string;
  spellLevel: number;
  caster: EntityId;
  /** Distance from caster to primary target in feet. Used for Counterspell 60ft range check. */
  targetDistance: number;
}

// ── EventKind re-export ───────────────────────────────────────────────────────

export type { EventKind } from '../types.js';

/**
 * Duration evaluator — pull-first read-time expiry for modifier instances.
 *
 * REQ-DUR-EVAL-01..04, REQ-DUR-CONV-01, REQ-DUR-REST-01, REQ-DUR-TOLERATE-01.
 * REQ-DUR-01..07 (turn-anchor branch — sdd/engine-unified-duration-evaluator).
 * PHB p.181 (time conversions), PHB p.189 (turn boundaries), PHB p.203 (spell durations),
 * PHB p.186 (rests).
 *
 * Design ref: sdd/engine-timeline-duration/design — ADR-2, ADR-3, ADR-7.
 * Design ref: sdd/engine-unified-duration-evaluator/design — ADR-1..7.
 *
 * NOW SHIPS: relative-turn-anchor 'end'-boundary path (Branch 4 below). The structured
 * DurationSpec.turnAnchor descriptor ('end' boundary only) is evaluated this slice.
 *
 * DEFERRED (still out of scope — do NOT add here without a new SDD):
 * - 'turn-ends' endsOn evaluated variant (ADR-5): declared but deferred; no PHB consumer
 *   demands the unstructured endsOn path — conservative fallback (active) is correct today.
 * - 'start' boundary evaluation (ADR-6): declared; conservative-active until a future
 *   slice with a real PHB consumer ('until the start of your next turn') defines semantics.
 * - 'encounter-ends' sweep.
 * - SQL-sweep rewiring + currentCombatantId route threading (Slice 4).
 * See sdd/engine-unified-duration-evaluator for the cut line.
 *
 * IMPORTANT: exactOptionalPropertyTypes is active in this package.
 * startRound, encounterRound, turnsRemaining, turnAnchor, currentCombatantId all use
 * `?:` — never assign undefined explicitly.
 */

import type { DurationSpec } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';
import type { EvaluationContext } from '../context.js';

// ── Time conversion ───────────────────────────────────────────────────────────

/**
 * Converts a DurationSpec into an equivalent number of rounds.
 *
 * PHB p.181 / p.189 — canonical time conversions:
 *   1 round  = 6 seconds
 *   1 minute = 10 rounds (60 seconds / 6 seconds per round)
 *   1 hour   = 600 rounds (3600 seconds / 6 seconds per round)
 *
 * REQ-DUR-CONV-01: sole source of truth; no other layer reimplements these.
 */
export function convertToRounds(d: DurationSpec): number {
  const factor = d.unit === 'round' ? 1 : d.unit === 'minute' ? 10 : 600;
  return d.amount * factor;
}

// ── Duration evaluator ────────────────────────────────────────────────────────

/**
 * Returns true if the modifier instance is still active, false if expired.
 *
 * Branch order (matches design ADR-2 spec exactly — sdd/engine-unified-duration-evaluator):
 *   1. No duration         → permanent → true
 *   2. endsOn contains 'concentration-ends' → true (DELETE-token path owns it)
 *   3. endsOn contains 'short-rest' or 'long-rest' → true (DELETE-on-event path)
 *   4. (NEW) d.turnAnchor present → turn-anchor branch (see ADR-3) — returns active/expired
 *   5. ctx.encounterRound absent → true (conservative fallback — REQ-DUR-EVAL-03)
 *   6. inst.startRound absent → true (non-encounter cast — REQ-DUR-TOLERATE-01)
 *   7. elapsed < convertToRounds(duration) → true; else false (REQ-DUR-EVAL-02)
 *
 * Branch 4 (turn-anchor) must come BEFORE branches 5-7 (absolute-round): a turn-anchored
 * duration must NOT fall into the absolute-round elapsed comparison — it expires on a
 * turn boundary, not a round count. Discriminated by presence of d.turnAnchor (ADR-2).
 *
 * PHB p.203 — spell durations; PHB p.181 — time conversions; PHB p.186 — rests.
 * PHB p.189 — turn-boundary durations ("until the end of your next turn").
 */
export function evaluateDuration(
  inst: ModifierInstance,
  ctx: EvaluationContext,
): boolean {
  const d = inst.duration;

  // Branch 1: no duration → permanent modifier (REQ-DUR-EVAL-01)
  if (!d) return true;

  const ends = d.endsOn ?? [];

  // Branch 2: concentration-ends → DELETE-token path owns removal (REQ-DUR-EVAL-04)
  // PHB p.203-204: concentration is broken when the caster takes damage / drops it.
  if (ends.includes('concentration-ends')) return true;

  // Branch 3: short-rest / long-rest → DELETE-on-event path owns removal (REQ-DUR-REST-01)
  // PHB p.186: rest is an event, not a round-count threshold.
  if (ends.includes('short-rest') || ends.includes('long-rest')) return true;

  // Branch 4: turn-anchor → expiry on anchor combatant's turn boundary (REQ-DUR-01..03)
  // PHB p.189: "lasts until the end of your next turn" — expires when the anchor
  // combatant's turn arrives and the remaining-turn counter is exhausted.
  //
  // IDENTITY-SPACE: currentCombatantId and anchorCombatantId are COMBATANT UUIDs
  // (encounter_combatants.id) — NEVER compare against ctx.self.id (character EntityId).
  //
  // Expired predicate (ADR-3): all three conditions must hold simultaneously:
  //   inst.turnsRemaining === 0  AND  boundary === 'end'  AND  currentCombatantId === anchorCombatantId
  //
  // Conservative fallbacks (REQ-DUR-02, ADR-3):
  //   - currentCombatantId absent → cannot place anchor → active
  //   - currentCombatantId !== anchorCombatantId → not the anchor's turn → active
  //   - boundary === 'start' → no PHB consumer this slice → conservative-active (ADR-6)
  //   - turnsRemaining === undefined → undefined !== 0 (strict) → active
  if (d.turnAnchor) {
    // (a) Read-path tolerance: not in a turn-tick context → cannot evaluate → active
    if (ctx.currentCombatantId === undefined) return true;
    // (b) Not the anchor combatant's turn right now → still active
    if (ctx.currentCombatantId !== d.turnAnchor.anchorCombatantId) return true;
    // (c) It IS the anchor's turn: 'end' boundary is evaluable; expired iff counter exhausted.
    //     'start' boundary falls through to return true below (conservative-active, ADR-6).
    if (d.turnAnchor.boundary === 'end' && inst.turnsRemaining === 0) return false;
    // (d) Otherwise (turnsRemaining > 0 / undefined, or boundary === 'start') → active
    return true;
  }

  // Branch 5: encounterRound absent → conservative fallback (REQ-DUR-EVAL-03)
  // Outside a tracked encounter, round-based expiry cannot be evaluated.
  if (ctx.encounterRound === undefined) return true;

  // Branch 6: startRound absent → conservative fallback (REQ-DUR-TOLERATE-01)
  // Legacy rows (NULL start_round) and non-encounter casts both land here.
  if (inst.startRound === undefined) return true;

  // Branch 7: elapsed-round comparison (REQ-DUR-EVAL-02)
  // PHB p.181: 1 minute = 10 rounds, 1 hour = 600 rounds.
  // PHB p.203: spell duration expires after its round budget is exhausted.
  // Boundary: elapsed < budget → active; elapsed >= budget → expired.
  return (ctx.encounterRound - inst.startRound) < convertToRounds(d);
}

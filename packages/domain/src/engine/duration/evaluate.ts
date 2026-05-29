/**
 * Duration evaluator — pull-first read-time expiry for modifier instances.
 *
 * REQ-DUR-EVAL-01..04, REQ-DUR-CONV-01, REQ-DUR-REST-01, REQ-DUR-TOLERATE-01.
 * PHB p.181 (time conversions), PHB p.203 (spell durations), PHB p.186 (rests).
 *
 * Design ref: sdd/engine-timeline-duration/design — ADR-2, ADR-3, ADR-7.
 *
 * IMPORTANT: exactOptionalPropertyTypes is active in this package.
 * startRound and encounterRound use `?:` — never assign undefined explicitly.
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
 * Branch order (matches design ADR-2 spec exactly):
 *   1. No duration         → permanent → true
 *   2. endsOn contains 'concentration-ends' → true (DELETE-token path owns it)
 *   3. endsOn contains 'short-rest' or 'long-rest' → true (DELETE-on-event path)
 *   4. ctx.encounterRound absent → true (conservative fallback — REQ-DUR-EVAL-03)
 *   5. inst.startRound absent → true (non-encounter cast — REQ-DUR-TOLERATE-01)
 *   6. elapsed < convertToRounds(duration) → true; else false (REQ-DUR-EVAL-02)
 *
 * PHB p.203 — spell durations; PHB p.181 — time conversions; PHB p.186 — rests.
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

  // Branch 4: encounterRound absent → conservative fallback (REQ-DUR-EVAL-03)
  // Outside a tracked encounter, round-based expiry cannot be evaluated.
  if (ctx.encounterRound === undefined) return true;

  // Branch 5: startRound absent → conservative fallback (REQ-DUR-TOLERATE-01)
  // Legacy rows (NULL start_round) and non-encounter casts both land here.
  if (inst.startRound === undefined) return true;

  // Branch 6: elapsed-round comparison (REQ-DUR-EVAL-02)
  // PHB p.181: 1 minute = 10 rounds, 1 hour = 600 rounds.
  // PHB p.203: spell duration expires after its round budget is exhausted.
  // Boundary: elapsed < budget → active; elapsed >= budget → expired.
  return (ctx.encounterRound - inst.startRound) < convertToRounds(d);
}

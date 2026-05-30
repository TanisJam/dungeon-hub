/**
 * rollSavingThrow — pure d20 saving throw for the engine forced-check pillar.
 *
 * PHB p.179 — "Saving Throws":
 *   "To make a saving throw, roll a d20 and add the appropriate ability modifier."
 *   "If the total of the roll plus modifiers equals or exceeds the Difficulty Class (DC),
 *    the saving throw is a success. Otherwise, it's a failure."
 *
 * PHB p.179 — NO nat-20/nat-1 special cases on saves:
 *   Unlike attack rolls (PHB p.194), saving throws do NOT have auto-success on nat-20
 *   or auto-fail on nat-1. success = (d20 + saveMod) >= dc, period.
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * Design ref: sdd/engine-forced-check-3a/design — ADR-1 (rollSavingThrow signature, placement).
 *
 * PURE: no IO, no DB, no fetch. RNG injected. Mirrors roll-to-hit.ts structure.
 */

import type { RngFn } from '../dice/roll.js';
import type { RollMode } from '../attack/roll-to-hit.js';

// ── RollMode re-export for clarity (imported from attack/roll-to-hit.js, not duplicated) ──
// ADR-1: reuse existing RollMode type — do NOT move it in 3a (avoid churn).
export type { RollMode } from '../attack/roll-to-hit.js';

// ── Return shape ──────────────────────────────────────────────────────────────

/**
 * Return shape for rollSavingThrow (ADR-1 — 7 fields locked).
 *
 * `d20` — the KEPT die result (post adv/disadv selection).
 * `d20All` — all dice rolled in order: [d] normal, [d1,d2] adv/disadv.
 * `saveMod` — echoed from input.
 * `dc` — echoed from input.
 * `total` — d20 (kept) + saveMod.
 * `success` — total >= dc. PHB p.179: NO nat-20/nat-1 special cases.
 * `rollMode` — echoed from input.
 */
export interface RollSavingThrowResult {
  d20: number;
  d20All: number[];
  saveMod: number;
  dc: number;
  total: number;
  success: boolean;
  rollMode: RollMode;
}

// ── rollSavingThrow ───────────────────────────────────────────────────────────

/**
 * Rolls the d20 saving throw and evaluates the outcome.
 *
 * Pure — no IO, no DB. Injected RNG keeps domain testable.
 *
 * @param saveMod   - The saving throw modifier (ability mod + proficiency if proficient).
 * @param dc        - The Difficulty Class to meet or exceed.
 * @param rollMode  - 'normal', 'advantage', or 'disadvantage'.
 * @param rng       - Injected RNG: returns integer in [1..sides].
 */
export function rollSavingThrow(
  saveMod: number,
  dc: number,
  rollMode: RollMode,
  rng: RngFn,
): RollSavingThrowResult {
  let d20All: number[];
  let kept: number;

  if (rollMode === 'advantage') {
    // PHB p.173 — roll 2d20, keep highest.
    const d1 = rng(20);
    const d2 = rng(20);
    d20All = [d1, d2]; // ORDER preserved as rolled
    kept = Math.max(d1, d2);
  } else if (rollMode === 'disadvantage') {
    // PHB p.173 — roll 2d20, keep lowest.
    const d1 = rng(20);
    const d2 = rng(20);
    d20All = [d1, d2]; // ORDER preserved as rolled
    kept = Math.min(d1, d2);
  } else {
    // 'normal' — single d20.
    const r = rng(20);
    d20All = [r];
    kept = r;
  }

  const total = kept + saveMod;

  // PHB p.179: success = total >= dc. NO nat-20 auto-success. NO nat-1 auto-fail.
  // This is intentionally different from rollToHit (PHB p.194 crit/auto-miss).
  const success = total >= dc;

  return {
    d20: kept,
    d20All,
    saveMod,
    dc,
    total,
    success,
    rollMode,
  };
}

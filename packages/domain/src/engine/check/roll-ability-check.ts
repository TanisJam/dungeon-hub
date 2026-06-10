/**
 * rollAbilityCheck — pure d20 ability check for the engine check pillar.
 *
 * PHB p.174 — "Ability Checks":
 *   "To make an ability check, roll a d20 and add the relevant ability modifier."
 *   "If the total equals or exceeds the Difficulty Class (DC), the ability check
 *    is a success. Otherwise, it's a failure."
 *
 * PHB p.174 — NO nat-20/nat-1 special cases on checks:
 *   Unlike attack rolls (PHB p.194), ability checks do NOT have auto-success on nat-20
 *   or auto-fail on nat-1. success = (d20 + checkMod) >= dc, period.
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * Design ref: sdd/engine-ability-check-surface/design — D8 (rollAbilityCheck contract).
 *
 * PURE: no IO, no DB, no fetch. RNG injected. Mirrors roll-saving-throw.ts structure exactly.
 */

import type { RngFn } from '../dice/roll.js';
import type { RollMode } from '../attack/roll-to-hit.js';

// ── RollMode re-export for clarity (imported from attack/roll-to-hit.js, not duplicated) ──
// Mirrors roll-saving-throw.ts: reuse existing RollMode type — do NOT move or duplicate.
export type { RollMode } from '../attack/roll-to-hit.js';

// ── Return shape ──────────────────────────────────────────────────────────────

/**
 * Return shape for rollAbilityCheck (D8 — 7 fields locked).
 *
 * `d20` — the KEPT die result (post adv/disadv selection).
 * `d20All` — all dice rolled in order: [d] normal, [d1,d2] adv/disadv.
 * `checkMod` — echoed from input.
 * `dc` — echoed from input.
 * `total` — d20 (kept) + checkMod.
 * `success` — total >= dc. PHB p.174: NO nat-20/nat-1 special cases.
 * `rollMode` — echoed from input.
 *
 * NO `crit` field — checks don't crit (PHB p.174, distinctly unlike PHB p.194 attacks).
 */
export interface RollAbilityCheckResult {
  d20: number;
  d20All: number[];
  checkMod: number;
  dc: number;
  total: number;
  success: boolean;
  rollMode: RollMode;
}

// ── rollAbilityCheck ──────────────────────────────────────────────────────────

/**
 * Rolls the d20 ability check and evaluates the outcome.
 *
 * Pure — no IO, no DB. Injected RNG keeps domain testable.
 *
 * @param checkMod  - The ability check modifier (ability mod; proficiency only if skill check).
 * @param dc        - The Difficulty Class to meet or exceed.
 * @param rollMode  - 'normal', 'advantage', or 'disadvantage'.
 * @param rng       - Injected RNG: returns integer in [1..sides].
 */
export function rollAbilityCheck(
  checkMod: number,
  dc: number,
  rollMode: RollMode,
  rng: RngFn,
): RollAbilityCheckResult {
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

  const total = kept + checkMod;

  // PHB p.174: success = total >= dc. NO nat-20 auto-success. NO nat-1 auto-fail.
  // This is intentionally different from rollToHit (PHB p.194 crit/auto-miss).
  const success = total >= dc;

  return {
    d20: kept,
    d20All,
    checkMod,
    dc,
    total,
    success,
    rollMode,
  };
}

/**
 * rollInitiative — pure DC-less d20 initiative roll for the engine.
 *
 * PHB p.189 — Initiative:
 *   "At the beginning of every combat, roll initiative by making a Dexterity check."
 *   Initiative produces an ORDERING number (the total) used to sort combatants.
 *   There is NO Difficulty Class and NO success/fail outcome.
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * PHB p.174 — NO nat-20/nat-1 special cases on checks:
 *   Initiative is a Dexterity check. Ability checks have no auto-success on nat-20
 *   or auto-fail on nat-1. The total is used as-is for ordering.
 *
 * Design ref: sdd/engine-feral-instinct/design — D1 (rollInitiative contract).
 *
 * PURE: no IO, no DB, no fetch. RNG injected. Mirrors roll-ability-check.ts structure,
 * dropping dc and success (initiative is a DC-less ordering number — REQ-PRIM-01..04).
 */

import type { RngFn } from '../dice/roll.js';
import type { RollMode } from '../attack/roll-to-hit.js';

// ── RollMode re-export for clarity (imported from attack/roll-to-hit.js, not duplicated) ──
// Mirrors roll-ability-check.ts: reuse existing RollMode type — do NOT move or duplicate.
export type { RollMode } from '../attack/roll-to-hit.js';

// ── Return shape ──────────────────────────────────────────────────────────────

/**
 * Return shape for rollInitiative (D1 — 5 fields, locked).
 *
 * `d20` — the KEPT die result (post adv/disadv selection).
 * `d20All` — all dice rolled in order: [d] normal, [d1,d2] adv/disadv.
 * `checkMod` — echoed from input (DEX modifier ± NumMods).
 * `total` — d20 (kept) + checkMod. Used as combatant sort order.
 * `rollMode` — echoed from input.
 *
 * NO `success` field — initiative has no DC (PHB p.189).
 * NO `dc` field — initiative has no Difficulty Class.
 * NO `crit` field — checks don't crit (PHB p.174, distinctly unlike PHB p.194 attacks).
 */
export interface RollInitiativeResult {
  d20: number;
  d20All: number[];
  checkMod: number;
  total: number;
  rollMode: RollMode;
}

// ── rollInitiative ────────────────────────────────────────────────────────────

/**
 * Rolls the d20 initiative and returns the ordering total.
 *
 * Pure — no IO, no DB. Injected RNG keeps domain testable.
 *
 * @param checkMod  - The initiative modifier (DEX modifier ± NumMods from registry).
 * @param rollMode  - 'normal', 'advantage', or 'disadvantage'.
 * @param rng       - Injected RNG: returns integer in [1..sides].
 */
export function rollInitiative(
  checkMod: number,
  rollMode: RollMode,
  rng: RngFn,
): RollInitiativeResult {
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

  // No success/dc/crit — initiative is a DC-less ordering number (REQ-PRIM-01..04).

  return {
    d20: kept,
    d20All,
    checkMod,
    total,
    rollMode,
  };
}

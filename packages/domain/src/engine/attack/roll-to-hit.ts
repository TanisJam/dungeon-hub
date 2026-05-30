/**
 * rollToHit — pure d20 attack roll for the engine mutation slice (engine-to-hit-ac).
 *
 * PHB p.194 — "Attack Rolls":
 *   "To make an attack roll, roll a d20 and add the appropriate modifiers. If the total
 *    of the roll plus modifiers equals or exceeds the target's Armor Class (AC), the attack hits."
 *
 * PHB p.194 — "Rolling 1 or 20":
 *   "If the d20 roll for an attack is a 20, the attack hits regardless of any modifiers or
 *    the target's AC. This is called a critical hit."
 *   "If the d20 roll for an attack is a 1, the attack misses regardless of any modifiers or
 *    the target's AC. This is called an automatic miss."
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * Design ref: sdd/engine-to-hit-ac/design — ADR-1 (signature locked), ADR-3 (single RNG).
 *
 * PURE: no IO, no DB, no fetch. RNG injected. Mirrors rollDamageBreakdown (engine-attack-apply-damage).
 */

import type { RngFn } from '../dice/roll.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Roll mode for the d20 attack roll (PHB p.173 — Advantage and Disadvantage).
 *
 * - 'normal': single d20, no modifier.
 * - 'advantage': roll 2d20, keep highest.
 * - 'disadvantage': roll 2d20, keep lowest.
 */
export type RollMode = 'advantage' | 'disadvantage' | 'normal';

/**
 * Return shape for rollToHit (ADR-1 — all 8 fields, locked).
 *
 * `d20` — the KEPT die result (before modifiers). Used for nat-20/nat-1 detection.
 * `d20All` — all dice rolled in order: [d20] for normal, [d1, d2] for adv/disadv.
 * `total` — d20 (kept) + toHitBonus. Compared against AC; also echoed for UI.
 * `toHitBonus` — echoed from input (resolveWeaponAttack().toHit.value).
 * `targetAc` — echoed from input (resolved by resolveTargetAc).
 * `hit` — true when: nat-20, or (not nat-1 AND total >= targetAc).
 * `crit` — true when: kept === 20.
 * `autoMiss` — true when: kept === 1.
 */
export interface RollToHitResult {
  d20: number;
  d20All: number[];
  total: number;
  toHitBonus: number;
  targetAc: number;
  hit: boolean;
  crit: boolean;
  autoMiss: boolean;
}

// ── rollToHit ─────────────────────────────────────────────────────────────────

/**
 * Rolls the d20 attack roll and evaluates the outcome.
 *
 * Pure — no IO, no DB. Injected RNG keeps domain testable.
 *
 * ADR-3: the SAME RngFn instance is passed here and then (on hit only) to
 * rollDamageBreakdown. To-hit dice are consumed BEFORE damage dice — test
 * mocks must enqueue to-hit d20(s) before damage dice.
 *
 * @param toHitBonus - Resolved to-hit bonus (from resolveWeaponAttack().toHit.value).
 * @param targetAc - Target's Armor Class (from resolveTargetAc).
 * @param rollMode - 'normal', 'advantage', or 'disadvantage'.
 * @param rng - Injected RNG: returns integer in [1..sides].
 */
export function rollToHit(
  toHitBonus: number,
  targetAc: number,
  rollMode: RollMode,
  rng: RngFn,
): RollToHitResult {
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

  const total = kept + toHitBonus;

  // ── PHB p.194 crit / auto-miss / hit on the KEPT die ───────────────────────
  // Crit detection: nat-20 on the kept die only.
  const crit = kept === 20;
  // Auto-miss: nat-1 on the kept die only.
  const autoMiss = kept === 1;
  // Hit: nat-20 always hits; nat-1 always misses; else >= AC (= boundary is a hit).
  const hit = crit || (!autoMiss && total >= targetAc);

  return {
    d20: kept,
    d20All,
    total,
    toHitBonus,
    targetAc,
    hit,
    crit,
    autoMiss,
  };
}

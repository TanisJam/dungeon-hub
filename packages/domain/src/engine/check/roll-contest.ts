/**
 * rollContest — pure DC-less two-actor contested check for the engine.
 *
 * PHB p.174 — Contests:
 *   "Sometimes one character's or monster's efforts are directly opposed to another's.
 *    ... Both participants make ability checks appropriate to their efforts. They apply
 *    all appropriate bonuses and penalties, but instead of comparing the total to a DC,
 *    they compare the totals of their two checks. The participant with the higher check
 *    total wins the contest."
 *   "If the contest results in a tie, the situation remains the same as it was before
 *    the contest."
 *
 * PHB p.173 — "Advantage and Disadvantage":
 *   "When you have advantage, you roll a second d20 and use the higher of the two rolls."
 *   "When you have disadvantage, you roll a second d20 and use the lower of the two rolls."
 *
 * PHB p.174 — NO nat-20/nat-1 special cases on checks:
 *   Ability checks have no auto-success on nat-20 or auto-fail on nat-1.
 *   The total is compared as-is; no hit/crit/dc semantics apply.
 *
 * Design ref: sdd/engine-contested-checks/design — D-PRIM (rollContest signature + result type).
 *
 * PURE: no IO, no DB, no fetch. RNG injected. Mirrors roll-initiative.ts structure exactly
 * (B7 DC-less precedent). Attacker side rolled FIRST, then defender side (deterministic order).
 *
 * REQ-CONTEST-01..07.
 */

import type { RngFn } from '../dice/roll.js';
import type { RollMode } from '../attack/roll-to-hit.js';

// ── RollMode re-export (imported from attack/roll-to-hit.js, not duplicated) ──
// Mirrors roll-initiative.ts:28 pattern. Do NOT duplicate the RollMode type.
export type { RollMode } from '../attack/roll-to-hit.js';

// ── Result shapes ─────────────────────────────────────────────────────────────

/**
 * Result for one side of a contest (attacker or defender).
 *
 * D-PRIM contract (BINDING — 5 fields, locked):
 *   `d20`      — the KEPT die result (post adv/disadv selection).
 *   `d20All`   — all dice rolled in order: [d] normal, [d1,d2] adv/disadv. ORDER preserved.
 *   `checkMod` — echoed from input.
 *   `total`    — d20 (kept) + checkMod. Used for comparison.
 *   `rollMode` — echoed from input.
 *
 * NO `dc` field — contests have no Difficulty Class (PHB p.174).
 * NO `success` field — contests compare totals, not against a DC.
 * NO `crit` field — checks don't crit (PHB p.174, unlike PHB p.194 attacks).
 */
export interface ContestSideResult {
  d20: number;
  d20All: number[];
  checkMod: number;
  total: number;
  rollMode: RollMode;
}

/**
 * Return shape for rollContest.
 *
 * D-PRIM (BINDING):
 *   `attacker` — attacker side result.
 *   `defender` — defender side result.
 *   `winner`   — 'attacker' | 'defender' | 'tie' (PHB p.174 tie = status quo).
 *
 * No `dc`, no `success`, no `crit` — these are pure comparative results.
 */
export interface RollContestResult {
  attacker: ContestSideResult;
  defender: ContestSideResult;
  winner: 'attacker' | 'defender' | 'tie';
}

// ── rollContest ───────────────────────────────────────────────────────────────

/**
 * Rolls both sides of a two-actor contest and determines the winner.
 *
 * Attacker side rolled FIRST (its 1 or 2 d20s), then defender side.
 * This ordering is deterministic and testable with a scripted RNG queue.
 *
 * Pure — no IO, no DB. Injected RNG keeps domain testable.
 * One injected rng instance — the engine's single-rng-per-resolution invariant (ADR-3).
 *
 * @param attackerMod       - Attacker's ability check modifier.
 * @param defenderMod       - Defender's ability check modifier.
 * @param attackerRollMode  - Attacker's roll mode: 'normal', 'advantage', or 'disadvantage'.
 * @param defenderRollMode  - Defender's roll mode: 'normal', 'advantage', or 'disadvantage'.
 * @param rng               - Injected RNG: returns integer in [1..sides].
 */
export function rollContest(
  attackerMod: number,
  defenderMod: number,
  attackerRollMode: RollMode,
  defenderRollMode: RollMode,
  rng: RngFn,
): RollContestResult {
  // ── Attacker side ─────────────────────────────────────────────────────────────
  // Reuses the exact Math.max/Math.min kept-die logic from roll-initiative.ts:72-89.

  let attackerD20All: number[];
  let attackerKept: number;

  if (attackerRollMode === 'advantage') {
    // PHB p.173 — roll 2d20, keep highest.
    const d1 = rng(20);
    const d2 = rng(20);
    attackerD20All = [d1, d2]; // ORDER preserved as rolled
    attackerKept = Math.max(d1, d2);
  } else if (attackerRollMode === 'disadvantage') {
    // PHB p.173 — roll 2d20, keep lowest.
    const d1 = rng(20);
    const d2 = rng(20);
    attackerD20All = [d1, d2]; // ORDER preserved as rolled
    attackerKept = Math.min(d1, d2);
  } else {
    // 'normal' — single d20.
    const r = rng(20);
    attackerD20All = [r];
    attackerKept = r;
  }

  const attackerTotal = attackerKept + attackerMod;

  // ── Defender side ─────────────────────────────────────────────────────────────
  // Independent roll — same adv/disadv logic, separate dice consumed from rng.

  let defenderD20All: number[];
  let defenderKept: number;

  if (defenderRollMode === 'advantage') {
    // PHB p.173 — roll 2d20, keep highest.
    const d1 = rng(20);
    const d2 = rng(20);
    defenderD20All = [d1, d2]; // ORDER preserved as rolled
    defenderKept = Math.max(d1, d2);
  } else if (defenderRollMode === 'disadvantage') {
    // PHB p.173 — roll 2d20, keep lowest.
    const d1 = rng(20);
    const d2 = rng(20);
    defenderD20All = [d1, d2]; // ORDER preserved as rolled
    defenderKept = Math.min(d1, d2);
  } else {
    // 'normal' — single d20.
    const r = rng(20);
    defenderD20All = [r];
    defenderKept = r;
  }

  const defenderTotal = defenderKept + defenderMod;

  // ── Winner determination ──────────────────────────────────────────────────────
  // PHB p.174: attacker.total > defender.total → 'attacker' wins;
  //            defender.total > attacker.total → 'defender' wins;
  //            equal → 'tie' (situation unchanged — no condition applied for grapple/shove).

  let winner: 'attacker' | 'defender' | 'tie';
  if (attackerTotal > defenderTotal) {
    winner = 'attacker';
  } else if (defenderTotal > attackerTotal) {
    winner = 'defender';
  } else {
    winner = 'tie';
  }

  // No dc, success, or crit fields — contests compare totals only (REQ-CONTEST-02).

  return {
    attacker: {
      d20: attackerKept,
      d20All: attackerD20All,
      checkMod: attackerMod,
      total: attackerTotal,
      rollMode: attackerRollMode,
    },
    defender: {
      d20: defenderKept,
      d20All: defenderD20All,
      checkMod: defenderMod,
      total: defenderTotal,
      rollMode: defenderRollMode,
    },
    winner,
  };
}

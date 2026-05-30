/**
 * rollDamageBreakdown — pure dice roller for the engine mutation slice.
 *
 * PHB p.196 — "Damage Rolls":
 *   "Each weapon, spell, and harmful monster ability specifies the damage it deals.
 *    You roll the damage die or dice, add any modifiers, and apply the damage to your target."
 *
 * PHB p.196 — "Critical Hits":
 *   "Roll all of the attack's damage dice twice and add them together."
 *   Modifiers are NOT doubled — only dice.
 *
 * Design ref: sdd/engine-attack-apply-damage/design — ADR-1 (roller input shape),
 *   ADR-2 (NdM grammar), ADR-3 (crit semantics), ADR-4 (RNG injection).
 *
 * CRITICAL: pass (dice, breakdown) only — NOT flatMods (flatMods is a SUBSET of
 *   breakdown; passing it separately double-counts the ability modifier).
 */

import type { DiceExpr } from '../types.js';
import type { Source } from '../provenance.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Injected RNG function — returns an integer in [1..sides].
 *
 * Tests inject deterministic functions:
 *   floor: `() => 1`
 *   ceiling: `(s) => s`
 *
 * Production: crypto RNG in the use-case layer (not in domain).
 * ADR-4: RNG injection keeps domain pure and testable.
 */
export type RngFn = (sides: number) => number;

/**
 * A single per-source entry in the audit trail.
 *
 * Dice sources carry `rolls` (an array of individual die results).
 * Flat sources carry `flat` and omit `rolls` entirely.
 * These are mutually exclusive by design to avoid confusing the mobile UI.
 */
export type PerDieEntry =
  | { label: string; rolls: number[]; flat?: never }   // dice source
  | { label: string; rolls?: never; flat: number };     // flat source

/**
 * Return shape for rollDamageBreakdown.
 *
 * `total` — integer sum of all rolled and flat contributions.
 * `perDie` — per-source audit trail for the mobile provenance UI.
 */
export interface RollResult {
  total: number;
  perDie: PerDieEntry[];
}

// ── Regex ─────────────────────────────────────────────────────────────────────

/** NdM grammar: matches '1d8', '2d6', '1d4' etc. Anything else fails fast (ADR-2). */
const NdM_REGEX = /^(\d+)d(\d+)$/;

// ── rollDamageBreakdown ───────────────────────────────────────────────────────

/**
 * Rolls weapon base dice and all breakdown sources, returning an integer total
 * with a per-source audit trail.
 *
 * Input shape (ADR-1 — CRITICAL):
 *   - `dice`: weapon base DiceExpr (e.g. '1d8'). Rolled ONCE (or 2× on crit).
 *   - `breakdown`: Source[] from resolveWeaponAttack damage.breakdown.
 *       Includes: ability modifier (flat number) + on-hit riders (DiceExpr strings).
 *       Do NOT also pass flatMods — flatMods is a SUBSET already inside breakdown.
 *   - `crit`: if true, doubles die COUNT for every DiceExpr source (PHB p.196).
 *       Flat integer Sources are NEVER doubled.
 *   - `rng`: injected random function returning 1..sides.
 *
 * Fail-fast (ADR-2): any string amount that does not match /^\d+d\d+$/ throws.
 *
 * @throws Error with '[rollDamageBreakdown] unrecognized DiceExpr: ...' on bad format.
 */
export function rollDamageBreakdown(
  dice: DiceExpr,
  breakdown: Source[],
  crit: boolean,
  rng: RngFn,
): RollResult {
  const perDie: PerDieEntry[] = [];
  let total = 0;

  // ── Roll weapon base dice ─────────────────────────────────────────────────────
  // dice argument is the weapon's base DiceExpr (e.g. '1d8'). Always a string.
  // ADR-2: fail-fast on non-NdM format.
  const diceMatch = NdM_REGEX.exec(dice);
  if (!diceMatch) {
    throw new Error(`[rollDamageBreakdown] unrecognized DiceExpr: '${dice}'`);
  }
  const weaponN = parseInt(diceMatch[1]!, 10);
  const weaponSides = parseInt(diceMatch[2]!, 10);
  // ADR-3: crit doubles die COUNT — not flat mods (PHB p.196).
  const weaponRollCount = crit ? weaponN * 2 : weaponN;
  const weaponRolls: number[] = [];
  for (let i = 0; i < weaponRollCount; i++) {
    const roll = rng(weaponSides);
    weaponRolls.push(roll);
    total += roll;
  }
  perDie.push({ label: 'weapon', rolls: weaponRolls });

  // ── Iterate breakdown Sources ─────────────────────────────────────────────────
  // Each Source.amount is either a flat integer or a DiceExpr string.
  // ADR-1: do NOT also pass flatMods — they are already inside breakdown.
  for (const source of breakdown) {
    if (typeof source.amount === 'number') {
      // Flat integer source — add directly; RNG never called; not doubled on crit.
      // PHB p.196: modifiers apply once.
      // Flat entries omit `rolls` entirely (dice sources only carry rolls).
      total += source.amount;
      perDie.push({ label: source.label, flat: source.amount });
    } else {
      // DiceExpr string source — validate NdM then roll.
      const match = NdM_REGEX.exec(source.amount);
      if (!match) {
        throw new Error(
          `[rollDamageBreakdown] unrecognized DiceExpr: '${source.amount}' (source: '${source.label}')`,
        );
      }
      const n = parseInt(match[1]!, 10);
      const sides = parseInt(match[2]!, 10);
      // ADR-3: crit doubles die count for DiceExpr sources; flat untouched.
      const rollCount = crit ? n * 2 : n;
      const rolls: number[] = [];
      for (let i = 0; i < rollCount; i++) {
        const roll = rng(sides);
        rolls.push(roll);
        total += roll;
      }
      perDie.push({ label: source.label, rolls });
    }
  }

  return { total, perDie };
}

/**
 * resolveCounterspell — pure Counterspell outcome resolver.
 *
 * PHB p.281 — Counterspell:
 *   "When you cast this spell, you attempt to interrupt a creature in the process
 *    of casting a spell. If the creature is casting a spell of 3rd level or lower,
 *    its spell fails and has no effect. If it is casting a spell of 4th level or
 *    higher, make an ability check using your spellcasting ability. The DC equals
 *    10 + the spell's level. On a success, the creature's spell fails and has no
 *    effect."
 *
 *   At Higher Levels: "When you cast this spell using a spell slot of 4th level or
 *    higher, the interrupted spell has no effect if its level is less than or equal
 *    to the level of the spell slot you used."
 *
 * Design ref: sdd/engine-counterspell/design — ADR-1, ADR-2.
 * RNG injection: same RngFn pattern as rollMagicMissile (ADR-4 engine-spell-cast-suspend).
 *
 * CRITICAL: domain pure — no IO, no DB, no fetch.
 */

import type { RngFn } from '../dice/roll.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Input for resolveCounterspell.
 *
 * counteredSpellLevel: the level of the spell being countered (1–9).
 * counterspellSlotLevel: the slot level used to cast Counterspell (≥3).
 *   Maps to `autoIfSlotGe` from ReactionEffect {kind:'counter'} in types.ts:151.
 *   When counteredSpellLevel <= counterspellSlotLevel → auto-success (no check).
 * counterspellerAbilityMod: the spellcasting ability modifier of the counterspeller.
 *   Used only when DC-check branch triggers.
 * rng: injected random function (returns integer in [1..sides]).
 *   - Tests inject a planted value (seeded).
 *   - Production: server-side crypto RNG (cryptoRng) in the use-case layer.
 *   - NEVER called on auto-success path.
 */
export interface ResolveCounterspellInput {
  counteredSpellLevel: number;
  counterspellSlotLevel: number;
  counterspellerAbilityMod: number;
  rng: RngFn;
}

/**
 * Outcome of a DC check when auto-counter threshold is not met.
 *
 * dc: the difficulty class (10 + counteredSpellLevel, PHB p.281).
 * d20: the raw d20 result from the injected rng.
 * total: d20 + counterspellerAbilityMod.
 */
export interface CounterspellCheck {
  dc: number;
  d20: number;
  total: number;
}

/**
 * Result of resolveCounterspell.
 *
 * countered: whether the spell was successfully negated.
 * autoSuccess: true when counteredSpellLevel <= counterspellSlotLevel (no roll required).
 * check: present ONLY when a DC-check was performed (autoSuccess === false).
 *   Absent (key omitted entirely) on auto-success — required by exactOptionalPropertyTypes.
 */
export type ResolveCounterspellResult =
  | { countered: true; autoSuccess: true }
  | { countered: boolean; autoSuccess: false; check: CounterspellCheck };

// ── resolveCounterspell ───────────────────────────────────────────────────────

/**
 * Resolves the outcome of casting Counterspell against a spell.
 *
 * Auto-success (PHB p.281): counteredSpellLevel <= counterspellSlotLevel.
 *   Returns { countered: true, autoSuccess: true } — no d20 roll, no check field.
 *
 * DC-check (PHB p.281): counteredSpellLevel > counterspellSlotLevel.
 *   Rolls d20 via rng(20), adds counterspellerAbilityMod.
 *   DC = 10 + counteredSpellLevel. countered = total >= dc.
 *   Returns { countered, autoSuccess: false, check: { dc, d20, total } }.
 *
 * @param input - { counteredSpellLevel, counterspellSlotLevel, counterspellerAbilityMod, rng }
 * @returns ResolveCounterspellResult
 */
export function resolveCounterspell(input: ResolveCounterspellInput): ResolveCounterspellResult {
  const { counteredSpellLevel, counterspellSlotLevel, counterspellerAbilityMod, rng } = input;

  // PHB p.281 — Auto-counter: "If the creature is casting a spell of 3rd level or
  // lower, its spell fails." + At Higher Levels: "has no effect if its level is less
  // than or equal to the level of the spell slot you used."
  if (counteredSpellLevel <= counterspellSlotLevel) {
    return { countered: true, autoSuccess: true };
  }

  // PHB p.281 — DC-check branch: "make an ability check using your spellcasting
  // ability. The DC equals 10 + the spell's level."
  const dc = 10 + counteredSpellLevel;
  const d20 = rng(20);
  const total = d20 + counterspellerAbilityMod;
  const countered = total >= dc;

  return {
    countered,
    autoSuccess: false,
    check: { dc, d20, total },
  };
}

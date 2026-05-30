/**
 * isShieldableHit — pure domain predicate for the Shield spell reaction window.
 *
 * PHB p.275 — Shield:
 *   "A reaction, which you take when you are hit by an attack or targeted by the
 *   magic missile spell. Until the start of your next turn, you have a +5 bonus to
 *   AC, including against the triggering attack."
 *
 * PHB p.194 — Critical Hits:
 *   "If the d20 roll for an attack is a 20, the attack hits regardless of any modifiers
 *   or the target's AC." — A crit cannot be blocked by +5 AC.
 *
 * Predicate logic (ADR-1, engine-reaction-bus design):
 *   hit && !crit && (total - targetAc) < 5
 *
 * The gap<5 filter is a UX OPTIMIZATION, not a PHB gate. PHB p.275 permits the
 * player to react on any hit; we only OFFER the window when Shield can change the
 * outcome (gap<5 means total < targetAc+5 → cast-shield would make it a miss or
 * leave total right at boundary). Gap≥5 means Shield cannot turn the hit into a miss,
 * so offering the window would be useless UI noise.
 *
 * NOTE: PC-entity check (kind==='pc'), reaction_used===false, and has-slot-available
 * are API-layer STATE concerns, not pure-domain predicate concerns. This function
 * tests ONLY the roll math. The API layer composes the full predicate.
 *
 * PURE: no IO, no DB, no fetch.
 * REQ-ERB-TYPES-01 (pure predicate tests: tasks 2.3–2.4).
 */

// ── Input shape ───────────────────────────────────────────────────────────────

/**
 * Minimal roll-math inputs needed to evaluate the shieldable-hit predicate.
 * Derived from RollToHitResult (engine/attack/roll-to-hit.ts).
 */
export interface ShieldableHitParams {
  /** true when the attack resolved as a hit (nat-20, or total >= targetAc without nat-1). */
  hit: boolean;
  /** true when the d20 kept die was 20 (critical hit — PHB p.194). */
  crit: boolean;
  /** d20 (kept) + toHitBonus. The raw number compared to targetAc. */
  total: number;
  /** Defender's resolved Armor Class at time of roll. */
  targetAc: number;
}

// ── isShieldableHit ───────────────────────────────────────────────────────────

/**
 * Returns true when the Shield spell reaction window should be opened.
 *
 * True IFF:
 *   1. attack.hit === true (it is a hit — PHB p.275 "when you are hit")
 *   2. attack.crit === false (nat-20 cannot be blocked by +5 AC — PHB p.194)
 *   3. (total - targetAc) < 5 (UX optimization — +5 AC would change the outcome)
 *
 * API-layer guards (NOT checked here): pc entity, reaction_used===false, slot≥1.
 */
export function isShieldableHit(params: ShieldableHitParams): boolean {
  return params.hit && !params.crit && (params.total - params.targetAc) < 5;
}

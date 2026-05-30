/**
 * applyDamage — clamps target HP at 0 after damage (PHB p.197).
 *
 * PHB p.197 — "Damage and Healing":
 *   "Hit points can't go below 0."
 *
 * Pure function: no IO, no DB, no side effects.
 * Design ref: sdd/engine-attack-apply-damage/design — ADR-6.
 */

/**
 * Applies rolled damage to a target's current HP, clamping at 0.
 *
 * @param hpCurrent - Target's current HP before damage.
 * @param total - Integer damage total (from rollDamageBreakdown).
 * @returns New HP, guaranteed >= 0.
 */
export function applyDamage(hpCurrent: number, total: number): number {
  return Math.max(0, hpCurrent - total);
}

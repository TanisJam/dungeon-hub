/**
 * applyHealing — clamps target HP at hpMax after healing (PHB p.197).
 *
 * PHB p.197 — "Regaining Hit Points":
 *   "You can't regain hit points above your hit point maximum."
 *
 * Pure function: no IO, no DB, no side effects.
 * Design ref: sdd/engine-healing/design — ADR-1.
 */

/**
 * Applies a healing amount to a target's current HP, clamping at hpMax.
 *
 * @param hpCurrent - Target's current HP before healing.
 * @param amount - Integer healing total (from rollDamageBreakdown).
 * @param hpMax - Target's maximum HP.
 * @returns New HP, guaranteed <= hpMax.
 */
export function applyHealing(hpCurrent: number, amount: number, hpMax: number): number {
  return Math.min(hpMax, hpCurrent + amount);
}

/**
 * computeConcentrationSaveDc — pure PHB p.203 concentration DC formula.
 *
 * PHB p.203 — Concentration:
 *   "The DC equals 10 or half the damage you take, whichever number is higher."
 *
 * Design ref: sdd/engine-concentration-break-damage — ADR-5 (D7), domain-pure DC fn.
 * Covers REQ-CB-02.
 *
 * CRITICAL: domain pure — no IO, no DB, no fetch.
 */

/**
 * Computes the Constitution saving throw DC for maintaining concentration
 * after taking damage (PHB p.203).
 *
 * DC = max(10, floor(finalDamage / 2))
 *
 * @param finalDamage - Post-resistance damage taken (>= 0).
 * @returns The save DC (minimum 10).
 */
export function computeConcentrationSaveDc(finalDamage: number): number {
  return Math.max(10, Math.floor(finalDamage / 2));
}

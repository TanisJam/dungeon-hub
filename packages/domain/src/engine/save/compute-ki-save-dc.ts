/**
 * computeKiSaveDc — Monk ki save DC formula.
 *
 * PHB p.78 — "Ki Save DC":
 *   "Some of your ki features require your target to make a saving throw to resist
 *    the feature's effects. The saving throw DC is calculated as follows:
 *    Ki save DC = 8 + your proficiency bonus + your Wisdom modifier."
 *
 * PURE: no IO, no DB, no fetch.
 * Design ref: sdd/engine-stunning-strike/design — ADR-3.
 */

/**
 * Computes the Monk ki save DC.
 * PHB p.78: 8 + proficiency bonus + Wisdom modifier.
 *
 * @param proficiencyBonus - the Monk's current proficiency bonus
 * @param wisMod - the Monk's Wisdom modifier (not score)
 * @returns the ki save DC
 */
export function computeKiSaveDc(proficiencyBonus: number, wisMod: number): number {
  return 8 + proficiencyBonus + wisMod;
}

/**
 * computeDivineSmiteDice — Divine Smite damage dice formula.
 *
 * PHB p.85 — Divine Smite:
 *   "Starting at 2nd level, when you hit a creature with a melee weapon attack,
 *    you can expend one spell slot to deal radiant damage to the target, in
 *    addition to the weapon's damage. The extra damage is 2d8 for a 1st-level
 *    spell slot, plus 1d8 for each spell level higher than 1st, to a maximum of
 *    5d8. The damage increases by 1d8 if the target is an undead or a fiend,
 *    to a maximum of 6d8."
 *
 * PURE: no IO, no DB, no fetch. Caller (consumeSpellSlot + Zod schema) validates
 * slotLevel range — this helper does not re-validate.
 * Design ref: sdd/engine-divine-smite/design — ADR-2.
 */

import type { DiceExpr } from '../types.js';

/**
 * Computes the dice expression for a Divine Smite.
 * PHB p.85: base = slotLevel + 1 (min 2d8, cap 5d8); +1d8 if undead/fiend (cap 6d8).
 *
 * @param slotLevel - spell slot level expended (1..5; range enforced by schema + consumeSpellSlot)
 * @param targetIsUndeadOrFiend - whether the target is an undead or fiend (caller-asserted)
 * @returns the dice expression string, e.g. '3d8'
 */
export function computeDivineSmiteDice(
  slotLevel: number,
  targetIsUndeadOrFiend: boolean,
): DiceExpr {
  // PHB p.85: base dice count = slot level + 1, capped at 5
  let n = Math.min(slotLevel + 1, 5);
  // PHB p.85: +1d8 if target is undead or fiend, absolute cap 6d8
  if (targetIsUndeadOrFiend) n += 1;
  n = Math.min(n, 6);
  return `${n}d8` as DiceExpr;
}

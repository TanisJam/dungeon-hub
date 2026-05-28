/**
 * Stacking category strategies for type-level stacking.
 *
 * The strategy lives on the CATEGORY, never on the modifier instance (§3.1).
 * Two modifiers of the same category follow the same rule regardless of their
 * individual values — you never mark a specific item bonus as "non-stacking".
 *
 * 5e rules reference:
 *   - untyped bonuses always stack (PHB does not restrict them by type).
 *   - item / status / circumstance bonuses: only the highest applies within
 *     the type; bonuses of different types all apply to the same roll.
 *
 * Design ref: sdd/resolution-engine/design — §3.1 "type-level stacking".
 */
import type { StackCategory } from '../types.js';

/**
 * Maps every StackCategory to its stacking strategy.
 *
 * 'keep-highest' — within this category, only the single largest value contributes.
 * 'all-stack'    — every instance within this category contributes additively.
 */
export const STACKING_STRATEGIES: Record<StackCategory, 'keep-highest' | 'all-stack'> = {
  untyped: 'all-stack',
  item: 'keep-highest',
  status: 'keep-highest',
  circumstance: 'keep-highest',
};

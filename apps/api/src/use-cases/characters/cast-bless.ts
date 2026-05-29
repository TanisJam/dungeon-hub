import { applyActiveEffect } from './apply-active-effect.js';

/**
 * Casts the Bless spell: delegates to the generic applyActiveEffect use-case
 * with slug='bless'. The RuleDoc is in modifier_definitions (seeded by
 * seed-modifier-definitions.ts) and compileRule produces the same instances
 * as the legacy buildBlessModifiers builder (REQ-AE-11 equivalence test).
 *
 * Bless-specific edge (D4 — Option A delegation):
 *   - Delegates to applyActiveEffect('bless', ...) instead of calling
 *     buildBlessModifiers directly. The cast-bless HTTP contract is UNCHANGED.
 *   - buildBlessModifiers is no longer imported in the API layer (REQ-BC-01).
 *
 * PHB 219: up to 3 targets, +1d4 on attack rolls and saving throws, concentration.
 * REQ-CASTBLESS-01 (spec #1130). REQ-BC-01 (sdd/engine-active-effects/spec #1152).
 *
 * Design ref: sdd/engine-active-effects/design #1153 — Option A.
 */
export async function castBless(
  casterId: string,
  targetIds: string[],
  token: string,
): Promise<void> {
  await applyActiveEffect(casterId, 'bless', targetIds, token);
}

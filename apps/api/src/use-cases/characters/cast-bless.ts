import type { EntityId } from '@dungeon-hub/domain/engine';
import { buildBlessModifiers } from '@dungeon-hub/domain/engine';
import { applyModifierInstances } from './apply-modifier-instances.js';

/**
 * Casts the Bless spell: builds modifier instances for the caster's targets
 * and persists them to the DB.
 *
 * Bless-specific edge (D4 — "specific edge on top of generic substrate"):
 *   - Calls buildBlessModifiers (pure domain) to produce ModifierInstance[].
 *   - Delegates persistence to applyModifierInstances (generic trio, zero Bless knowledge).
 *   - This function is the ONLY place in the codebase that knows "Bless → trio".
 *     The second concentration effect will add its own thin edge without touching the trio.
 *
 * PHB 219: up to 3 targets, +1d4 on attack rolls and saving throws, concentration.
 * REQ-CASTBLESS-01 (spec #1130).
 *
 * Design ref: sdd/engine-stateful/design #1131 — D4; tasks #1132 — T5.
 */
export async function castBless(
  casterId: string,
  targetIds: string[],
  token: string,
): Promise<void> {
  const instances = buildBlessModifiers(
    casterId as EntityId,
    targetIds as EntityId[],
    token,
  );
  await applyModifierInstances(instances);
}

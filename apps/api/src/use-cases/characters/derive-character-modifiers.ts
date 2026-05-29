import {
  deriveInventoryModifiers,
  type ItemModifierMap,
  type ModifierInstance,
  type EntityId,
} from '@dungeon-hub/domain/engine';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

/**
 * Derives modifier instances from a character's inventory.
 *
 * REQ-MDREFACTOR-01: the hardcoded itemModifierMap literal has been removed (#513 resolved).
 * The map is now injected by the caller (the GET /sheet route loads it via loadModifierDefinitions).
 *
 * No DB read/write — pure transformation using already-loaded data.
 */
export function deriveCharacterModifiers(
  inventory: InventoryItem[],
  charId: string,
  map: ItemModifierMap,
): ModifierInstance[] {
  return deriveInventoryModifiers(inventory, charId as EntityId, map);
}

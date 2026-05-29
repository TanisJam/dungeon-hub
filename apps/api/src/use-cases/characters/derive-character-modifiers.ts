import {
  deriveInventoryModifiers,
  buildCloakOfProtectionModifiers,
  type ItemModifierMap,
  type ModifierInstance,
  type EntityId,
} from '@dungeon-hub/domain/engine';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

/**
 * Derives modifier instances from a character's inventory.
 *
 * Holds the hardcoded item→modifier map that will be replaced by a
 * DB-backed modifier_definition catalog in Slice 5.
 *
 * No DB read/write — pure transformation using already-loaded data.
 */
// TODO #513: DB-backed modifier_definition catalog (Slice 5)
const itemModifierMap: ItemModifierMap = {
  'cloak-of-protection': buildCloakOfProtectionModifiers,
};

export function deriveCharacterModifiers(
  inventory: InventoryItem[],
  charId: string,
): ModifierInstance[] {
  return deriveInventoryModifiers(inventory, charId as EntityId, itemModifierMap);
}

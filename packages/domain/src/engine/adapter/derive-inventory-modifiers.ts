/**
 * derive-inventory-modifiers — inventory → modifier adapter.
 *
 * Pure domain helper. No IO, no registry access.
 *
 * Takes a character's inventory, their EntityId, and an injected itemModifierMap
 * (the Slice-5 DB seam — today a hardcoded literal in the api use-case), and
 * returns all ModifierInstances produced by equipped+attuned mapped items.
 *
 * // DMG 159 (Magic Items — Cloak of Protection): "+1 bonus to AC and saving throws
 * // while you wear this cloak." Requires attunement.
 *
 * REQ-ADAPTER-01: filter equipped+attuned → lookup slug → call builder → flatMap.
 * Unknown slug / unequipped / unattuned → empty (silent skip, no error).
 */

import type { InventoryItem } from '../../character/inventory/types.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Injected map of item slug → builder function.
 *
 * The value signature `(charId: EntityId, itemId: string) => ModifierInstance[]`
 * matches `buildCloakOfProtectionModifiers` exactly — zero adapter glue needed.
 *
 * // TODO #513: Today this is a hardcoded literal `{ 'cloak-of-protection': build… }`
 * // in the api use-case (derive-character-modifiers.ts). Slice 5 replaces it with a
 * // map built from DB-loaded `modifier_definition` rows. Domain signature unchanged.
 */
export type ItemModifierMap = Record<string, (charId: EntityId, itemId: string) => ModifierInstance[]>;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives a flat list of ModifierInstances from a character's inventory.
 *
 * Only items that are BOTH `state === 'equipped'` AND `attuned === true`
 * AND whose `itemSlug` has an entry in `itemModifierMap` contribute instances.
 * Everything else is silently skipped (same tolerance as the registry empty path).
 *
 * @param inventory    - The character's full item list (from characters.inventory JSONB).
 * @param charId       - EntityId of the owning character (opaque branded string).
 * @param itemModifierMap - Injected slug→builder map (the Slice-5 seam).
 * @returns Flat array of ModifierInstances ready for registry.register().
 */
export function deriveInventoryModifiers(
  inventory: InventoryItem[],
  charId: EntityId,
  itemModifierMap: ItemModifierMap,
): ModifierInstance[] {
  return inventory.flatMap((item) => {
    if (item.state !== 'equipped' || item.attuned !== true) {
      return [];
    }
    const builder = itemModifierMap[item.itemSlug];
    if (builder === undefined) {
      return [];
    }
    return builder(charId, item.instanceId);
  });
}

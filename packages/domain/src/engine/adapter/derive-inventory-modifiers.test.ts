/**
 * derive-inventory-modifiers — unit tests (strict TDD, RED first).
 *
 * // DMG 159 (Magic Items — Cloak of Protection): "+1 bonus to AC and saving throws
 * // while you wear this cloak." Requires attunement.
 *
 * REQ-ADAPTER-01: deriveInventoryModifiers returns ModifierInstance[] for
 * equipped+attuned items whose slug is in the injected itemModifierMap, and []
 * for all other cases (unequipped, unattuned, unknown slug).
 */

import { describe, it, expect } from 'vitest';
import { buildCloakOfProtectionModifiers } from '../rules/cloak-of-protection.js';
import type { InventoryItem } from '../../character/inventory/types.js';
import { deriveInventoryModifiers, type ItemModifierMap } from './derive-inventory-modifiers.js';

// ── Fixture helpers ────────────────────────────────────────────────────────────

function cloakItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    instanceId: 'inst-1',
    itemSlug: 'cloak-of-protection',
    itemSource: 'DMG',
    quantity: 1,
    state: 'equipped',
    attuned: true,
    customName: null,
    notes: '',
    ...overrides,
  };
}

const MAP_WITH_CLOAK: ItemModifierMap = {
  'cloak-of-protection': buildCloakOfProtectionModifiers,
};

const CHAR_ID = 'char-1' as Parameters<typeof deriveInventoryModifiers>[1];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('deriveInventoryModifiers', () => {
  /**
   * Scenario A: equipped + attuned Cloak → ModifierInstances returned.
   * // DMG 159: "+1 bonus to AC … while you wear this cloak."
   */
  it('A: equipped + attuned Cloak returns builder instances including AC +1', () => {
    const inventory = [cloakItem()];
    const result = deriveInventoryModifiers(inventory, CHAR_ID, MAP_WITH_CLOAK);

    const expected = buildCloakOfProtectionModifiers(CHAR_ID, 'inst-1');
    expect(result).toEqual(expected);

    // At least one instance must carry the AC +1 (item category) — DMG 159.
    const acInstance = result.find(
      (m) => m.def.kind === 'num' && m.def.stat === 'ac' && m.def.value === 1 && m.def.category === 'item',
    );
    expect(acInstance).toBeDefined();
  });

  /**
   * Scenario B: carried (not equipped) + attuned → [].
   * // DMG 159: "… while you WEAR this cloak" — must be equipped.
   */
  it('B: state=carried + attuned returns []', () => {
    const inventory = [cloakItem({ state: 'carried' })];
    const result = deriveInventoryModifiers(inventory, CHAR_ID, MAP_WITH_CLOAK);
    expect(result).toEqual([]);
  });

  /**
   * Scenario C: equipped + NOT attuned → [].
   * // PHB 136: "You must be attuned to the item to gain its benefits."
   */
  it('C: state=equipped + attuned=false returns []', () => {
    const inventory = [cloakItem({ attuned: false })];
    const result = deriveInventoryModifiers(inventory, CHAR_ID, MAP_WITH_CLOAK);
    expect(result).toEqual([]);
  });

  /**
   * Scenario D: equipped + attuned, unknown slug → [].
   * itemModifierMap has no entry for this slug; silent skip.
   */
  it('D: equipped + attuned but unknown slug returns []', () => {
    const inventory = [
      cloakItem({ itemSlug: 'unknown-magic-item', itemSource: 'HB' }),
    ];
    const result = deriveInventoryModifiers(inventory, CHAR_ID, MAP_WITH_CLOAK);
    expect(result).toEqual([]);
  });

  /**
   * Scenario E: mixed inventory → only Cloak instances returned.
   * - Cloak: equipped + attuned (qualifies)
   * - Longsword: equipped + NOT attuned (fails attuned gate)
   * - Potion: carried + attuned (fails equipped gate AND slug gate)
   */
  it('E: mixed inventory — only equipped+attuned mapped items contribute', () => {
    const inventory: InventoryItem[] = [
      cloakItem({ instanceId: 'inst-cloak' }),
      {
        instanceId: 'inst-sword',
        itemSlug: 'longsword',
        itemSource: 'PHB',
        quantity: 1,
        state: 'equipped',
        attuned: false,
        customName: null,
        notes: '',
      },
      {
        instanceId: 'inst-potion',
        itemSlug: 'potion-of-healing',
        itemSource: 'DMG',
        quantity: 3,
        state: 'carried',
        attuned: true,
        customName: null,
        notes: '',
      },
    ];

    const result = deriveInventoryModifiers(inventory, CHAR_ID, MAP_WITH_CLOAK);
    const expected = buildCloakOfProtectionModifiers(CHAR_ID, 'inst-cloak');
    expect(result).toEqual(expected);
  });
});

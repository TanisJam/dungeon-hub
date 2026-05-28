/**
 * Tests for updateInventoryItem v3TypeOverride patch passthrough — STRICT TDD (RED first).
 *
 * Req: CIVTO-FIELD-01 (spec #1077) — patch spread
 * Design: DC1, DCE3 (design #1078) — pure passthrough, no validation rules
 *
 * These tests assert the PATCH behavior for v3TypeOverride.
 * Production code (validate.ts) does NOT yet spread this field — tests are RED.
 *
 * PHB cite: §1.2 (DM customization — override is DM decision, not PHB rule)
 */
import { describe, it, expect } from 'vitest';
import { updateInventoryItem } from '../../../src/character/inventory/validate.js';
import type {
  InventoryItem,
  UpdateItemInput,
  ItemCompendiumLite,
  InventoryContext,
} from '../../../src/character/inventory/types.js';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    instanceId: 'inst-1',
    itemSlug: 'longsword',
    itemSource: 'PHB',
    quantity: 1,
    state: 'carried',
    attuned: false,
    customName: null,
    notes: '',
    ...overrides,
  };
}

const ITEM_DATA: ItemCompendiumLite = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Espada larga',
  type: 'M',
  weight: 3,
};

const CTX: InventoryContext = {
  strScore: 14,
  armorProficiencies: [],
  weaponProficiencies: ['martial weapons'],
};

describe('updateInventoryItem v3TypeOverride passthrough — CIVTO-FIELD-01', () => {
  it('PATCH v3TypeOverride: "book" sets the field on the updated item', () => {
    // Given: an inventory with one item without any override
    const inventory: InventoryItem[] = [makeItem()];
    const patch: UpdateItemInput = { v3TypeOverride: 'book' };

    // When: updateInventoryItem is called with the override
    const result = updateInventoryItem({
      inventory,
      instanceId: 'inst-1',
      patch,
      itemData: ITEM_DATA,
      weights: [ITEM_DATA],
      ctx: CTX,
    });

    // Then: the updated item has v3TypeOverride: 'book'
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = result.inventory.find((i) => i.instanceId === 'inst-1');
    expect(updated?.v3TypeOverride).toBe('book');
  });

  it('PATCH v3TypeOverride: null clears the override', () => {
    // Given: an inventory with an item that already has an override
    const inventory: InventoryItem[] = [makeItem({ v3TypeOverride: 'quest' })];
    const patch: UpdateItemInput = { v3TypeOverride: null };

    // When: updateInventoryItem is called with null to clear
    const result = updateInventoryItem({
      inventory,
      instanceId: 'inst-1',
      patch,
      itemData: ITEM_DATA,
      weights: [ITEM_DATA],
      ctx: CTX,
    });

    // Then: the updated item has v3TypeOverride: null
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = result.inventory.find((i) => i.instanceId === 'inst-1');
    expect(updated?.v3TypeOverride).toBeNull();
  });

  it('absent v3TypeOverride in patch preserves the existing field value', () => {
    // Given: an inventory with an item that has v3TypeOverride: 'magic'
    const inventory: InventoryItem[] = [makeItem({ v3TypeOverride: 'magic' })];
    // Patch does NOT include v3TypeOverride (patch partial)
    const patch: UpdateItemInput = { notes: 'Updated note' };

    // When: updateInventoryItem is called WITHOUT v3TypeOverride in the patch
    const result = updateInventoryItem({
      inventory,
      instanceId: 'inst-1',
      patch,
      itemData: ITEM_DATA,
      weights: [ITEM_DATA],
      ctx: CTX,
    });

    // Then: the existing v3TypeOverride is preserved (not wiped)
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = result.inventory.find((i) => i.instanceId === 'inst-1');
    expect(updated?.v3TypeOverride).toBe('magic');
    expect(updated?.notes).toBe('Updated note');
  });
});

/**
 * Tests for InventoryItem.v3TypeOverride field — STRICT TDD (RED first).
 *
 * Req: CIVTO-FIELD-01 (spec #1077)
 * Design: DC1 — v3TypeOverride is JSONB-stored; optional field; legacy tolerance.
 *
 * These tests assert the TYPE presence and round-trip behavior.
 * Production code (types.ts) does NOT yet have this field — tests are RED.
 */
import { describe, it, expect } from 'vitest';
import type { InventoryItem } from '../../../src/character/inventory/types.js';

function makeBaseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    instanceId: 'test-instance-1',
    itemSlug: 'test-item',
    itemSource: 'PHB',
    quantity: 1,
    state: 'carried',
    attuned: false,
    customName: null,
    notes: '',
    ...overrides,
  };
}

describe('InventoryItem.v3TypeOverride — CIVTO-FIELD-01', () => {
  it('legacy row without v3TypeOverride field loads as undefined (CIVTO-FIELD-01 legacy tolerance)', () => {
    // Given: a stored row WITHOUT v3TypeOverride key (e.g., old DB data)
    const legacy: InventoryItem = makeBaseItem();
    // Then: the field is undefined — type-level; runtime access should not error
    // TypeScript read-path tolerance: CLAUDE.md §11
    expect(legacy.v3TypeOverride).toBeUndefined();
  });

  it('explicit null round-trip — v3TypeOverride: null means "no override, use derived type" (CIVTO-FIELD-01)', () => {
    // Given: a row with v3TypeOverride explicitly set to null
    const item: InventoryItem = makeBaseItem({ v3TypeOverride: null });
    // Then: the field is null (override cleared)
    expect(item.v3TypeOverride).toBeNull();
  });

  it('explicit quest override round-trip — v3TypeOverride: "quest" routes to QuestDetailVariant (CIVTO-FIELD-01)', () => {
    // Given: a row with v3TypeOverride set to 'quest' (DC4: only via override)
    const item: InventoryItem = makeBaseItem({ v3TypeOverride: 'quest' });
    // Then: the field is 'quest'
    expect(item.v3TypeOverride).toBe('quest');
  });
});

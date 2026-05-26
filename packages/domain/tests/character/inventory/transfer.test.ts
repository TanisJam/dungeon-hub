import { describe, it, expect } from 'vitest';
import { transferItemBetweenCharacters } from '../../../src/character/inventory/transfer.js';
import type { InventoryItem } from '../../../src/character/inventory/types.js';

function makeItem(overrides: Partial<InventoryItem> & Pick<InventoryItem, 'instanceId'>): InventoryItem {
  return {
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

const FIXED_NEW_ID = 'new-uuid-fixed';
const newInstanceIdFactory = () => FIXED_NEW_ID;

describe('transferItemBetweenCharacters', () => {
  it('full-stack transfer: item moves whole from fromChar to toChar', () => {
    const item = makeItem({ instanceId: 'i1', itemSlug: 'longsword', itemSource: 'PHB', quantity: 1 });
    const result = transferItemBetweenCharacters({
      fromInventory: [item],
      toInventory: [],
      instanceId: 'i1',
      newInstanceIdFactory,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fromInventoryNext).toHaveLength(0);
    expect(result.toInventoryNext).toHaveLength(1);
    expect(result.toInventoryNext[0].quantity).toBe(1);
    expect(result.transferred.quantity).toBe(1);
    expect(result.transferred.itemSlug).toBe('longsword');
  });

  it('partial-stack: fromChar qty reduced, toChar gets NEW instanceId', () => {
    const item = makeItem({ instanceId: 'i1', quantity: 3 });
    const result = transferItemBetweenCharacters({
      fromInventory: [item],
      toInventory: [],
      instanceId: 'i1',
      quantity: 1,
      newInstanceIdFactory,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // fromChar instance qty reduced
    expect(result.fromInventoryNext[0].quantity).toBe(2);
    expect(result.fromInventoryNext[0].instanceId).toBe('i1');
    // toChar gets a new instance
    expect(result.toInventoryNext[0].instanceId).toBe(FIXED_NEW_ID);
    expect(result.toInventoryNext[0].quantity).toBe(1);
    // transferred record
    expect(result.transferred.newInstanceId).toBe(FIXED_NEW_ID);
    expect(result.transferred.quantity).toBe(1);
  });

  it('instance-not-found → INVENTORY_INSTANCE_NOT_FOUND issue', () => {
    const result = transferItemBetweenCharacters({
      fromInventory: [],
      toInventory: [],
      instanceId: 'nonexistent',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe('INVENTORY_INSTANCE_NOT_FOUND');
    expect(result.issues[0].instanceId).toBe('nonexistent');
  });

  it('requested > available → INVENTORY_INSUFFICIENT_QUANTITY issue', () => {
    const item = makeItem({ instanceId: 'i1', quantity: 1 });
    const result = transferItemBetweenCharacters({
      fromInventory: [item],
      toInventory: [],
      instanceId: 'i1',
      quantity: 5,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe('INVENTORY_INSUFFICIENT_QUANTITY');
    expect((result.issues[0] as { code: string; requested: number; available: number }).requested).toBe(5);
    expect((result.issues[0] as { code: string; requested: number; available: number }).available).toBe(1);
  });

  it('quantity boundary: requested === available is a full-stack transfer', () => {
    const item = makeItem({ instanceId: 'i1', quantity: 3 });
    const result = transferItemBetweenCharacters({
      fromInventory: [item],
      toInventory: [],
      instanceId: 'i1',
      quantity: 3,
      newInstanceIdFactory,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Full stack → fromChar item removed
    expect(result.fromInventoryNext).toHaveLength(0);
    expect(result.toInventoryNext[0].quantity).toBe(3);
  });

  it('both inventories preserved when issue returned (no mutation)', () => {
    const from = [makeItem({ instanceId: 'i1', quantity: 1 })];
    const to = [makeItem({ instanceId: 'i2', itemSlug: 'dagger', quantity: 2 })];
    const result = transferItemBetweenCharacters({
      fromInventory: from,
      toInventory: to,
      instanceId: 'nonexistent',
    });
    expect(result.ok).toBe(false);
    // Original arrays untouched (pure function)
    expect(from).toHaveLength(1);
    expect(to).toHaveLength(1);
  });

  it('factory injection: newInstanceIdFactory is called for partial transfer', () => {
    let callCount = 0;
    const factory = () => { callCount++; return `gen-${callCount}`; };
    const item = makeItem({ instanceId: 'i1', quantity: 5 });
    const result = transferItemBetweenCharacters({
      fromInventory: [item],
      toInventory: [],
      instanceId: 'i1',
      quantity: 2,
      newInstanceIdFactory: factory,
    });
    expect(result.ok).toBe(true);
    expect(callCount).toBe(1);
  });

  it('full-stack transfer when quantity param omitted defaults to full stack', () => {
    const item = makeItem({ instanceId: 'i1', quantity: 4 });
    const result = transferItemBetweenCharacters({
      fromInventory: [item],
      toInventory: [],
      instanceId: 'i1',
      // quantity omitted → moves whole stack
      newInstanceIdFactory,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fromInventoryNext).toHaveLength(0);
    expect(result.toInventoryNext[0].quantity).toBe(4);
  });
});

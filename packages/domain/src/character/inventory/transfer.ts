import type { InventoryItem } from './types.js';

export type TransferIssue =
  | { code: 'INVENTORY_INSTANCE_NOT_FOUND'; instanceId: string }
  | { code: 'INVENTORY_INSUFFICIENT_QUANTITY'; instanceId: string; requested: number; available: number };

export type TransferResult =
  | {
      ok: true;
      fromInventoryNext: InventoryItem[];
      toInventoryNext: InventoryItem[];
      transferred: {
        instanceId: string;
        newInstanceId?: string;
        quantity: number;
        itemSlug: string;
        itemSource: string;
      };
    }
  | { ok: false; issues: TransferIssue[] };

export interface TransferInput {
  fromInventory: InventoryItem[];
  toInventory: InventoryItem[];
  instanceId: string;
  /** Quantity to transfer. When omitted, moves the full stack. */
  quantity?: number;
  /** Factory for generating the new instanceId on a partial-stack split. Injectable for tests. */
  newInstanceIdFactory?: () => string;
}

/**
 * Pure domain helper: atomically moves items from one character's inventory to another.
 * Does NOT write to DB; the caller (use-case/API handler) wraps in db.transaction.
 *
 * Design decisions (sdd/inventory-d4-d6/design #890):
 * - Full-stack: the whole InventoryItem moves to toInventory (same instanceId, quantity unchanged).
 * - Partial-stack: fromInventory instance quantity decremented; toInventory gets a NEW instance
 *   (new instanceId from factory) with the transferred quantity.
 * - Uses crypto.randomUUID() by default; override via `newInstanceIdFactory` in tests.
 */
export function transferItemBetweenCharacters(input: TransferInput): TransferResult {
  const { fromInventory, toInventory, instanceId } = input;

  const fromItem = fromInventory.find((it) => it.instanceId === instanceId);
  if (!fromItem) {
    return { ok: false, issues: [{ code: 'INVENTORY_INSTANCE_NOT_FOUND', instanceId }] };
  }

  const requestedQty = input.quantity ?? fromItem.quantity; // default = full stack
  if (requestedQty > fromItem.quantity) {
    return {
      ok: false,
      issues: [
        {
          code: 'INVENTORY_INSUFFICIENT_QUANTITY',
          instanceId,
          requested: requestedQty,
          available: fromItem.quantity,
        },
      ],
    };
  }

  const isFullStack = requestedQty === fromItem.quantity;

  if (isFullStack) {
    // Move the item wholesale — same instanceId, same quantity.
    const fromInventoryNext = fromInventory.filter((it) => it.instanceId !== instanceId);
    const toInventoryNext = [...toInventory, { ...fromItem }];
    return {
      ok: true,
      fromInventoryNext,
      toInventoryNext,
      transferred: {
        instanceId: fromItem.instanceId,
        quantity: requestedQty,
        itemSlug: fromItem.itemSlug,
        itemSource: fromItem.itemSource,
      },
    };
  } else {
    // Partial transfer — decrement fromChar, insert new instance on toChar.
    const factory = input.newInstanceIdFactory ?? (() => crypto.randomUUID());
    const newInstanceId = factory();

    const fromInventoryNext = fromInventory.map((it) =>
      it.instanceId === instanceId ? { ...it, quantity: it.quantity - requestedQty } : it,
    );
    const newItem: InventoryItem = {
      ...fromItem,
      instanceId: newInstanceId,
      quantity: requestedQty,
    };
    const toInventoryNext = [...toInventory, newItem];

    return {
      ok: true,
      fromInventoryNext,
      toInventoryNext,
      transferred: {
        instanceId: fromItem.instanceId,
        newInstanceId,
        quantity: requestedQty,
        itemSlug: fromItem.itemSlug,
        itemSource: fromItem.itemSource,
      },
    };
  }
}

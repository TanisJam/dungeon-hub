import { describe, expect, it } from 'vitest';
import {
  addItemToInventory,
  consumeInventoryItem,
} from '../../../src/character/inventory/validate.js';
import type {
  InventoryContext,
  ItemCompendiumLite,
} from '../../../src/character/inventory/types.js';

const arrows20: ItemCompendiumLite = {
  slug: 'arrows-20',
  source: 'PHB',
  name: 'Arrows (20)',
  type: 'A',
  weight: 1,
};

const arrowSingle: ItemCompendiumLite = {
  slug: 'arrow',
  source: 'PHB',
  name: 'Arrow',
  type: 'A',
  weight: 0.05,
};

const arrowsXphb: ItemCompendiumLite = {
  ...arrows20,
  source: 'XPHB',
};

const longsword: ItemCompendiumLite = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M',
  weight: 3,
};

const martialCtx: InventoryContext = {
  strScore: 14,
  armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
  weaponProficiencies: ['simple', 'martial'],
};

describe('addItemToInventory — auto-merge munición', () => {
  it('crea instance nueva la primera vez', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: arrows20,
      input: { quantity: 1, state: 'carried' },
      weights: [arrows20],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory).toHaveLength(1);
    expect(res.inventory[0]!.quantity).toBe(1);
  });

  it('al agregar el mismo ammo con mismo state suma quantity en el stack existente', () => {
    const first = addItemToInventory({
      inventory: [],
      itemData: arrows20,
      input: { quantity: 2, state: 'carried' },
      weights: [arrows20],
      ctx: martialCtx,
    });
    if (!first.ok) throw new Error('setup');

    const second = addItemToInventory({
      inventory: first.inventory,
      itemData: arrows20,
      input: { quantity: 3, state: 'carried' },
      weights: [arrows20],
      ctx: martialCtx,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.inventory).toHaveLength(1);
    expect(second.inventory[0]!.quantity).toBe(5);
    expect(second.addedInstanceId).toBe(first.addedInstanceId);
  });

  it('NO mergea si el state es distinto (quiver vs mochila)', () => {
    const first = addItemToInventory({
      inventory: [],
      itemData: arrows20,
      input: { quantity: 1, state: 'carried' },
      weights: [arrows20],
      ctx: martialCtx,
    });
    if (!first.ok) throw new Error('setup');

    const second = addItemToInventory({
      inventory: first.inventory,
      itemData: arrows20,
      input: { quantity: 2, state: 'stowed' },
      weights: [arrows20],
      ctx: martialCtx,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.inventory).toHaveLength(2);
    const carried = second.inventory.find((it) => it.state === 'carried')!;
    const stowed = second.inventory.find((it) => it.state === 'stowed')!;
    expect(carried.quantity).toBe(1);
    expect(stowed.quantity).toBe(2);
  });

  it('NO mergea si el slug es distinto aunque ambos sean ammo (arrow vs arrows-20)', () => {
    const first = addItemToInventory({
      inventory: [],
      itemData: arrows20,
      input: { quantity: 1 },
      weights: [arrows20],
      ctx: martialCtx,
    });
    if (!first.ok) throw new Error('setup');

    const second = addItemToInventory({
      inventory: first.inventory,
      itemData: arrowSingle,
      input: { quantity: 5 },
      weights: [arrows20, arrowSingle],
      ctx: martialCtx,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.inventory).toHaveLength(2);
  });

  it('NO mergea si el source es distinto (arrows PHB vs XPHB)', () => {
    const first = addItemToInventory({
      inventory: [],
      itemData: arrows20,
      input: { quantity: 1 },
      weights: [arrows20],
      ctx: martialCtx,
    });
    if (!first.ok) throw new Error('setup');

    const second = addItemToInventory({
      inventory: first.inventory,
      itemData: arrowsXphb,
      input: { quantity: 1 },
      weights: [arrows20, arrowsXphb],
      ctx: martialCtx,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.inventory).toHaveLength(2);
  });

  it('non-ammunition (longsword) NO se mergea aunque slug+source+state coincidan', () => {
    const first = addItemToInventory({
      inventory: [],
      itemData: longsword,
      input: { quantity: 1, state: 'carried' },
      weights: [longsword],
      ctx: martialCtx,
    });
    if (!first.ok) throw new Error('setup');

    const second = addItemToInventory({
      inventory: first.inventory,
      itemData: longsword,
      input: { quantity: 1, state: 'carried' },
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.inventory).toHaveLength(2);
  });

  it('reconoce type con sufijo de source (ej. "A|XPHB")', () => {
    const arrowsWithSuffix: ItemCompendiumLite = {
      ...arrows20,
      type: 'A|XPHB',
    };
    const first = addItemToInventory({
      inventory: [],
      itemData: arrowsWithSuffix,
      input: { quantity: 1 },
      weights: [arrowsWithSuffix],
      ctx: martialCtx,
    });
    if (!first.ok) throw new Error('setup');

    const second = addItemToInventory({
      inventory: first.inventory,
      itemData: arrowsWithSuffix,
      input: { quantity: 4 },
      weights: [arrowsWithSuffix],
      ctx: martialCtx,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.inventory).toHaveLength(1);
    expect(second.inventory[0]!.quantity).toBe(5);
  });

  it('merge propaga warnings (encumbrance) recalculados sobre el inventario nuevo', () => {
    const heavyArrows: ItemCompendiumLite = { ...arrows20, weight: 50 };
    const weakCtx: InventoryContext = { ...martialCtx, strScore: 8 };
    // max = 8*15 = 120. 50 + 50 + 50 = 150 > 120.

    let inv = (
      addItemToInventory({
        inventory: [],
        itemData: heavyArrows,
        input: { quantity: 1 },
        weights: [heavyArrows],
        ctx: weakCtx,
      }) as Extract<ReturnType<typeof addItemToInventory>, { ok: true }>
    ).inventory;
    inv = (
      addItemToInventory({
        inventory: inv,
        itemData: heavyArrows,
        input: { quantity: 1 },
        weights: [heavyArrows],
        ctx: weakCtx,
      }) as Extract<ReturnType<typeof addItemToInventory>, { ok: true }>
    ).inventory;

    const res = addItemToInventory({
      inventory: inv,
      itemData: heavyArrows,
      input: { quantity: 1 },
      weights: [heavyArrows],
      ctx: weakCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory[0]!.quantity).toBe(3);
    expect(res.warnings.find((w) => w.code === 'ENCUMBERED')).toBeDefined();
  });
});

describe('consumeInventoryItem — ammunition', () => {
  it('consume ammo decrementa quantity igual que potions', () => {
    const add = addItemToInventory({
      inventory: [],
      itemData: arrows20,
      input: { quantity: 20 },
      weights: [arrows20],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: arrows20,
      count: 3,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.consumed).toMatchObject({ mode: 'quantity', count: 3, removed: false, remaining: 17 });
  });

  it('consume ammo elimina la stack cuando llega a 0', () => {
    const add = addItemToInventory({
      inventory: [],
      itemData: arrows20,
      input: { quantity: 1 },
      weights: [arrows20],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: arrows20,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory).toHaveLength(0);
    expect(res.consumed!.removed).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addItemToInventory,
  consumeInventoryItem,
  rechargeInventoryItems,
  updateInventoryItem,
} from '../../../src/character/inventory/validate.js';
import type {
  InventoryContext,
  InventoryItem,
  ItemCompendiumLite,
} from '../../../src/character/inventory/types.js';

const wandOfMagicMissiles: ItemCompendiumLite = {
  slug: 'wand-of-magic-missiles',
  source: 'DMG',
  name: 'Wand of Magic Missiles',
  type: null,
  weight: 1,
  charges: 7,
  recharge: 'dawn',
};

const potionOfHealing: ItemCompendiumLite = {
  slug: 'potion-of-healing',
  source: 'PHB',
  name: 'Potion of Healing',
  type: 'P',
  weight: 0.5,
};

const spellScroll: ItemCompendiumLite = {
  slug: 'spell-scroll-fireball',
  source: 'DMG',
  name: 'Spell Scroll (Fireball)',
  type: 'SC',
  weight: null,
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

function freshInventory(): InventoryItem[] {
  return [];
}

describe('addItemToInventory — charges init', () => {
  it('inicializa charges al máximo del compendio cuando no se especifica', () => {
    const res = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: {},
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.inventory.find((it) => it.instanceId === res.addedInstanceId)!;
    expect(added.charges).toBe(7);
  });

  it('respeta charges iniciales si se pasan dentro del rango', () => {
    const res = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: { charges: 3 },
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.inventory.find((it) => it.instanceId === res.addedInstanceId)!;
    expect(added.charges).toBe(3);
  });

  it('rechaza charges iniciales > máximo', () => {
    const res = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: { charges: 10 },
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'CHARGES_EXCEEDS_MAX', max: 7 });
  });

  it('items sin charges en compendio quedan con charges null', () => {
    const res = addItemToInventory({
      inventory: freshInventory(),
      itemData: longsword,
      input: {},
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.inventory.find((it) => it.instanceId === res.addedInstanceId)!;
    expect(added.charges).toBeNull();
  });
});

describe('updateInventoryItem — patch charges', () => {
  it('permite setear charges dentro del rango', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: {},
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');
    const id = add.addedInstanceId!;

    const res = updateInventoryItem({
      inventory: add.inventory,
      instanceId: id,
      patch: { charges: 4 },
      itemData: wandOfMagicMissiles,
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory[0]!.charges).toBe(4);
  });

  it('rechaza patch.charges > máximo', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: {},
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = updateInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      patch: { charges: 99 },
      itemData: wandOfMagicMissiles,
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'CHARGES_EXCEEDS_MAX', max: 7 });
  });

  it('rechaza patch.charges en items sin charges en compendio', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: longsword,
      input: {},
      weights: [longsword],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = updateInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      patch: { charges: 1 },
      itemData: longsword,
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'CHARGES_EXCEEDS_MAX', max: 0 });
  });
});

describe('consumeInventoryItem — charges path', () => {
  it('decrementa charges en 1 por default', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: {},
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: wandOfMagicMissiles,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.consumed).toMatchObject({ mode: 'charges', count: 1, removed: false, remaining: 6 });
    expect(res.inventory[0]!.charges).toBe(6);
  });

  it('decrementa charges en N cuando se pasa count', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: {},
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: wandOfMagicMissiles,
      count: 3,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.consumed!.remaining).toBe(4);
  });

  it('rechaza count > charges disponibles', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: { charges: 2 },
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: wandOfMagicMissiles,
      count: 5,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({
      code: 'INSUFFICIENT_CHARGES',
      requested: 5,
      available: 2,
    });
  });

  it('permite consumir todas las charges (deja en 0)', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: { charges: 1 },
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: wandOfMagicMissiles,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory[0]!.charges).toBe(0);
    expect(res.consumed!.remaining).toBe(0);
    expect(res.consumed!.removed).toBe(false);
  });
});

describe('consumeInventoryItem — quantity path (potions, scrolls)', () => {
  it('decrementa quantity en potion y la deja viva si queda > 0', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: potionOfHealing,
      input: { quantity: 3 },
      weights: [potionOfHealing],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: potionOfHealing,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory[0]!.quantity).toBe(2);
    expect(res.consumed).toMatchObject({ mode: 'quantity', count: 1, removed: false, remaining: 2 });
  });

  it('elimina la instancia cuando quantity llega a 0', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: potionOfHealing,
      input: { quantity: 1 },
      weights: [potionOfHealing],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: potionOfHealing,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory).toHaveLength(0);
    expect(res.consumed).toMatchObject({ mode: 'quantity', removed: true, remaining: 0 });
  });

  it('funciona también con scrolls (type=SC)', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: spellScroll,
      input: { quantity: 1 },
      weights: [spellScroll],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: spellScroll,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory).toHaveLength(0);
  });

  it('reconoce type codes con sufijo de source (ej. "SC|DMG")', () => {
    const scrollWithSourceSuffix: ItemCompendiumLite = {
      ...spellScroll,
      type: 'SC|DMG',
    };
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: scrollWithSourceSuffix,
      input: { quantity: 2 },
      weights: [scrollWithSourceSuffix],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: scrollWithSourceSuffix,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.consumed!.mode).toBe('quantity');
  });

  it('rechaza count > quantity', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: potionOfHealing,
      input: { quantity: 2 },
      weights: [potionOfHealing],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: potionOfHealing,
      count: 5,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({
      code: 'INSUFFICIENT_QUANTITY',
      requested: 5,
      available: 2,
    });
  });
});

describe('consumeInventoryItem — non-consumable items', () => {
  it('rechaza ITEM_NOT_CONSUMABLE para armas/armaduras sin charges', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: longsword,
      input: {},
      weights: [longsword],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = consumeInventoryItem({
      inventory: add.inventory,
      instanceId: add.addedInstanceId!,
      itemData: longsword,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({
      code: 'ITEM_NOT_CONSUMABLE',
      itemSlug: 'longsword',
    });
  });

  it('devuelve INSTANCE_NOT_FOUND para instanceId desconocido', () => {
    const res = consumeInventoryItem({
      inventory: [],
      instanceId: '00000000-0000-0000-0000-000000000000',
      itemData: wandOfMagicMissiles,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'INSTANCE_NOT_FOUND' });
  });

  it('rechaza count < 1', () => {
    const res = consumeInventoryItem({
      inventory: [],
      instanceId: 'x',
      itemData: wandOfMagicMissiles,
      count: 0,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'QUANTITY_INVALID' });
  });
});

describe('rechargeInventoryItems', () => {
  it('recarga al máximo items con recharge=dawn', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: { charges: 2 },
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = rechargeInventoryItems({
      inventory: add.inventory,
      weights: [wandOfMagicMissiles],
    });

    expect(res.recharged).toHaveLength(1);
    expect(res.recharged[0]!.to).toBe(7);
    expect(res.inventory[0]!.charges).toBe(7);
  });

  it('no toca items ya llenos', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: wandOfMagicMissiles,
      input: {},
      weights: [wandOfMagicMissiles],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = rechargeInventoryItems({
      inventory: add.inventory,
      weights: [wandOfMagicMissiles],
    });
    expect(res.recharged).toHaveLength(0);
  });

  it('ignora items sin charges en compendio', () => {
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: longsword,
      input: {},
      weights: [longsword],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = rechargeInventoryItems({
      inventory: add.inventory,
      weights: [longsword],
    });
    expect(res.recharged).toHaveLength(0);
    expect(res.inventory[0]!.charges).toBeNull();
  });

  it('ignora items cuyo recharge no es dawn', () => {
    const dawnlessWand: ItemCompendiumLite = {
      ...wandOfMagicMissiles,
      recharge: 'turn',
    };
    const add = addItemToInventory({
      inventory: freshInventory(),
      itemData: dawnlessWand,
      input: { charges: 1 },
      weights: [dawnlessWand],
      ctx: martialCtx,
    });
    if (!add.ok) throw new Error('setup');

    const res = rechargeInventoryItems({
      inventory: add.inventory,
      weights: [dawnlessWand],
    });
    expect(res.recharged).toHaveLength(0);
    expect(res.inventory[0]!.charges).toBe(1);
  });
});

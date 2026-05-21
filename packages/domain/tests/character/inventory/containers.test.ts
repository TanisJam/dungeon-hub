import { describe, expect, it } from 'vitest';
import {
  addItemToInventory,
  removeItemFromInventory,
  updateInventoryItem,
} from '../../../src/character/inventory/validate.js';
import type {
  InventoryContext,
  InventoryItem,
  ItemCompendiumLite,
} from '../../../src/character/inventory/types.js';

const backpack: ItemCompendiumLite = {
  slug: 'backpack',
  source: 'PHB',
  name: 'Backpack',
  type: 'G',
  weight: 5,
  containerCapacity: { weightLb: 30, weightless: false },
};

const bagOfHolding: ItemCompendiumLite = {
  slug: 'bag-of-holding',
  source: 'DMG',
  name: 'Bag of Holding',
  type: null,
  weight: 15,
  containerCapacity: { weightLb: 500, weightless: true },
};

const handyHaversack: ItemCompendiumLite = {
  slug: 'hewards-handy-haversack',
  source: 'DMG',
  name: "Heward's Handy Haversack",
  type: null,
  weight: 5,
  // Compartimentos sumados: 20+20+80 = 120.
  containerCapacity: { weightLb: 120, weightless: true },
};

const longsword: ItemCompendiumLite = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M',
  weight: 3,
};

const plateArmor: ItemCompendiumLite = {
  slug: 'plate-armor',
  source: 'PHB',
  name: 'Plate Armor',
  type: 'HA',
  weight: 65,
};

const arrows: ItemCompendiumLite = {
  slug: 'arrows-20',
  source: 'PHB',
  name: 'Arrows (20)',
  type: 'A',
  weight: 1,
};

const ctx: InventoryContext = {
  strScore: 14,
  armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
  weaponProficiencies: ['simple', 'martial'],
};

const weakCtx: InventoryContext = { ...ctx, strScore: 8 };

function addOk(args: {
  inventory: InventoryItem[];
  itemData: ItemCompendiumLite;
  input: Parameters<typeof addItemToInventory>[0]['input'];
  weights: ItemCompendiumLite[];
  ctx?: InventoryContext;
}) {
  const res = addItemToInventory({
    inventory: args.inventory,
    itemData: args.itemData,
    input: args.input,
    weights: args.weights,
    ctx: args.ctx ?? ctx,
  });
  if (!res.ok) throw new Error(`add failed: ${JSON.stringify(res.issues)}`);
  return res;
}

describe('addItemToInventory — containerId en input', () => {
  it('agrega item dentro de un container existente', () => {
    const inv1 = addOk({
      inventory: [],
      itemData: backpack,
      input: {},
      weights: [backpack],
    });
    const inv2 = addOk({
      inventory: inv1.inventory,
      itemData: longsword,
      input: { containerId: inv1.addedInstanceId! },
      weights: [backpack, longsword],
    });

    const sword = inv2.inventory.find((it) => it.itemSlug === 'longsword')!;
    expect(sword.containerId).toBe(inv1.addedInstanceId);
  });

  it('rechaza containerId que no existe', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: longsword,
      input: { containerId: '00000000-0000-0000-0000-000000000000' },
      weights: [longsword],
      ctx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({
      code: 'CONTAINER_NOT_FOUND',
      containerId: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('rechaza containerId que apunta a un ítem no-container (longsword)', () => {
    const sword = addOk({ inventory: [], itemData: longsword, input: {}, weights: [longsword] });
    const res = addItemToInventory({
      inventory: sword.inventory,
      itemData: plateArmor,
      input: { containerId: sword.addedInstanceId! },
      weights: [longsword, plateArmor],
      ctx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'NOT_A_CONTAINER' });
  });
});

describe('updateInventoryItem — mover item entre containers', () => {
  it('mueve un item de root a un container', () => {
    const bag = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    const sword = addOk({
      inventory: bag.inventory,
      itemData: longsword,
      input: {},
      weights: [backpack, longsword],
    });

    const res = updateInventoryItem({
      inventory: sword.inventory,
      instanceId: sword.addedInstanceId!,
      patch: { containerId: bag.addedInstanceId! },
      itemData: longsword,
      weights: [backpack, longsword],
      ctx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory.find((it) => it.itemSlug === 'longsword')!.containerId).toBe(
      bag.addedInstanceId,
    );
  });

  it('rechaza mover un container dentro de sí mismo', () => {
    const bag = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    const res = updateInventoryItem({
      inventory: bag.inventory,
      instanceId: bag.addedInstanceId!,
      patch: { containerId: bag.addedInstanceId! },
      itemData: backpack,
      weights: [backpack],
      ctx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'CONTAINER_CYCLE' });
  });

  it('rechaza mover un container dentro de su descendiente (ciclo profundo)', () => {
    // A contiene B. Movemos A → adentro de B = ciclo.
    const a = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    const b = addOk({
      inventory: a.inventory,
      itemData: bagOfHolding,
      input: { containerId: a.addedInstanceId! },
      weights: [backpack, bagOfHolding],
    });

    const res = updateInventoryItem({
      inventory: b.inventory,
      instanceId: a.addedInstanceId!,
      patch: { containerId: b.addedInstanceId! },
      itemData: backpack,
      weights: [backpack, bagOfHolding],
      ctx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toMatchObject({ code: 'CONTAINER_CYCLE' });
  });

  it('mover a containerId=null sale al root', () => {
    const bag = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    const sword = addOk({
      inventory: bag.inventory,
      itemData: longsword,
      input: { containerId: bag.addedInstanceId! },
      weights: [backpack, longsword],
    });
    const res = updateInventoryItem({
      inventory: sword.inventory,
      instanceId: sword.addedInstanceId!,
      patch: { containerId: null },
      itemData: longsword,
      weights: [backpack, longsword],
      ctx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory.find((it) => it.itemSlug === 'longsword')!.containerId).toBeNull();
  });
});

describe('removeItemFromInventory — reparenteo de hijos', () => {
  it('al borrar un container, sus hijos se mueven a root (no se borran)', () => {
    const bag = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    const sword = addOk({
      inventory: bag.inventory,
      itemData: longsword,
      input: { containerId: bag.addedInstanceId! },
      weights: [backpack, longsword],
    });

    const res = removeItemFromInventory({
      inventory: sword.inventory,
      instanceId: bag.addedInstanceId!,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory).toHaveLength(1);
    expect(res.inventory[0]!.itemSlug).toBe('longsword');
    expect(res.inventory[0]!.containerId).toBeNull();
  });
});

describe('encumbrance — Bag of Holding y weightless containers', () => {
  it('100lb de plate dentro de Bag of Holding NO suma al encumbrance (solo cuenta los 15lb del bag)', () => {
    // Mallory STR 8, max = 120. Bag (15) + plate adentro (65) = "20" efectivos.
    // En realidad: 15 (bag) + 0 (plate dentro de weightless) = 15.
    const bag = addOk({
      inventory: [],
      itemData: bagOfHolding,
      input: {},
      weights: [bagOfHolding],
      ctx: weakCtx,
    });
    const res = addItemToInventory({
      inventory: bag.inventory,
      itemData: plateArmor,
      input: { containerId: bag.addedInstanceId! },
      weights: [bagOfHolding, plateArmor],
      ctx: weakCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Sin warning ENCUMBERED.
    expect(res.warnings.find((w) => w.code === 'ENCUMBERED')).toBeUndefined();
  });

  it('plate dentro de backpack (mundano) SÍ suma al encumbrance', () => {
    const bag = addOk({
      inventory: [],
      itemData: backpack,
      input: {},
      weights: [backpack],
      ctx: weakCtx,
    });
    // backpack (5) + 2 plates (65 cada uno) = 135 > 120 max.
    addOk({
      inventory: bag.inventory,
      itemData: plateArmor,
      input: { containerId: bag.addedInstanceId! },
      weights: [backpack, plateArmor],
      ctx: weakCtx,
    });
    const inv = addOk({
      inventory: addOk({
        inventory: bag.inventory,
        itemData: plateArmor,
        input: { containerId: bag.addedInstanceId! },
        weights: [backpack, plateArmor],
        ctx: weakCtx,
      }).inventory,
      itemData: plateArmor,
      input: { containerId: bag.addedInstanceId! },
      weights: [backpack, plateArmor],
      ctx: weakCtx,
    });
    expect(inv.warnings.find((w) => w.code === 'ENCUMBERED')).toBeDefined();
  });

  it('Backpack DENTRO de Bag of Holding: backpack pesa 0, su contenido también', () => {
    // Bag (15 al root, pesa) + Backpack adentro (5, cancelado) + plate dentro del backpack
    // (65, cancelado pq ancestor Bag es weightless). Total = 15.
    const bag = addOk({
      inventory: [],
      itemData: bagOfHolding,
      input: {},
      weights: [bagOfHolding],
      ctx: weakCtx,
    });
    const back = addOk({
      inventory: bag.inventory,
      itemData: backpack,
      input: { containerId: bag.addedInstanceId! },
      weights: [bagOfHolding, backpack],
      ctx: weakCtx,
    });
    const res = addItemToInventory({
      inventory: back.inventory,
      itemData: plateArmor,
      input: { containerId: back.addedInstanceId! },
      weights: [bagOfHolding, backpack, plateArmor],
      ctx: weakCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.find((w) => w.code === 'ENCUMBERED')).toBeUndefined();
  });

  it('Bag of Holding DENTRO de Backpack: bag pesa 15 (no cancelado), pero su contenido SÍ cancela', () => {
    // Backpack (5) + Bag of Holding adentro (15) + plate dentro del Bag (0, cancelado).
    // Total = 20. weakCtx max = 120 → ok.
    const back = addOk({
      inventory: [],
      itemData: backpack,
      input: {},
      weights: [backpack],
      ctx: weakCtx,
    });
    const bag = addOk({
      inventory: back.inventory,
      itemData: bagOfHolding,
      input: { containerId: back.addedInstanceId! },
      weights: [backpack, bagOfHolding],
      ctx: weakCtx,
    });
    const res = addItemToInventory({
      inventory: bag.inventory,
      itemData: plateArmor,
      input: { containerId: bag.addedInstanceId! },
      weights: [backpack, bagOfHolding, plateArmor],
      ctx: weakCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.find((w) => w.code === 'ENCUMBERED')).toBeUndefined();
  });
});

describe('warning CAPACITY_EXCEEDED', () => {
  it('backpack con 35lb dentro (cap 30) emite warning', () => {
    const back = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    // 12 plates de 65lb = 780. Pero el warning se mide por contenido del container.
    // Mejor: 1 plate (65) > 30. Warning.
    const res = addItemToInventory({
      inventory: back.inventory,
      itemData: plateArmor,
      input: { containerId: back.addedInstanceId! },
      weights: [backpack, plateArmor],
      ctx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const w = res.warnings.find((x) => x.code === 'CAPACITY_EXCEEDED');
    expect(w).toBeDefined();
    if (w?.code !== 'CAPACITY_EXCEEDED') return;
    expect(w.containerId).toBe(back.addedInstanceId);
    expect(w.weight).toBe(65);
    expect(w.capacityLb).toBe(30);
  });

  it('Bag of Holding con 600lb adentro (cap 500) emite warning aunque sea weightless', () => {
    const bag = addOk({
      inventory: [],
      itemData: bagOfHolding,
      input: {},
      weights: [bagOfHolding],
    });
    // 10 plates = 650. > 500.
    let inv = bag.inventory;
    for (let i = 0; i < 10; i++) {
      const r = addItemToInventory({
        inventory: inv,
        itemData: plateArmor,
        input: { containerId: bag.addedInstanceId! },
        weights: [bagOfHolding, plateArmor],
        ctx,
      });
      if (!r.ok) throw new Error('add failed');
      inv = r.inventory;
    }
    // El último warning del último add debería incluir CAPACITY_EXCEEDED.
    const final = addItemToInventory({
      inventory: inv,
      itemData: longsword,
      input: { containerId: bag.addedInstanceId! },
      weights: [bagOfHolding, plateArmor, longsword],
      ctx,
    });
    expect(final.ok).toBe(true);
    if (!final.ok) return;
    const w = final.warnings.find((x) => x.code === 'CAPACITY_EXCEEDED');
    expect(w).toBeDefined();
    if (w?.code !== 'CAPACITY_EXCEEDED') return;
    expect(w.capacityLb).toBe(500);
    expect(w.weight).toBeGreaterThan(500);
  });

  it('container sin weight cap (quiver) NO emite CAPACITY_EXCEEDED', () => {
    const quiver: ItemCompendiumLite = {
      slug: 'quiver',
      source: 'PHB',
      name: 'Quiver',
      type: 'G',
      weight: 1,
      containerCapacity: { weightLb: null, weightless: false },
    };
    const q = addOk({ inventory: [], itemData: quiver, input: {}, weights: [quiver] });
    const res = addOk({
      inventory: q.inventory,
      itemData: arrows,
      input: { containerId: q.addedInstanceId!, quantity: 100 },
      weights: [quiver, arrows],
    });
    expect(res.warnings.find((w) => w.code === 'CAPACITY_EXCEEDED')).toBeUndefined();
  });
});

describe('ammo merge — respeta containerId en el match', () => {
  it('arrows en quiver vs arrows en mochila quedan separados', () => {
    const quiver: ItemCompendiumLite = {
      slug: 'quiver',
      source: 'PHB',
      name: 'Quiver',
      type: 'G',
      weight: 1,
      containerCapacity: { weightLb: null, weightless: false },
    };
    const back = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    const q = addOk({
      inventory: back.inventory,
      itemData: quiver,
      input: {},
      weights: [backpack, quiver],
    });

    // Primero arrows en quiver.
    const inv1 = addOk({
      inventory: q.inventory,
      itemData: arrows,
      input: { containerId: q.addedInstanceId!, quantity: 1 },
      weights: [backpack, quiver, arrows],
    });
    // Ahora arrows en backpack.
    const inv2 = addOk({
      inventory: inv1.inventory,
      itemData: arrows,
      input: { containerId: back.addedInstanceId!, quantity: 1 },
      weights: [backpack, quiver, arrows],
    });

    const arrowStacks = inv2.inventory.filter((it) => it.itemSlug === 'arrows-20');
    expect(arrowStacks).toHaveLength(2);
  });

  it('arrows agregados dos veces al mismo container mergea', () => {
    const back = addOk({ inventory: [], itemData: backpack, input: {}, weights: [backpack] });
    const inv1 = addOk({
      inventory: back.inventory,
      itemData: arrows,
      input: { containerId: back.addedInstanceId!, quantity: 1 },
      weights: [backpack, arrows],
    });
    const inv2 = addOk({
      inventory: inv1.inventory,
      itemData: arrows,
      input: { containerId: back.addedInstanceId!, quantity: 3 },
      weights: [backpack, arrows],
    });
    const stacks = inv2.inventory.filter((it) => it.itemSlug === 'arrows-20');
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.quantity).toBe(4);
  });
});

describe('handy haversack — compartimentos sumados', () => {
  it('haversack es weightless con weightLb=120 (suma de 3 compartimentos)', () => {
    const back = addOk({
      inventory: [],
      itemData: handyHaversack,
      input: {},
      weights: [handyHaversack],
      ctx: weakCtx,
    });
    // Plate (65) adentro: cancelado por weightless. Solo el haversack (5) suma.
    const res = addOk({
      inventory: back.inventory,
      itemData: plateArmor,
      input: { containerId: back.addedInstanceId! },
      weights: [handyHaversack, plateArmor],
      ctx: weakCtx,
    });
    expect(res.warnings.find((w) => w.code === 'ENCUMBERED')).toBeUndefined();
  });
});

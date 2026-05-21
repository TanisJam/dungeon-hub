import { describe, expect, it } from 'vitest';
import {
  addItemToInventory,
  removeItemFromInventory,
  updateInventoryItem,
  ATTUNEMENT_MAX,
  collectWarnings,
} from '../../../src/character/inventory/validate.js';
import type {
  InventoryContext,
  InventoryItem,
  ItemCompendiumLite,
} from '../../../src/character/inventory/types.js';
import { evaluateEncumbrance } from '../../../src/character/inventory/encumbrance.js';

const longsword: ItemCompendiumLite = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M',
  weight: 3,
};
const plate: ItemCompendiumLite = {
  slug: 'plate-armor',
  source: 'PHB',
  name: 'Plate Armor',
  type: 'HA',
  weight: 65,
};
const ring: ItemCompendiumLite = {
  slug: 'ring-of-protection',
  source: 'DMG',
  name: 'Ring of Protection',
  type: null,
  weight: null,
};
const torch: ItemCompendiumLite = {
  slug: 'torch',
  source: 'PHB',
  name: 'Torch',
  type: null,
  weight: 1,
};

// Profs replicando shape real de 5etools (singular, sin sufijo "weapons" / "armor").
const martialCtx: InventoryContext = {
  strScore: 14,
  armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
  weaponProficiencies: ['simple', 'martial'],
};

const wizardCtx: InventoryContext = {
  strScore: 8,
  armorProficiencies: [],
  weaponProficiencies: ['daggers', 'darts', 'slings', 'quarterstaffs', 'light crossbows'],
};

describe('addItemToInventory — hard rules', () => {
  it('rechaza attune cuando ya hay 3 ítems attuned', () => {
    const inv: InventoryItem[] = Array.from({ length: ATTUNEMENT_MAX }, (_, i) => ({
      instanceId: `id-${i}`,
      itemSlug: `magic-${i}`,
      itemSource: 'DMG',
      quantity: 1,
      state: 'carried',
      attuned: true,
      customName: null,
      notes: '',
    }));

    const res = addItemToInventory({
      inventory: inv,
      itemData: ring,
      input: { attuned: true },
      weights: [ring],
      ctx: martialCtx,
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ATTUNEMENT_CAP_EXCEEDED');
  });

  it('permite attune cuando hay menos de 3 attuned', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: ring,
      input: { attuned: true },
      weights: [ring],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory).toHaveLength(1);
    expect(res.inventory[0]!.attuned).toBe(true);
  });

  it('rechaza quantity < 1', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: torch,
      input: { quantity: 0 },
      weights: [torch],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('QUANTITY_INVALID');
  });
});

describe('addItemToInventory — warnings', () => {
  it('emite ENCUMBERED cuando weight total supera STR × 15', () => {
    // STR 8 → max 120. Plate (65) + 56 torches (1 each) = 121.
    const inv: InventoryItem[] = [
      {
        instanceId: 'a',
        itemSlug: 'torch',
        itemSource: 'PHB',
        quantity: 56,
        state: 'stowed',
        attuned: false,
        customName: null,
        notes: '',
      },
    ];
    const res = addItemToInventory({
      inventory: inv,
      itemData: plate,
      input: { quantity: 1, state: 'carried' },
      weights: [plate, torch],
      ctx: wizardCtx,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.code === 'ENCUMBERED')).toBe(true);
  });

  it('no emite ENCUMBERED si total ≤ STR × 15', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: longsword,
      input: { quantity: 1, state: 'equipped' },
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.code === 'ENCUMBERED')).toBe(false);
  });

  it('warning de proficiency al equipar armadura pesada sin prof', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: plate,
      input: { state: 'equipped' },
      weights: [plate],
      ctx: wizardCtx,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const w = res.warnings.find((x) => x.code === 'EQUIPPED_WITHOUT_PROFICIENCY');
    expect(w).toBeDefined();
    if (w?.code !== 'EQUIPPED_WITHOUT_PROFICIENCY') return;
    expect(w.kind).toBe('armor');
  });

  it('no emite warning de prof si la armadura no está equipped', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: plate,
      input: { state: 'carried' },
      weights: [plate],
      ctx: wizardCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.code === 'EQUIPPED_WITHOUT_PROFICIENCY')).toBe(false);
  });

  it('no emite warning de prof para un arma con martial weapons cubriendo todo', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: longsword,
      input: { state: 'equipped' },
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.code === 'EQUIPPED_WITHOUT_PROFICIENCY')).toBe(false);
  });

  it('emite warning de prof para arma sin cobertura blanket ni match por nombre', () => {
    const res = addItemToInventory({
      inventory: [],
      itemData: longsword,
      input: { state: 'equipped' },
      weights: [longsword],
      ctx: wizardCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const w = res.warnings.find((x) => x.code === 'EQUIPPED_WITHOUT_PROFICIENCY');
    expect(w).toBeDefined();
    if (w?.code !== 'EQUIPPED_WITHOUT_PROFICIENCY') return;
    expect(w.kind).toBe('weapon');
  });
});

describe('removeItemFromInventory', () => {
  it('quita la instancia y devuelve el inventario nuevo', () => {
    const inv: InventoryItem[] = [
      {
        instanceId: 'x',
        itemSlug: 'longsword',
        itemSource: 'PHB',
        quantity: 1,
        state: 'carried',
        attuned: false,
        customName: null,
        notes: '',
      },
    ];
    const res = removeItemFromInventory({ inventory: inv, instanceId: 'x' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory).toHaveLength(0);
  });

  it('falla con INSTANCE_NOT_FOUND si el id no existe', () => {
    const res = removeItemFromInventory({ inventory: [], instanceId: 'nope' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('INSTANCE_NOT_FOUND');
  });
});

describe('updateInventoryItem', () => {
  const baseItem = (): import('../../../src/character/inventory/types.js').InventoryItem => ({
    instanceId: 'inv-1',
    itemSlug: 'longsword',
    itemSource: 'PHB',
    quantity: 1,
    state: 'carried',
    attuned: false,
    customName: null,
    notes: '',
  });

  it('INSTANCE_NOT_FOUND si el id no existe', () => {
    const res = updateInventoryItem({
      inventory: [baseItem()],
      instanceId: 'nope',
      patch: { state: 'equipped' },
      itemData: longsword,
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('INSTANCE_NOT_FOUND');
  });

  it('aplica patch parcial dejando intactos los campos no provistos', () => {
    const item = baseItem();
    const res = updateInventoryItem({
      inventory: [item],
      instanceId: item.instanceId,
      patch: { quantity: 3 },
      itemData: longsword,
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory[0]?.quantity).toBe(3);
    expect(res.inventory[0]?.state).toBe('carried');
    expect(res.inventory[0]?.notes).toBe('');
  });

  it('QUANTITY_INVALID si la cantidad nueva < 1', () => {
    const item = baseItem();
    const res = updateInventoryItem({
      inventory: [item],
      instanceId: item.instanceId,
      patch: { quantity: 0 },
      itemData: longsword,
      weights: [longsword],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('QUANTITY_INVALID');
  });

  it('attune false → true bloquea si ya hay 3 attuned (excluyendo el propio)', () => {
    const otherAttuned: InventoryItem[] = Array.from({ length: ATTUNEMENT_MAX }, (_, i) => ({
      instanceId: `att-${i}`,
      itemSlug: `magic-${i}`,
      itemSource: 'DMG',
      quantity: 1,
      state: 'carried',
      attuned: true,
      customName: null,
      notes: '',
    }));
    const target = { ...baseItem(), instanceId: 'target', itemSlug: 'ring-of-protection', itemSource: 'DMG' };

    const res = updateInventoryItem({
      inventory: [...otherAttuned, target],
      instanceId: target.instanceId,
      patch: { attuned: true },
      itemData: ring,
      weights: [...otherAttuned.map(() => ring), ring],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ATTUNEMENT_CAP_EXCEEDED');
  });

  it('attune true → false (untune) siempre pasa, no cuenta para el cap', () => {
    const others: InventoryItem[] = Array.from({ length: 2 }, (_, i) => ({
      instanceId: `att-${i}`,
      itemSlug: `magic-${i}`,
      itemSource: 'DMG',
      quantity: 1,
      state: 'carried',
      attuned: true,
      customName: null,
      notes: '',
    }));
    const target: InventoryItem = {
      instanceId: 'target',
      itemSlug: 'ring-of-protection',
      itemSource: 'DMG',
      quantity: 1,
      state: 'carried',
      attuned: true,
      customName: null,
      notes: '',
    };

    const res = updateInventoryItem({
      inventory: [...others, target],
      instanceId: target.instanceId,
      patch: { attuned: false },
      itemData: ring,
      weights: [ring],
      ctx: martialCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inventory.find((it) => it.instanceId === 'target')?.attuned).toBe(false);
  });

  it('pasar a equipped sin prof emite warning con el instanceId correcto', () => {
    const item: InventoryItem = {
      instanceId: 'inv-plate',
      itemSlug: 'plate-armor',
      itemSource: 'PHB',
      quantity: 1,
      state: 'carried',
      attuned: false,
      customName: null,
      notes: '',
    };
    const res = updateInventoryItem({
      inventory: [item],
      instanceId: item.instanceId,
      patch: { state: 'equipped' },
      itemData: plate,
      weights: [plate],
      ctx: wizardCtx,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const w = res.warnings.find((x) => x.code === 'EQUIPPED_WITHOUT_PROFICIENCY');
    expect(w).toBeDefined();
    if (w?.code !== 'EQUIPPED_WITHOUT_PROFICIENCY') return;
    expect(w.instanceId).toBe('inv-plate');
    expect(w.kind).toBe('armor');
  });
});

describe('evaluateEncumbrance (variant rule)', () => {
  it('sin variant: solo el max importa (STR×15)', () => {
    expect(evaluateEncumbrance(50, 10, false).status).toBe('ok');
    expect(evaluateEncumbrance(150, 10, false).status).toBe('ok'); // 10×15=150, OK
    expect(evaluateEncumbrance(151, 10, false).status).toBe('over');
  });

  it('sin variant: speedPenalty siempre 0', () => {
    expect(evaluateEncumbrance(100, 10, false).speedPenalty).toBe(0);
  });

  it('variant: ok hasta STR×5', () => {
    expect(evaluateEncumbrance(50, 10, true).status).toBe('ok');
    expect(evaluateEncumbrance(50, 10, true).speedPenalty).toBe(0);
  });

  it('variant: encumbered entre STR×5 y STR×10 → speed -10', () => {
    const r = evaluateEncumbrance(51, 10, true); // entre 50 y 100
    expect(r.status).toBe('encumbered');
    expect(r.speedPenalty).toBe(10);
  });

  it('variant: heavily-encumbered entre STR×10 y STR×15 → speed -20', () => {
    const r = evaluateEncumbrance(101, 10, true);
    expect(r.status).toBe('heavily-encumbered');
    expect(r.speedPenalty).toBe(20);
  });

  it('variant: over si peso > STR×15', () => {
    const r = evaluateEncumbrance(151, 10, true);
    expect(r.status).toBe('over');
  });

  it('thresholds incluidos en la view', () => {
    const r = evaluateEncumbrance(50, 12, true);
    expect(r.thresholds).toEqual({ encumbered: 60, heavily: 120, max: 180 });
  });
});

describe('collectWarnings (standalone)', () => {
  it('reporta encumbrance sobre el inventario completo sin changed', () => {
    const inv: InventoryItem[] = [
      {
        instanceId: 'a',
        itemSlug: 'plate-armor',
        itemSource: 'PHB',
        quantity: 1,
        state: 'equipped',
        attuned: false,
        customName: null,
        notes: '',
      },
    ];
    const w = collectWarnings(inv, null, null, [plate], { ...wizardCtx, strScore: 4 });
    expect(w.some((x) => x.code === 'ENCUMBERED')).toBe(true);
  });
});

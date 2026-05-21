import { describe, expect, it } from 'vitest';
import { checkEquipSlots } from '../../../src/character/inventory/equip-slots.js';
import type {
  InventoryItem,
  ItemCompendiumLite,
} from '../../../src/character/inventory/types.js';

function mkInv(args: {
  instanceId?: string;
  slug: string;
  source?: string;
  state?: 'equipped' | 'carried' | 'stowed';
  equipHand?: 'main' | 'off' | 'both' | null;
}): InventoryItem {
  return {
    instanceId: args.instanceId ?? args.slug,
    itemSlug: args.slug,
    itemSource: args.source ?? 'PHB',
    quantity: 1,
    state: args.state ?? 'equipped',
    attuned: false,
    customName: null,
    notes: '',
    equipHand: args.equipHand ?? null,
  };
}

const longsword: ItemCompendiumLite = {
  slug: 'longsword', source: 'PHB', name: 'Longsword', type: 'M', weight: 3,
  property: ['V'],
};
const shortsword: ItemCompendiumLite = {
  slug: 'shortsword', source: 'PHB', name: 'Shortsword', type: 'M', weight: 2,
  property: ['L', 'F'],
};
const dagger: ItemCompendiumLite = {
  slug: 'dagger', source: 'PHB', name: 'Dagger', type: 'M', weight: 1,
  property: ['L', 'F', 'T'],
};
const greatsword: ItemCompendiumLite = {
  slug: 'greatsword', source: 'PHB', name: 'Greatsword', type: 'M', weight: 6,
  property: ['2H', 'H'],
};
const plate: ItemCompendiumLite = {
  slug: 'plate-armor', source: 'PHB', name: 'Plate', type: 'HA', weight: 65,
};
const chainmail: ItemCompendiumLite = {
  slug: 'chain-mail', source: 'PHB', name: 'Chain Mail', type: 'HA', weight: 55,
};
const shield: ItemCompendiumLite = {
  slug: 'shield', source: 'PHB', name: 'Shield', type: 'S', weight: 6,
};

const ALL: ItemCompendiumLite[] = [longsword, shortsword, dagger, greatsword, plate, chainmail, shield];
const LOOKUP = new Map(ALL.map((d) => [`${d.slug}|${d.source}`, d]));

describe('checkEquipSlots — body armor', () => {
  it('1 armor equipped → ok', () => {
    const inv = [mkInv({ slug: 'plate-armor' })];
    expect(checkEquipSlots(inv, LOOKUP)).toHaveLength(0);
  });

  it('2 armors equipped → BODY_ARMOR_SLOT_FULL', () => {
    const inv = [
      mkInv({ slug: 'plate-armor' }),
      mkInv({ slug: 'chain-mail', instanceId: 'chain' }),
    ];
    const issues = checkEquipSlots(inv, LOOKUP);
    expect(issues.some((i) => i.code === 'BODY_ARMOR_SLOT_FULL')).toBe(true);
  });
});

describe('checkEquipSlots — shield', () => {
  it('1 shield → ok', () => {
    expect(checkEquipSlots([mkInv({ slug: 'shield' })], LOOKUP)).toHaveLength(0);
  });

  it('shield + 1H weapon (default main) → ok (2 manos usadas)', () => {
    const inv = [
      mkInv({ slug: 'shield' }),
      mkInv({ slug: 'longsword', equipHand: 'main' }),
    ];
    expect(checkEquipSlots(inv, LOOKUP)).toHaveLength(0);
  });

  it('shield + 2H weapon → HANDS_EXCEEDED (3 manos)', () => {
    const inv = [
      mkInv({ slug: 'shield' }),
      mkInv({ slug: 'greatsword', equipHand: 'both' }),
    ];
    const issues = checkEquipSlots(inv, LOOKUP);
    expect(issues.some((i) => i.code === 'HANDS_EXCEEDED')).toBe(true);
  });
});

describe('checkEquipSlots — weapons', () => {
  it('main + off (ambos light) → ok dual-wield', () => {
    const inv = [
      mkInv({ slug: 'shortsword', equipHand: 'main' }),
      mkInv({ slug: 'dagger', equipHand: 'off' }),
    ];
    expect(checkEquipSlots(inv, LOOKUP)).toHaveLength(0);
  });

  it('off-hand con weapon NO light → OFF_HAND_REQUIRES_LIGHT', () => {
    // Longsword no es light. Tratar de equiparlo off-hand falla.
    const inv = [
      mkInv({ slug: 'shortsword', equipHand: 'main' }),
      mkInv({ slug: 'longsword', equipHand: 'off' }),
    ];
    const issues = checkEquipSlots(inv, LOOKUP);
    expect(issues.some((i) => i.code === 'OFF_HAND_REQUIRES_LIGHT')).toBe(true);
  });

  it('two-handed weapon como `main` → TWO_HANDED_REQUIRES_BOTH', () => {
    const inv = [mkInv({ slug: 'greatsword', equipHand: 'main' })];
    const issues = checkEquipSlots(inv, LOOKUP);
    expect(issues.some((i) => i.code === 'TWO_HANDED_REQUIRES_BOTH')).toBe(true);
  });

  it('two-handed weapon como `both` → ok', () => {
    const inv = [mkInv({ slug: 'greatsword', equipHand: 'both' })];
    expect(checkEquipSlots(inv, LOOKUP)).toHaveLength(0);
  });

  it('3 weapons (main + main + off) → HANDS_EXCEEDED', () => {
    const inv = [
      mkInv({ slug: 'longsword', instanceId: 'a', equipHand: 'main' }),
      mkInv({ slug: 'shortsword', instanceId: 'b', equipHand: 'main' }),
      mkInv({ slug: 'dagger', instanceId: 'c', equipHand: 'off' }),
    ];
    const issues = checkEquipSlots(inv, LOOKUP);
    expect(issues.some((i) => i.code === 'HANDS_EXCEEDED')).toBe(true);
  });
});

describe('checkEquipSlots — combinaciones válidas', () => {
  it('armor + shield + 1H weapon → ok (todos los slots usados)', () => {
    const inv = [
      mkInv({ slug: 'plate-armor' }),
      mkInv({ slug: 'shield' }),
      mkInv({ slug: 'longsword', equipHand: 'main' }),
    ];
    expect(checkEquipSlots(inv, LOOKUP)).toHaveLength(0);
  });

  it('armor + 2H weapon → ok', () => {
    const inv = [
      mkInv({ slug: 'plate-armor' }),
      mkInv({ slug: 'greatsword', equipHand: 'both' }),
    ];
    expect(checkEquipSlots(inv, LOOKUP)).toHaveLength(0);
  });

  it('items carried (no equipped) no consumen slots', () => {
    const inv = [
      mkInv({ slug: 'plate-armor' }),
      mkInv({ slug: 'chain-mail', instanceId: 'chain', state: 'carried' }),
      mkInv({ slug: 'greatsword', state: 'stowed', equipHand: null }),
    ];
    expect(checkEquipSlots(inv, LOOKUP)).toHaveLength(0);
  });
});

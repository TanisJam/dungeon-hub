/**
 * Tests for the pure computeArmorClass() helper.
 * Strict TDD — one RED→GREEN cycle per REQ-AC-* in spec inventory-foundation (#843).
 * Every assertion cites the PHB rule it implements.
 */
import { describe, expect, it } from 'vitest';
import { computeArmorClass } from '../../../src/character/sheet/armor-class.js';
import type { InventoryItem, ItemCompendiumLite } from '../../../src/character/inventory/types.js';

/** Helper to build a minimal equipped armor InventoryItem. */
function equipped(slug: string, source = 'PHB'): InventoryItem {
  return {
    instanceId: `i-${slug}`,
    itemSlug: slug,
    itemSource: source,
    quantity: 1,
    state: 'equipped',
    attuned: false,
    customName: null,
    notes: '',
  };
}

/** Helper for an unequipped (carried) item — should NOT contribute to AC. */
function carried(slug: string, source = 'PHB'): InventoryItem {
  return { ...equipped(slug, source), instanceId: `c-${slug}`, state: 'carried' };
}

/** Default abilities, neutral. */
const NEUTRAL = { str: 10, dex: 10, con: 10, wis: 10 };

describe('computeArmorClass — REQ-AC-LIGHT-ARMOR (PHB p.144)', () => {
  // PHB p.144 — Light armor: AC = armor.ac + DEX
  it('leather (AC 11) + DEX 14 → AC 13', () => {
    const itemLites: Record<string, ItemCompendiumLite> = {
      'leather|PHB': {
        slug: 'leather',
        source: 'PHB',
        name: 'Leather',
        type: 'LA',
        weight: 10,
        ac: 11,
      },
    };
    const out = computeArmorClass({
      inventory: [equipped('leather')],
      itemLites,
      classes: [],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    expect(out.ac).toBe(13);
    expect(out.warnings).toEqual([]);
  });
});

describe('computeArmorClass — REQ-AC-MEDIUM-ARMOR (PHB p.144)', () => {
  // PHB p.144 — Medium armor: AC = armor.ac + min(DEX, 2)
  const chainShirt: Record<string, ItemCompendiumLite> = {
    'chain-shirt|PHB': {
      slug: 'chain-shirt',
      source: 'PHB',
      name: 'Chain Shirt',
      type: 'MA',
      weight: 20,
      ac: 13,
    },
  };

  it('chain shirt (AC 13) + DEX 16 → AC 15 (DEX cap +2)', () => {
    const out = computeArmorClass({
      inventory: [equipped('chain-shirt')],
      itemLites: chainShirt,
      classes: [],
      abilities: { ...NEUTRAL, dex: 16 },
    });
    expect(out.ac).toBe(15);
  });

  it('chain shirt (AC 13) + DEX 12 → AC 14 (cap not reached, DEX +1 applies)', () => {
    const out = computeArmorClass({
      inventory: [equipped('chain-shirt')],
      itemLites: chainShirt,
      classes: [],
      abilities: { ...NEUTRAL, dex: 12 },
    });
    expect(out.ac).toBe(14);
  });

  it('chain shirt (AC 13) + DEX 8 → AC 12 (negative DEX still applies)', () => {
    const out = computeArmorClass({
      inventory: [equipped('chain-shirt')],
      itemLites: chainShirt,
      classes: [],
      abilities: { ...NEUTRAL, dex: 8 },
    });
    expect(out.ac).toBe(12);
  });
});

describe('computeArmorClass — REQ-AC-HEAVY-ARMOR (PHB p.144)', () => {
  // PHB p.144 — Heavy armor: AC = armor.ac, DEX ignored
  it('plate (AC 18) + DEX 20 → AC 18 (DEX ignored)', () => {
    const itemLites: Record<string, ItemCompendiumLite> = {
      'plate|PHB': {
        slug: 'plate',
        source: 'PHB',
        name: 'Plate',
        type: 'HA',
        weight: 65,
        ac: 18,
        armorStrengthMin: 15,
      },
    };
    const out = computeArmorClass({
      inventory: [equipped('plate')],
      itemLites,
      classes: [],
      abilities: { ...NEUTRAL, str: 15, dex: 20 },
    });
    expect(out.ac).toBe(18);
    expect(out.warnings).toEqual([]);
  });
});

describe('computeArmorClass — REQ-AC-SHIELD (PHB p.149)', () => {
  // PHB p.149 — Shield: +2 AC, stackable with any armor or unarmored branch.
  const itemLites: Record<string, ItemCompendiumLite> = {
    'chain-shirt|PHB': {
      slug: 'chain-shirt',
      source: 'PHB',
      name: 'Chain Shirt',
      type: 'MA',
      weight: 20,
      ac: 13,
    },
    'shield|PHB': {
      slug: 'shield',
      source: 'PHB',
      name: 'Shield',
      type: 'S',
      weight: 6,
      ac: 2,
    },
  };

  it('chain shirt + DEX 16 + shield → AC 17 (15 + 2)', () => {
    const out = computeArmorClass({
      inventory: [equipped('chain-shirt'), equipped('shield')],
      itemLites,
      classes: [],
      abilities: { ...NEUTRAL, dex: 16 },
    });
    expect(out.ac).toBe(17);
  });

  it('no armor + shield + DEX 14 → AC 14 (10 + 2 DEX + 2 shield)', () => {
    const out = computeArmorClass({
      inventory: [equipped('shield')],
      itemLites,
      classes: [],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    expect(out.ac).toBe(14);
  });

  it('two shields equipped → only one +2 stacks (defensive)', () => {
    const out = computeArmorClass({
      inventory: [
        { ...equipped('shield'), instanceId: 's1' },
        { ...equipped('shield'), instanceId: 's2' },
      ],
      itemLites,
      classes: [],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    // 10 + DEX(+2) + 2 shield = 14 — second shield ignored.
    expect(out.ac).toBe(14);
  });
});

describe('computeArmorClass — REQ-AC-UNARMORED (PHB p.48 Barbarian, p.78 Monk)', () => {
  const shield: Record<string, ItemCompendiumLite> = {
    'shield|PHB': {
      slug: 'shield',
      source: 'PHB',
      name: 'Shield',
      type: 'S',
      weight: 6,
      ac: 2,
    },
  };

  it('default: 10 + DEX(2) → AC 12', () => {
    const out = computeArmorClass({
      inventory: [],
      itemLites: {},
      classes: [{ classSlug: 'wizard', level: 1 }],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    expect(out.ac).toBe(12);
  });

  // PHB p.48 — Barbarian Unarmored Defense: AC = 10 + DEX + CON (no armor)
  it('Barbarian DEX 14 CON 16 → AC 15 (10 + 2 + 3)', () => {
    const out = computeArmorClass({
      inventory: [],
      itemLites: {},
      classes: [{ classSlug: 'barbarian', level: 1 }],
      abilities: { str: 15, dex: 14, con: 16, wis: 10 },
    });
    expect(out.ac).toBe(15);
    expect(out.formula).toContain('Barbarian');
  });

  // PHB p.78 — Monk Unarmored Defense: AC = 10 + DEX + WIS (no armor AND no shield)
  it('Monk DEX 16 WIS 14 → AC 15 (10 + 3 + 2)', () => {
    const out = computeArmorClass({
      inventory: [],
      itemLites: {},
      classes: [{ classSlug: 'monk', level: 1 }],
      abilities: { str: 10, dex: 16, con: 10, wis: 14 },
    });
    expect(out.ac).toBe(15);
    expect(out.formula).toContain('Monk');
  });

  it('Monk DEX 16 WIS 14 + shield → AC 15 (default 10+DEX + shield, NOT Monk UD)', () => {
    // PHB p.78 — Monk Unarmored Defense is gated on "no armor AND no shield".
    // With a shield equipped we fall back to default (10 + DEX) plus the shield bonus.
    // Math: 10 + DEX(+3) + 2 shield = 15. (Spec text shows ac === 14, but that quotes
    // DEX 14 math; with DEX 16 the rule-correct value is 15 — spec arithmetic mismatch
    // captured as an engram discovery.)
    const out = computeArmorClass({
      inventory: [equipped('shield')],
      itemLites: shield,
      classes: [{ classSlug: 'monk', level: 1 }],
      abilities: { str: 10, dex: 16, con: 10, wis: 14 },
    });
    expect(out.ac).toBe(15);
    expect(out.formula).not.toContain('Monk');
  });
});

describe('computeArmorClass — REQ-AC-STR-WARNING (PHB p.144)', () => {
  // PHB p.144 — heavy armor STR-min: penalty is "speed −10" not blocked AC.
  // We emit a non-blocking warning; AC is still computed normally.
  it('STR 8 + plate (strengthMin 15) → AC 18 + INSUFFICIENT_STRENGTH_FOR_ARMOR warning', () => {
    const itemLites: Record<string, ItemCompendiumLite> = {
      'plate|PHB': {
        slug: 'plate',
        source: 'PHB',
        name: 'Plate',
        type: 'HA',
        weight: 65,
        ac: 18,
        armorStrengthMin: 15,
      },
    };
    const out = computeArmorClass({
      inventory: [equipped('plate')],
      itemLites,
      classes: [],
      abilities: { str: 8, dex: 14, con: 10, wis: 10 },
    });
    expect(out.ac).toBe(18);
    expect(out.warnings).toContain('INSUFFICIENT_STRENGTH_FOR_ARMOR');
  });

  it('STR 15 + plate (strengthMin 15) → no warning (boundary, requirement met)', () => {
    const itemLites: Record<string, ItemCompendiumLite> = {
      'plate|PHB': {
        slug: 'plate',
        source: 'PHB',
        name: 'Plate',
        type: 'HA',
        weight: 65,
        ac: 18,
        armorStrengthMin: 15,
      },
    };
    const out = computeArmorClass({
      inventory: [equipped('plate')],
      itemLites,
      classes: [],
      abilities: { str: 15, dex: 10, con: 10, wis: 10 },
    });
    expect(out.warnings).toEqual([]);
  });
});

describe('computeArmorClass — REQ-AC-LEGACY-TOLERANCE (CLAUDE.md §11)', () => {
  // Read-path tolerance: legacy rows / missing armor fields MUST NOT throw.
  it('empty inventory + DEX 14 → unarmored 12 (no throw)', () => {
    const out = computeArmorClass({
      inventory: [],
      itemLites: {},
      classes: [],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    expect(out.ac).toBe(12);
    expect(out.warnings).toEqual([]);
  });

  it('equipped armor lite missing `ac` field → falls back to unarmored', () => {
    const itemLites: Record<string, ItemCompendiumLite> = {
      'mystery-armor|PHB': {
        slug: 'mystery-armor',
        source: 'PHB',
        name: 'Mystery Armor',
        type: 'MA',
        weight: 10,
        // ac intentionally absent (legacy projection or 5etools gap)
      },
    };
    const out = computeArmorClass({
      inventory: [equipped('mystery-armor')],
      itemLites,
      classes: [],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    expect(out.ac).toBe(12);
    expect(out.warnings).toEqual([]);
  });

  it('equipped armor lite not in itemLites map → unarmored, no throw', () => {
    const out = computeArmorClass({
      inventory: [equipped('ghost-armor')],
      itemLites: {}, // lookup miss
      classes: [],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    expect(out.ac).toBe(12);
  });

  it('only carried (not equipped) armor → unarmored', () => {
    const itemLites: Record<string, ItemCompendiumLite> = {
      'leather|PHB': {
        slug: 'leather',
        source: 'PHB',
        name: 'Leather',
        type: 'LA',
        weight: 10,
        ac: 11,
      },
    };
    const out = computeArmorClass({
      inventory: [carried('leather')],
      itemLites,
      classes: [],
      abilities: { ...NEUTRAL, dex: 14 },
    });
    expect(out.ac).toBe(12); // carried doesn't count
  });
});

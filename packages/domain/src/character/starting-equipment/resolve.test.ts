/**
 * Tests for resolveStartingGrant()
 *
 * Strict TDD — tests written BEFORE production code.
 *
 * REQ-SEQUIP-03: package path grants fixed + selected items + background items.
 * REQ-SEQUIP-03: gold path grants ZERO class package items; deposits goldValue gp to currency.cp.
 * REQ-SEQUIP-06: non-negative gold guard — negative goldValue returns a VALIDATION issue.
 *
 * PHB citations embedded in each test.
 */

import { describe, expect, it } from 'vitest';
import type { ParsedBackgroundEquipment, ParsedClassEquipment } from './parse.js';
import { resolveStartingGrant } from './resolve.js';
import type { EquipmentSelections } from './shape.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Minimal Fighter parsed model based on real 5etools data (PHB p.70):
 *
 * choiceRows:
 *   row 0: a=[chain-mail], b=[leather-armor, longbow, arrows-20]
 *   row 1: a=[weaponMartial, shield],  b=[weaponMartial×2]
 *   row 2: a=[light-crossbow, crossbow-bolts-20], b=[handaxe×2]
 *   row 3: a=[dungeoneers-pack], b=[explorers-pack]
 * fixedItems: []
 * goldAlternative: { dice: "5d4 × 10" }
 */
const fighterParsed: ParsedClassEquipment = {
  fixedItems: [],
  choiceRows: [
    {
      options: [
        { slot: 'a', refs: [{ slug: 'chain-mail', source: 'PHB', quantity: 1 }] },
        {
          slot: 'b',
          refs: [
            { slug: 'leather-armor', source: 'PHB', quantity: 1 },
            { slug: 'longbow', source: 'PHB', quantity: 1 },
            { slug: 'arrows-20', source: 'PHB', quantity: 1 },
          ],
        },
      ],
    },
    {
      options: [
        {
          slot: 'a',
          refs: [
            { equipmentType: 'weaponMartial', quantity: 1 },
            { slug: 'shield', source: 'PHB', quantity: 1 },
          ],
        },
        { slot: 'b', refs: [{ equipmentType: 'weaponMartial', quantity: 2 }] },
      ],
    },
    {
      options: [
        {
          slot: 'a',
          refs: [
            { slug: 'light-crossbow', source: 'PHB', quantity: 1 },
            { slug: 'crossbow-bolts-20', source: 'PHB', quantity: 1 },
          ],
        },
        { slot: 'b', refs: [{ slug: 'handaxe', source: 'PHB', quantity: 2 }] },
      ],
    },
    {
      options: [
        { slot: 'a', refs: [{ slug: 'dungeoneers-pack', source: 'PHB', quantity: 1 }] },
        { slot: 'b', refs: [{ slug: 'explorers-pack', source: 'PHB', quantity: 1 }] },
      ],
    },
  ],
  goldAlternative: { dice: '5d4 × 10' },
};

/**
 * Minimal Acolyte background parsed model (PHB p.127).
 * fixedItems: holy-symbol (with displayName), common-clothes, pouch
 * currency: 1500 (cp — 15 gp)
 * specialItems: ["sticks of incense", "vestments"]
 * choiceRows: row 0: a=[book], b=[{ special: "prayer wheel" }]
 */
const acolyteParsed: ParsedBackgroundEquipment = {
  fixedItems: [
    {
      slug: 'holy-symbol',
      source: 'PHB',
      quantity: 1,
      displayName: 'holy symbol (a gift to you when you entered the priesthood)',
    },
    { slug: 'common-clothes', source: 'PHB', quantity: 1 },
    { slug: 'pouch', source: 'PHB', quantity: 1 },
  ],
  choiceRows: [
    {
      options: [
        { slot: 'a', refs: [{ slug: 'book', source: 'PHB', quantity: 1, displayName: 'prayer book' }] },
        { slot: 'b', refs: [{ special: 'prayer wheel' }] },
      ],
    },
  ],
  currency: 1500,
  specialItems: ['sticks of incense', 'vestments'],
};

/**
 * Wizard parsed model (PHB p.112):
 * fixedItems: [spellbook]
 * choiceRows: row0=a/b, row1=a/b (focusSpellcastingArcane), row2=a/b
 * goldAlternative: { dice: "4d4 × 10" }
 */
const wizardParsed: ParsedClassEquipment = {
  fixedItems: [{ slug: 'spellbook', source: 'PHB', quantity: 1 }],
  choiceRows: [
    {
      options: [
        { slot: 'a', refs: [{ slug: 'quarterstaff', source: 'PHB', quantity: 1 }] },
        { slot: 'b', refs: [{ slug: 'dagger', source: 'PHB', quantity: 1 }] },
      ],
    },
    {
      options: [
        { slot: 'a', refs: [{ slug: 'component-pouch', source: 'PHB', quantity: 1 }] },
        { slot: 'b', refs: [{ equipmentType: 'focusSpellcastingArcane', quantity: 1 }] },
      ],
    },
    {
      options: [
        { slot: 'a', refs: [{ slug: "scholars-pack", source: 'PHB', quantity: 1 }] },
        { slot: 'b', refs: [{ slug: 'explorers-pack', source: 'PHB', quantity: 1 }] },
      ],
    },
  ],
  goldAlternative: { dice: '4d4 × 10' },
};

const emptyBackground: ParsedBackgroundEquipment = {
  fixedItems: [],
  choiceRows: [],
  currency: 0,
  specialItems: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveStartingGrant — package path', () => {
  it('grants chain-mail when Fighter row 0 selects option-a (PHB p.70)', () => {
    // REQ-SEQUIP-03 scenario: Fighter picks chain-mail package
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slugs = result.items.map(i => i.slug);
    expect(slugs).toContain('chain-mail');
    expect(slugs).not.toContain('leather-armor');
  });

  it('grants shield from Fighter row 1 option-a (non-category ref, PHB p.70)', () => {
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map(i => i.slug)).toContain('shield');
  });

  it('resolves category pick for Fighter row 1 option-a (longsword from weaponMartial)', () => {
    // The category pick for row 1 option-a slot 0 is longsword
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map(i => i.slug)).toContain('longsword');
  });

  it('grants handaxe×2 when Fighter row 2 selects option-b (PHB p.70)', () => {
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const handaxe = result.items.find(i => i.slug === 'handaxe');
    expect(handaxe).toBeDefined();
    expect(handaxe!.quantity).toBe(2);
  });

  it('grants background fixedItems on package path (PHB p.125 — backgrounds always granted)', () => {
    // REQ-SEQUIP-03: background items are always granted on the package path
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, acolyteParsed, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slugs = result.items.map(i => i.slug);
    expect(slugs).toContain('holy-symbol');
    expect(slugs).toContain('common-clothes');
    expect(slugs).toContain('pouch');
  });

  it('includes background containsValue currency on package path (Acolyte 1500 cp, PHB p.127)', () => {
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, acolyteParsed, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.currency.cp).toBe(1500);
  });

  it('skips specialItems on package path (vestments has no slug — ADR-7)', () => {
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, acolyteParsed, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map(i => i.slug)).not.toContain('vestments');
  });

  it('grants Wizard fixed spellbook on package path (PHB p.112)', () => {
    // Class fixedItems (_-slot) always included on package path
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'a' },
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(wizardParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map(i => i.slug)).toContain('spellbook');
  });
});

describe('resolveStartingGrant — gold path', () => {
  it('grants ZERO class items on gold path (PHB p.143 "Starting Wealth by Class")', () => {
    // REQ-SEQUIP-03: gold path → no package items
    const selections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: 80,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(wizardParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No class items — not even the fixed spellbook
    expect(result.items).toHaveLength(0);
  });

  it('deposits goldValue × 100 cp to currency on gold path (80 gp = 8000 cp)', () => {
    // REQ-SEQUIP-03 gold scenario: Wizard rolls 80 gp → 8000 cp
    // 1 gp = 100 cp (PHB p.143)
    const selections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: 80,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(wizardParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.currency.cp).toBe(8000);
  });

  it('still grants background fixedItems on gold path (PHB p.127 + p.143)', () => {
    // Background items are ALWAYS granted regardless of class path choice
    const selections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: 80,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(wizardParsed, acolyteParsed, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slugs = result.items.map(i => i.slug);
    expect(slugs).toContain('holy-symbol');
    expect(slugs).toContain('common-clothes');
    expect(slugs).toContain('pouch');
  });

  it('adds background containsValue cp to gold gp on gold path', () => {
    // Both 8000 cp (from 80 gp) and 1500 cp (Acolyte pouch) should be present
    const selections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: 80,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(wizardParsed, acolyteParsed, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // cp = 8000 (from 80 gp) + 1500 (background pouch)
    expect(result.currency.cp).toBe(9500);
  });

  it('returns validation issue for negative goldValue (REQ-SEQUIP-06)', () => {
    const selections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: -5,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(wizardParsed, emptyBackground, selections);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GOLD_VALUE_NEGATIVE' }),
    );
  });

  it('accepts goldValue === 0 (player may deliberately take no gold, REQ-SEQUIP-06)', () => {
    const selections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: 0,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(wizardParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
  });
});

describe('resolveStartingGrant — category refs', () => {
  it('resolves a category pick from classCategoryPicks map', () => {
    // Fighter row 1 option-b has { equipmentType: "weaponMartial", quantity: 2 }
    // The player picked longsword×2 for it
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'b', 2: 'b', 3: 'a' },
      classCategoryPicks: { 'row1-b-cat0': { slug: 'longsword', source: 'PHB' } },
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const longsword = result.items.find(i => i.slug === 'longsword');
    expect(longsword).toBeDefined();
    // quantity comes from the categoryRef (quantity: 2)
    expect(longsword!.quantity).toBe(2);
  });

  it('skips a category ref that has no pick in classCategoryPicks (graceful)', () => {
    // If no pick is stored for a category ref, skip it without erroring
    const selections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a', 1: 'a', 2: 'a', 3: 'a' },
      classCategoryPicks: {}, // no pick for the weaponMartial category ref
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    const result = resolveStartingGrant(fighterParsed, emptyBackground, selections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No longsword or other weapon for the category slot — that's fine
    const weaponFromCat = result.items.find(i => i.slug === 'longsword');
    expect(weaponFromCat).toBeUndefined();
  });
});

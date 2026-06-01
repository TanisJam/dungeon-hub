/**
 * Tests for parseClassStartingEquipment() and parseBackgroundStartingEquipment()
 *
 * Strict TDD — tests written BEFORE production code.
 *
 * PHB citations embedded in each test as required by CLAUDE.md §5.
 *
 * Key data shape facts (verified against 5etools data in Batch 0):
 * - goldAlternative format: "{@dice 5d4 × 10|5d4 × 10|Starting Gold}"
 *   (pipe-delimited; first segment is the dice expr with "×" multiplier)
 * - Wizard row 4: { _: ["spellbook|phb"] }  — fixed-only row (no a/b)
 * - Acolyte containsValue: 1500 (copper pieces = 15 gp, PHB p.127)
 * - special items (vestments, prayer wheel, incense): no slug — display only (ADR-7)
 */

import { describe, expect, it } from 'vitest';
import type {
  BackgroundStartingEquipment,
  ClassStartingEquipment,
} from './shape.js';

// Imported after RED → will fail at module resolution until parse.ts exists
import {
  parseBackgroundStartingEquipment,
  parseClassStartingEquipment,
} from './parse.js';

// ─── parseClassStartingEquipment ─────────────────────────────────────────────

describe('parseClassStartingEquipment', () => {
  /**
   * Fighter defaultData (PHB p.70, verified from 5etools class-fighter.json).
   * 4 choice rows + goldAlternative: "{@dice 5d4 × 10|5d4 × 10|Starting Gold}"
   */
  const fighterDefaultData: ClassStartingEquipment = {
    additionalFromBackground: true,
    goldAlternative: '{@dice 5d4 × 10|5d4 × 10|Starting Gold}',
    defaultData: [
      // Row 0: (a) chain mail  or  (b) leather armor + longbow + arrows (20)
      {
        a: ['chain mail|phb'],
        b: ['leather armor|phb', 'longbow|phb', 'arrows (20)|phb'],
      },
      // Row 1: (a) martial weapon + shield  or  (b) two martial weapons
      {
        a: [{ equipmentType: 'weaponMartial' }, 'shield|phb'],
        b: [{ equipmentType: 'weaponMartial', quantity: 2 }],
      },
      // Row 2: (a) light crossbow + 20 bolts  or  (b) two handaxes
      {
        a: ['light crossbow|phb', 'crossbow bolts (20)|phb'],
        b: [{ item: 'handaxe|phb', quantity: 2 }],
      },
      // Row 3: (a) dungeoneer's pack  or  (b) explorer's pack
      {
        a: ["dungeoneer's pack|phb"],
        b: ["explorer's pack|phb"],
      },
    ],
  };

  it('returns 4 choiceRows for Fighter (PHB p.70)', () => {
    const result = parseClassStartingEquipment(fighterDefaultData);
    expect(result.choiceRows).toHaveLength(4);
  });

  it('parses goldAlternative dice expr from {@dice …} wrapper (PHB p.143)', () => {
    // Fighter goldAlternative = "{@dice 5d4 × 10|5d4 × 10|Starting Gold}"
    // Parser must strip the wrapper and extract the canonical dice expr "5d4 × 10"
    const result = parseClassStartingEquipment(fighterDefaultData);
    expect(result.goldAlternative).toEqual({ dice: '5d4 × 10' });
  });

  it('parses chain-mail from Fighter row 0 option-a (PHB p.70)', () => {
    const result = parseClassStartingEquipment(fighterDefaultData);
    const rowZero = result.choiceRows[0]!;
    const optionA = rowZero.options.find(o => o.slot === 'a');
    expect(optionA).toBeDefined();
    // chain mail|phb → slug "chain-mail", source "PHB"
    expect(optionA!.refs).toContainEqual({ slug: 'chain-mail', source: 'PHB', quantity: 1 });
  });

  it('parses leather-armor (not "leather") from Fighter row 0 option-b (PHB p.70)', () => {
    // CRITICAL: slug must be "leather-armor", not "leather"
    const result = parseClassStartingEquipment(fighterDefaultData);
    const optionB = result.choiceRows[0]!.options.find(o => o.slot === 'b');
    expect(optionB!.refs).toContainEqual({ slug: 'leather-armor', source: 'PHB', quantity: 1 });
  });

  it('parses arrows-20 from Fighter row 0 option-b — quantity-in-name gotcha', () => {
    // "arrows (20)|phb" → slug "arrows-20" (not "arrows-20-" or "arrows")
    const result = parseClassStartingEquipment(fighterDefaultData);
    const optionB = result.choiceRows[0]!.options.find(o => o.slot === 'b');
    expect(optionB!.refs).toContainEqual({ slug: 'arrows-20', source: 'PHB', quantity: 1 });
  });

  it('parses equipmentType ref in Fighter row 1 option-a (PHB p.70)', () => {
    // Row 1 option-a: [{ equipmentType: 'weaponMartial' }, 'shield|phb']
    const result = parseClassStartingEquipment(fighterDefaultData);
    const optionA = result.choiceRows[1]!.options.find(o => o.slot === 'a');
    expect(optionA!.refs).toContainEqual({ equipmentType: 'weaponMartial', quantity: 1 });
    expect(optionA!.refs).toContainEqual({ slug: 'shield', source: 'PHB', quantity: 1 });
  });

  it('parses equipmentType with quantity in Fighter row 1 option-b (PHB p.70)', () => {
    // Row 1 option-b: [{ equipmentType: 'weaponMartial', quantity: 2 }]
    const result = parseClassStartingEquipment(fighterDefaultData);
    const optionB = result.choiceRows[1]!.options.find(o => o.slot === 'b');
    expect(optionB!.refs).toContainEqual({ equipmentType: 'weaponMartial', quantity: 2 });
  });

  it('parses item+quantity ref: handaxe quantity 2 in Fighter row 2 option-b (PHB p.70)', () => {
    // { item: 'handaxe|phb', quantity: 2 } → slug "handaxe", source "PHB", quantity 2
    const result = parseClassStartingEquipment(fighterDefaultData);
    const optionB = result.choiceRows[2]!.options.find(o => o.slot === 'b');
    expect(optionB!.refs).toContainEqual({ slug: 'handaxe', source: 'PHB', quantity: 2 });
  });

  it('parses dungeoneers-pack apostrophe slug in Fighter row 3 option-a', () => {
    // "dungeoneer's pack|phb" → slug "dungeoneers-pack"
    const result = parseClassStartingEquipment(fighterDefaultData);
    const optionA = result.choiceRows[3]!.options.find(o => o.slot === 'a');
    expect(optionA!.refs).toContainEqual({ slug: 'dungeoneers-pack', source: 'PHB', quantity: 1 });
  });

  it('parses explorers-pack in Fighter row 3 option-b', () => {
    const result = parseClassStartingEquipment(fighterDefaultData);
    const optionB = result.choiceRows[3]!.options.find(o => o.slot === 'b');
    expect(optionB!.refs).toContainEqual({ slug: 'explorers-pack', source: 'PHB', quantity: 1 });
  });

  it('has empty fixedItems for Fighter (no _ slots in any choice row)', () => {
    const result = parseClassStartingEquipment(fighterDefaultData);
    expect(result.fixedItems).toHaveLength(0);
  });

  /**
   * Wizard defaultData (PHB p.112) — row 4 is a fixed-only row with _ slot.
   * goldAlternative: "{@dice 4d4 × 10|4d4 × 10|Starting Gold}"
   */
  const wizardDefaultData: ClassStartingEquipment = {
    additionalFromBackground: true,
    goldAlternative: '{@dice 4d4 × 10|4d4 × 10|Starting Gold}',
    defaultData: [
      { a: ['quarterstaff|phb'], b: ['dagger|phb'] },
      { a: ['component pouch|phb'], b: [{ equipmentType: 'focusSpellcastingArcane' }] },
      { a: ["scholar's pack|phb"], b: ["explorer's pack|phb"] },
      // Fixed-only row — _ slot, no a/b choice
      { _: ['spellbook|phb'] },
    ],
  };

  it('places spellbook into fixedItems from Wizard _ slot (PHB p.112)', () => {
    // Row 4 has only a _ slot → items go to fixedItems, not choiceRows
    const result = parseClassStartingEquipment(wizardDefaultData);
    expect(result.fixedItems).toContainEqual({ slug: 'spellbook', source: 'PHB', quantity: 1 });
  });

  it('does NOT create a choiceRow for a purely-fixed _ row (Wizard row 4)', () => {
    // A row with only _ and no a/b/c should not appear in choiceRows
    const result = parseClassStartingEquipment(wizardDefaultData);
    // Only 3 choice rows (rows 0,1,2 have a/b); row 3 is fixed-only
    expect(result.choiceRows).toHaveLength(3);
  });

  it('parses Wizard goldAlternative as "4d4 × 10" (PHB p.143)', () => {
    const result = parseClassStartingEquipment(wizardDefaultData);
    expect(result.goldAlternative).toEqual({ dice: '4d4 × 10' });
  });

  it('parses focusSpellcastingArcane category ref from Wizard row 1 option-b (PHB p.151)', () => {
    const result = parseClassStartingEquipment(wizardDefaultData);
    const optionB = result.choiceRows[1]!.options.find(o => o.slot === 'b');
    expect(optionB!.refs).toContainEqual({ equipmentType: 'focusSpellcastingArcane', quantity: 1 });
  });

  /**
   * Cleric defaultData (PHB p.57) — row 2 has a/b/c (ternary choice).
   */
  const clericDefaultData: ClassStartingEquipment = {
    additionalFromBackground: true,
    goldAlternative: '{@dice 5d4 × 10|5d4 × 10|Starting Gold}',
    defaultData: [
      { a: ['mace|phb'], b: ['warhammer|phb'] },
      // Ternary row: scale mail / leather armor / chain mail
      { a: ['scale mail|phb'], b: ['leather armor|phb'], c: ['chain mail|phb'] },
      { a: ['light crossbow|phb', 'crossbow bolts (20)|phb'], b: [{ equipmentType: 'weaponSimple' }] },
      { a: ["priest's pack|phb"], b: ["explorer's pack|phb"] },
      // Fixed row with both _ items and no choice
      { _: ['shield|phb', { equipmentType: 'focusSpellcastingHoly' }] },
    ],
  };

  it('parses Cleric row 1 (ternary) with options a/b/c (PHB p.57)', () => {
    const result = parseClassStartingEquipment(clericDefaultData);
    const row = result.choiceRows[1]!; // 0-indexed, row 1 is the ternary
    expect(row.options).toHaveLength(3);
    const slotKeys = row.options.map(o => o.slot);
    expect(slotKeys).toContain('a');
    expect(slotKeys).toContain('b');
    expect(slotKeys).toContain('c');
  });

  it('parses leather-armor (not leather) from Cleric row 1 option-b (PHB p.57)', () => {
    const result = parseClassStartingEquipment(clericDefaultData);
    const optionB = result.choiceRows[1]!.options.find(o => o.slot === 'b');
    expect(optionB!.refs).toContainEqual({ slug: 'leather-armor', source: 'PHB', quantity: 1 });
  });

  it('places Cleric _ fixed items (shield + holy focus) into fixedItems', () => {
    // Row 5 (0-indexed row 4) has only _ slot: shield and focusSpellcastingHoly
    const result = parseClassStartingEquipment(clericDefaultData);
    expect(result.fixedItems).toContainEqual({ slug: 'shield', source: 'PHB', quantity: 1 });
    expect(result.fixedItems).toContainEqual({ equipmentType: 'focusSpellcastingHoly', quantity: 1 });
  });

  it('ignores uppercase slot keys (XPHB exclusion)', () => {
    // XPHB rows use uppercase A/B — these MUST be ignored (REQ-SEQUIP-01)
    const dataWithXphbSlots: ClassStartingEquipment = {
      defaultData: [
        {
          a: ['shortsword|phb'],
          // @ts-expect-error — intentionally injecting uppercase key to test parser
          A: ['longsword|xphb'],
          B: ['greatsword|xphb'],
        },
      ],
    };
    const result = parseClassStartingEquipment(dataWithXphbSlots);
    const row = result.choiceRows[0]!;
    // Only option 'a' should be present; A/B should be ignored
    expect(row.options).toHaveLength(1);
    expect(row.options[0]!.slot).toBe('a');
  });

  it('returns null goldAlternative when absent', () => {
    const data: ClassStartingEquipment = {
      defaultData: [{ a: ['shortsword|phb'] }],
    };
    const result = parseClassStartingEquipment(data);
    expect(result.goldAlternative).toBeNull();
  });
});

// ─── parseBackgroundStartingEquipment ────────────────────────────────────────

describe('parseBackgroundStartingEquipment', () => {
  /**
   * Acolyte background starting equipment (PHB p.127, verified from 5etools backgrounds.json).
   *
   * [
   *   { _: [
   *       { item: "holy symbol|phb", displayName: "holy symbol (a gift...)" },
   *       { special: "sticks of incense", quantity: 5 },
   *       { special: "vestments" },
   *       "common clothes|phb",
   *       { item: "pouch|phb", containsValue: 1500 }
   *   ]},
   *   { a: [{ item: "book|phb", displayName: "prayer book" }],
   *     b: [{ special: "prayer wheel" }] }
   * ]
   */
  const acolyteEquipment: BackgroundStartingEquipment = [
    {
      _: [
        { item: 'holy symbol|phb', displayName: 'holy symbol (a gift to you when you entered the priesthood)' },
        { special: 'sticks of incense', quantity: 5 },
        { special: 'vestments' },
        'common clothes|phb',
        { item: 'pouch|phb', containsValue: 1500 },
      ],
    },
    {
      a: [{ item: 'book|phb', displayName: 'prayer book' }],
      b: [{ special: 'prayer wheel' }],
    },
  ];

  it('parses holy-symbol into fixedItems from Acolyte _ slot (PHB p.127)', () => {
    const result = parseBackgroundStartingEquipment(acolyteEquipment);
    expect(result.fixedItems).toContainEqual(
      expect.objectContaining({ slug: 'holy-symbol', source: 'PHB' }),
    );
  });

  it('parses common-clothes into fixedItems (PHB p.127)', () => {
    const result = parseBackgroundStartingEquipment(acolyteEquipment);
    expect(result.fixedItems).toContainEqual({ slug: 'common-clothes', source: 'PHB', quantity: 1 });
  });

  it('routes containsValue=1500 to currency.cp, not fixedItems (PHB p.127)', () => {
    // { item: "pouch|phb", containsValue: 1500 } → 1500 cp, pouch item still granted
    const result = parseBackgroundStartingEquipment(acolyteEquipment);
    expect(result.currency).toBe(1500);
    // The pouch itself should also be in fixedItems
    expect(result.fixedItems).toContainEqual({ slug: 'pouch', source: 'PHB', quantity: 1 });
  });

  it('uses item ref for slug, not displayName — "holy symbol" gotcha (ADR-7, PHB p.127)', () => {
    // { item: "holy symbol|phb", displayName: "a gift..." } → slug from item ref
    const result = parseBackgroundStartingEquipment(acolyteEquipment);
    const holySymbol = result.fixedItems.find(f => 'slug' in f && f.slug === 'holy-symbol');
    expect(holySymbol).toBeDefined();
    // displayName is retained for rendering
    expect((holySymbol as { displayName?: string }).displayName).toContain('gift');
  });

  it('places special items (vestments, incense) in specialItems, not fixedItems (ADR-7)', () => {
    // { special: "vestments" } and { special: "sticks of incense", quantity: 5 }
    // → specialItems array, never slugified/granted
    const result = parseBackgroundStartingEquipment(acolyteEquipment);
    expect(result.specialItems).toContain('vestments');
    expect(result.specialItems).toContain('sticks of incense');
    // They must NOT appear in fixedItems (check slugs only)
    const fixedSlugs = result.fixedItems
      .filter((f): f is import('./parse.js').ParsedItemGrant => 'slug' in f)
      .map(f => f.slug);
    expect(fixedSlugs).not.toContain('vestments');
    expect(fixedSlugs).not.toContain('sticks-of-incense');
  });

  it('returns 0 currency when no containsValue present', () => {
    const minimal: BackgroundStartingEquipment = [
      { _: ['shortsword|phb'] },
    ];
    const result = parseBackgroundStartingEquipment(minimal);
    expect(result.currency).toBe(0);
  });

  it('parses the Acolyte a/b choice row — prayer book vs prayer wheel (PHB p.127)', () => {
    const result = parseBackgroundStartingEquipment(acolyteEquipment);
    // Row 1 has a/b choice
    expect(result.choiceRows).toHaveLength(1);
    const optionA = result.choiceRows[0]!.options.find(o => o.slot === 'a');
    expect(optionA).toBeDefined();
    // { item: "book|phb", displayName: "prayer book" } → slug "book", displayName kept
    expect(optionA!.refs).toContainEqual(expect.objectContaining({ slug: 'book', source: 'PHB' }));
  });

  it('places prayer wheel special in choiceRow option-b as specialItem label (PHB p.127)', () => {
    const result = parseBackgroundStartingEquipment(acolyteEquipment);
    const optionB = result.choiceRows[0]!.options.find(o => o.slot === 'b');
    expect(optionB).toBeDefined();
    // { special: "prayer wheel" } → no slug; appears as specialRef in refs
    expect(optionB!.refs).toContainEqual(expect.objectContaining({ special: 'prayer wheel' }));
  });

  it('sums multiple containsValue entries into a single currency total', () => {
    const multiPouch: BackgroundStartingEquipment = [
      {
        _: [
          { item: 'pouch|phb', containsValue: 1000 },
          { item: 'pouch|phb', containsValue: 500 },
        ],
      },
    ];
    const result = parseBackgroundStartingEquipment(multiPouch);
    expect(result.currency).toBe(1500);
  });
});

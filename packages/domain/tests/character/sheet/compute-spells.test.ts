/**
 * RED tests for SP-04: computeCharacterSheet — spell projection into ClassSpellSummary.spells
 * PHB ch.10 p.201 — Casting Spells
 */
import { describe, expect, it } from 'vitest';
import { computeCharacterSheet } from '../../../src/character/sheet/compute.js';
import type {
  CharacterSnapshot,
  SpellSheetRef,
} from '../../../src/character/sheet/types.js';

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeSpellRef(
  slug: string,
  level: number,
  overrides: Partial<SpellSheetRef> = {},
): SpellSheetRef {
  return {
    slug,
    source: 'PHB',
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    level,
    ritual: false,
    concentration: false,
    componentsM: false,
    componentsMCost: null,
    ...overrides,
  };
}

function makeMap(refs: SpellSheetRef[]): ReadonlyMap<string, SpellSheetRef> {
  return new Map(refs.map((r) => [`${r.slug}|${r.source}`, r]));
}

/** Base Cleric L3 snapshot with empty spells. */
const CLERIC_L3_BASE: CharacterSnapshot = {
  name: 'Testina',
  baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 },
  classes: [
    {
      slug: 'cleric',
      source: 'PHB',
      level: 3,
      subclass: null,
      hitDie: 'd8',
      savingThrows: ['wis', 'cha'],
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      skillChoices: [],
    },
  ],
  feats: [],
};

/** Base Sorcerer L3 snapshot. */
const SORCERER_L3_BASE: CharacterSnapshot = {
  name: 'Sorcella',
  baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 },
  classes: [
    {
      slug: 'sorcerer',
      source: 'PHB',
      level: 3,
      subclass: null,
      hitDie: 'd6',
      savingThrows: ['con', 'cha'],
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      skillChoices: [],
    },
  ],
  feats: [],
};

/** Base Wizard L3 snapshot. */
const WIZARD_L3_BASE: CharacterSnapshot = {
  name: 'Mago',
  baseStats: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
  classes: [
    {
      slug: 'wizard',
      source: 'PHB',
      level: 3,
      subclass: null,
      hitDie: 'd6',
      savingThrows: ['int', 'wis'],
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      skillChoices: [],
    },
  ],
  feats: [],
};

// ─── C1-2.1: Absent map → empty arrays ──────────────────────────────────────

describe('REQ-SP04-02: absent spellRefsBySlug → empty spell arrays', () => {
  it('cleric without map emits spells = { cantrips: [], leveled: [] }', () => {
    const sheet = computeCharacterSheet({ character: CLERIC_L3_BASE });
    const summary = sheet.spellsByClass[0];
    expect(summary).toBeDefined();
    expect(summary.spells).toEqual({ cantrips: [], leveled: [] });
  });
});

// ─── C1-2.2: Cleric with 2 resolvable cantrips ──────────────────────────────

describe('REQ-SP04-03: cantrips resolved from spellRefsBySlug', () => {
  // PHB ch.10 p.201: "A cantrip is a spell that can be cast at will,
  // without a spell slot and without being prepared in advance."
  it('cleric with 2 cantrips in map → spells.cantrips.length === 2 with correct fields', () => {
    const sacredFlame = makeSpellRef('sacred-flame', 0);
    const guidance = makeSpellRef('guidance', 0, { concentration: true });
    const map = makeMap([sacredFlame, guidance]);
    const char: CharacterSnapshot = {
      ...CLERIC_L3_BASE,
      spells: {
        cleric: {
          cantrips: [
            { slug: 'sacred-flame', source: 'PHB' },
            { slug: 'guidance', source: 'PHB' },
          ],
          known: [],
          prepared: [],
        },
      },
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    const summary = sheet.spellsByClass[0];
    expect(summary.spells.cantrips).toHaveLength(2);
    const names = summary.spells.cantrips.map((c) => c.name).sort();
    expect(names).toEqual(['Guidance', 'Sacred-flame']);
    expect(summary.spells.cantrips.every((c) => c.level === 0)).toBe(true);
    const guidanceRef = summary.spells.cantrips.find((c) => c.slug === 'guidance');
    expect(guidanceRef?.concentration).toBe(true);
  });

  // ─── C1-2.3: Cantrip slug absent from map → empty, no throw ──────────────
  it('cantrip slug absent from map → spells.cantrips = [] (no crash)', () => {
    const map = makeMap([]); // empty map
    const char: CharacterSnapshot = {
      ...CLERIC_L3_BASE,
      spells: {
        cleric: {
          cantrips: [{ slug: 'sacred-flame', source: 'PHB' }],
          known: [],
          prepared: [],
        },
      },
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    expect(sheet.spellsByClass[0].spells.cantrips).toEqual([]);
  });
});

// ─── C1-2.4: Cleric prepared list (prepared caster) ─────────────────────────

describe('REQ-SP04-04: prepared casters use prepared bucket', () => {
  // PHB p.201: Cleric selects spells from prepared list
  it('cleric L3 with 3 prepared + 0 known → spells.leveled from prepared (3 entries)', () => {
    const spellA = makeSpellRef('bless', 1);
    const spellB = makeSpellRef('healing-word', 1);
    const spellC = makeSpellRef('spiritual-weapon', 2);
    const map = makeMap([spellA, spellB, spellC]);
    const char: CharacterSnapshot = {
      ...CLERIC_L3_BASE,
      spells: {
        cleric: {
          cantrips: [],
          known: [{ slug: 'prayer-of-healing', source: 'PHB' }], // should NOT appear
          prepared: [
            { slug: 'bless', source: 'PHB' },
            { slug: 'healing-word', source: 'PHB' },
            { slug: 'spiritual-weapon', source: 'PHB' },
          ],
        },
      },
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    const summary = sheet.spellsByClass[0];
    expect(summary.spells.leveled).toHaveLength(3);
    expect(summary.spells.leveled.map((s) => s.slug).sort()).toEqual([
      'bless',
      'healing-word',
      'spiritual-weapon',
    ]);
  });

  // ─── C1-2.5: Wizard prepared vs spellbook (SP04-D-01) ────────────────────
  // PHB p.114: "You can prepare a number of spells equal to your Intelligence
  // modifier + your wizard level."
  it('wizard L3 with 10 known (spellbook) and 4 prepared → spells.leveled has 4 entries; wizardSpellbookSize 10', () => {
    const spellbookSpells = Array.from({ length: 10 }, (_, i) =>
      makeSpellRef(`spell-${i}`, i < 3 ? 1 : 2),
    );
    const preparedSpells = spellbookSpells.slice(0, 4);
    const map = makeMap(spellbookSpells);
    const char: CharacterSnapshot = {
      ...WIZARD_L3_BASE,
      spells: {
        wizard: {
          cantrips: [],
          known: spellbookSpells.map((s) => ({ slug: s.slug, source: 'PHB' })),
          prepared: preparedSpells.map((s) => ({ slug: s.slug, source: 'PHB' })),
        },
      },
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    const summary = sheet.spellsByClass[0];
    expect(summary.spells.leveled).toHaveLength(4);
    expect(summary.wizardSpellbookSize).toBe(10);
  });
});

// ─── C1-2.6: Sorcerer known list (known caster) ─────────────────────────────

describe('REQ-SP04-05: known casters use known bucket', () => {
  // PHB p.201: Sorcerer maintains fixed known list
  it('sorcerer L3 with 4 known spells → spells.leveled.length === 4', () => {
    const refs = [
      makeSpellRef('chromatic-orb', 1),
      makeSpellRef('burning-hands', 1),
      makeSpellRef('mirror-image', 2),
      makeSpellRef('scorching-ray', 2),
    ];
    const map = makeMap(refs);
    const char: CharacterSnapshot = {
      ...SORCERER_L3_BASE,
      spells: {
        sorcerer: {
          cantrips: [],
          known: refs.map((r) => ({ slug: r.slug, source: 'PHB' })),
          prepared: [{ slug: 'chromatic-orb', source: 'PHB' }], // should NOT appear
        },
      },
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    const summary = sheet.spellsByClass[0];
    expect(summary.spells.leveled).toHaveLength(4);
  });
});

// ─── C1-2.7: Sorcerer with no spells entry ───────────────────────────────────

describe('REQ-SP04-06: empty caster row', () => {
  it('sorcerer with no spells key → spells = { cantrips: [], leveled: [] }', () => {
    const sheet = computeCharacterSheet({
      character: SORCERER_L3_BASE,
      spellRefsBySlug: makeMap([]),
    });
    const summary = sheet.spellsByClass[0];
    expect(summary).toBeDefined();
    expect(summary.classSlug).toBe('sorcerer');
    expect(summary.spells).toEqual({ cantrips: [], leveled: [] });
  });
});

// ─── C1-2.8: Multiclass Cleric 1 / Wizard 1 ─────────────────────────────────

describe('REQ-SP04-12 (domain): multiclass has independent spell arrays', () => {
  // PHB p.164: each class manages its own prepared/known list independently
  it('cleric 1 / wizard 1 → 2 entries in spellsByClass with independent arrays', () => {
    const bless = makeSpellRef('bless', 1);
    const magicMissile = makeSpellRef('magic-missile', 1);
    const map = makeMap([bless, magicMissile]);
    const char: CharacterSnapshot = {
      name: 'Multiclassed',
      baseStats: { str: 10, dex: 10, con: 10, int: 12, wis: 14, cha: 10 },
      classes: [
        {
          slug: 'cleric',
          source: 'PHB',
          level: 1,
          subclass: null,
          hitDie: 'd8',
          savingThrows: ['wis', 'cha'],
          armorProficiencies: [],
          weaponProficiencies: [],
          toolProficiencies: [],
          skillChoices: [],
        },
        {
          slug: 'wizard',
          source: 'PHB',
          level: 1,
          subclass: null,
          hitDie: 'd6',
          savingThrows: ['int', 'wis'],
          armorProficiencies: [],
          weaponProficiencies: [],
          toolProficiencies: [],
          skillChoices: [],
        },
      ],
      spells: {
        cleric: {
          cantrips: [],
          known: [],
          prepared: [{ slug: 'bless', source: 'PHB' }],
        },
        wizard: {
          cantrips: [],
          known: [{ slug: 'magic-missile', source: 'PHB' }],
          prepared: [{ slug: 'magic-missile', source: 'PHB' }],
        },
      },
      feats: [],
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    expect(sheet.spellsByClass).toHaveLength(2);
    const clericSummary = sheet.spellsByClass.find((s) => s.classSlug === 'cleric');
    const wizardSummary = sheet.spellsByClass.find((s) => s.classSlug === 'wizard');
    expect(clericSummary?.spells.leveled.map((s) => s.slug)).toEqual(['bless']);
    expect(wizardSummary?.spells.leveled.map((s) => s.slug)).toEqual(['magic-missile']);
  });
});

// ─── C1-2.9: Sort order — level asc, then name asc ──────────────────────────

describe('Design §2: spell sort order — level asc then name asc', () => {
  it('leveled spells sorted by level asc, then name asc within same level', () => {
    const refs = [
      makeSpellRef('web', 2),
      makeSpellRef('alarm', 1),
      makeSpellRef('burning-hands', 1),
      makeSpellRef('hold-person', 2),
    ];
    const map = makeMap(refs);
    const char: CharacterSnapshot = {
      ...WIZARD_L3_BASE,
      spells: {
        wizard: {
          cantrips: [],
          known: refs.map((r) => ({ slug: r.slug, source: 'PHB' })),
          // wizard uses prepared for leveled
          prepared: refs.map((r) => ({ slug: r.slug, source: 'PHB' })),
        },
      },
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    const names = sheet.spellsByClass[0].spells.leveled.map((s) => s.name);
    expect(names).toEqual(['Alarm', 'Burning-hands', 'Hold-person', 'Web']);
  });
});

// ─── C1-2.10: Source disambiguation ─────────────────────────────────────────

describe('SP04-D-03: source-aware lookup — resolves correct entry', () => {
  it('two map entries share same slug across sources → character picks slug|PHB → resolves to PHB entry only', () => {
    const phbFireball = makeSpellRef('fireball', 3);
    const uaFireball: SpellSheetRef = {
      slug: 'fireball',
      source: 'UA',
      name: 'Fireball (UA)',
      level: 3,
      ritual: false,
      concentration: false,
      componentsM: true,
      componentsMCost: null,
    };
    const map: ReadonlyMap<string, SpellSheetRef> = new Map([
      ['fireball|PHB', phbFireball],
      ['fireball|UA', uaFireball],
    ]);
    const char: CharacterSnapshot = {
      ...WIZARD_L3_BASE,
      spells: {
        wizard: {
          cantrips: [],
          known: [],
          prepared: [{ slug: 'fireball', source: 'PHB' }],
        },
      },
    };

    const sheet = computeCharacterSheet({ character: char, spellRefsBySlug: map });
    const leveled = sheet.spellsByClass[0].spells.leveled;
    expect(leveled).toHaveLength(1);
    expect(leveled[0].source).toBe('PHB');
    expect(leveled[0].name).toBe('Fireball');
  });
});

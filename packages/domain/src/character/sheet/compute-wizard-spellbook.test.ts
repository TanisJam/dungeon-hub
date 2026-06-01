import { describe, it, expect } from 'vitest';
import { computeCharacterSheet } from './compute.js';
import type { CharacterSnapshot, RaceSheetData } from './types.js';
import type { SpellSheetRef } from './types.js';

/**
 * FIX 1 — Wizard spellbook surface on sheet.
 *
 * PHB p.114 — Wizard Spellbook:
 *   "At 1st level, you have a spellbook containing six 1st-level wizard spells of your choice."
 *   "Each time you gain a wizard level, you can add two wizard spells of your choice to your spellbook."
 *
 * The key distinction (PHB p.114):
 *   - KNOWN = spellbook (all spells you've learned; can be re-scribed; not limited by prep)
 *   - PREPARED = subset ≤ INT mod + Wizard level chosen from the spellbook each day
 *
 * Before this fix, `spellsByClass[0].spells.leveled` contained ONLY prepared spells for
 * Wizard (same code path as Cleric/Druid), making it impossible to display the spellbook
 * and causing the prep-save to wipe `known` by passing `existingKnown=[]`.
 *
 * REQ-SP-WIZARD-01: For Wizard (wizardSpellbookSize != null), spells.leveled MUST contain
 *   all spellbook entries (known bucket), NOT just prepared ones.
 * REQ-SP-WIZARD-02: Each entry in spells.leveled for a Wizard must carry a `prepared` boolean
 *   flag indicating whether that spell is currently prepared.
 * REQ-SP-WIZARD-03: A Cleric (prepared caster, no spellbook) is unchanged: spells.leveled
 *   contains only prepared spells with no `prepared` flag.
 */

const RACE_DATA: RaceSheetData = { racialTraits: [] };

function makeSpellRef(slug: string, level: number): SpellSheetRef {
  return {
    slug,
    source: 'PHB',
    name: slug,
    level,
    ritual: false,
    concentration: false,
    componentsM: false,
    componentsMCost: null,
  };
}

const SPELLBOOK_SLUGS = [
  'burning-hands',
  'charm-person',
  'detect-magic',
  'magic-missile',
  'shield',
  'sleep',
] as const;

const WIZARD_SNAPSHOT: CharacterSnapshot = {
  name: 'Test Wizard',
  baseStats: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 },
  classes: [
    {
      slug: 'wizard',
      source: 'PHB',
      level: 1,
      hitDie: 'd6',
      subclass: null,
      savingThrows: ['int', 'wis'],
      armorProficiencies: [],
      weaponProficiencies: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
      toolProficiencies: [],
      skillChoices: ['arcana', 'history'],
    },
  ],
  spells: {
    wizard: {
      cantrips: [{ slug: 'fire-bolt', source: 'PHB' }],
      // Spellbook: 6 spells (PHB p.114)
      known: SPELLBOOK_SLUGS.map((s) => ({ slug: s, source: 'PHB' })),
      // Prepared: only 4 of 6 (INT mod 3 + level 1 = 4)
      prepared: [
        { slug: 'burning-hands', source: 'PHB' },
        { slug: 'magic-missile', source: 'PHB' },
        { slug: 'shield', source: 'PHB' },
        { slug: 'sleep', source: 'PHB' },
      ],
    },
  },
};

const CLERIC_SNAPSHOT: CharacterSnapshot = {
  name: 'Test Cleric',
  baseStats: { str: 10, dex: 12, con: 13, int: 8, wis: 16, cha: 10 },
  classes: [
    {
      slug: 'cleric',
      source: 'PHB',
      level: 1,
      hitDie: 'd8',
      subclass: null,
      savingThrows: ['wis', 'cha'],
      armorProficiencies: ['light', 'medium', 'shield'],
      weaponProficiencies: ['simple'],
      toolProficiencies: [],
      skillChoices: ['medicine', 'religion'],
    },
  ],
  spells: {
    cleric: {
      cantrips: [{ slug: 'sacred-flame', source: 'PHB' }],
      known: [],
      // Cleric prepares spells: WIS mod 3 + level 1 = 4 prepared
      prepared: [
        { slug: 'cure-wounds', source: 'PHB' },
        { slug: 'guiding-bolt', source: 'PHB' },
        { slug: 'healing-word', source: 'PHB' },
        { slug: 'bless', source: 'PHB' },
      ],
    },
  },
};

function buildSpellRefMap(slugs: string[]): Map<string, SpellSheetRef> {
  const m = new Map<string, SpellSheetRef>();
  for (const slug of slugs) {
    const level = slug === 'fire-bolt' || slug === 'sacred-flame' ? 0 : 1;
    m.set(`${slug}|PHB`, makeSpellRef(slug, level));
  }
  return m;
}

const WIZARD_SPELLS = [
  'fire-bolt',
  ...SPELLBOOK_SLUGS,
];

const CLERIC_SPELLS = [
  'sacred-flame',
  'cure-wounds',
  'guiding-bolt',
  'healing-word',
  'bless',
];

describe('computeCharacterSheet — Wizard spellbook surface (REQ-SP-WIZARD-01, 02)', () => {
  it('REQ-SP-WIZARD-01: Wizard spells.leveled contains ALL 6 spellbook entries (not just 4 prepared)', () => {
    const sheet = computeCharacterSheet({
      character: WIZARD_SNAPSHOT,
      raceData: RACE_DATA,
      spellRefsBySlug: buildSpellRefMap(WIZARD_SPELLS),
    });

    const wizardSummary = sheet.spellsByClass.find((s) => s.classSlug === 'wizard');
    expect(wizardSummary).toBeDefined();
    // Should have all 6 spellbook spells, not just 4 prepared
    expect(wizardSummary!.spells.leveled).toHaveLength(6);
    const slugs = wizardSummary!.spells.leveled.map((s) => s.slug).sort();
    expect(slugs).toEqual([...SPELLBOOK_SLUGS].sort());
  });

  it('REQ-SP-WIZARD-02: each leveled entry has a `prepared` boolean; prepared ones are true', () => {
    const sheet = computeCharacterSheet({
      character: WIZARD_SNAPSHOT,
      raceData: RACE_DATA,
      spellRefsBySlug: buildSpellRefMap(WIZARD_SPELLS),
    });

    const wizardSummary = sheet.spellsByClass.find((s) => s.classSlug === 'wizard');
    expect(wizardSummary).toBeDefined();

    const leveled = wizardSummary!.spells.leveled as Array<SpellSheetRef & { prepared?: boolean }>;
    const preparedSlugs = new Set(['burning-hands', 'magic-missile', 'shield', 'sleep']);

    for (const entry of leveled) {
      expect(typeof entry.prepared).toBe('boolean');
      if (preparedSlugs.has(entry.slug)) {
        expect(entry.prepared).toBe(true);
      } else {
        expect(entry.prepared).toBe(false);
      }
    }
  });

  it('REQ-SP-WIZARD-03: Cleric is unchanged — spells.leveled has only prepared spells, no prepared flag', () => {
    const sheet = computeCharacterSheet({
      character: CLERIC_SNAPSHOT,
      raceData: RACE_DATA,
      spellRefsBySlug: buildSpellRefMap(CLERIC_SPELLS),
    });

    const clericSummary = sheet.spellsByClass.find((s) => s.classSlug === 'cleric');
    expect(clericSummary).toBeDefined();
    // 4 prepared spells only (same as before)
    expect(clericSummary!.spells.leveled).toHaveLength(4);
    const slugs = clericSummary!.spells.leveled.map((s) => s.slug).sort();
    expect(slugs).toEqual(['bless', 'cure-wounds', 'guiding-bolt', 'healing-word']);

    // No `prepared` field on Cleric entries
    const leveled = clericSummary!.spells.leveled as Array<SpellSheetRef & { prepared?: boolean }>;
    for (const entry of leveled) {
      expect(entry.prepared).toBeUndefined();
    }
  });
});

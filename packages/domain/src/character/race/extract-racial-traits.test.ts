/**
 * Tests for extractRacialTraits helper.
 *
 * PHB 2014 citations inline with each scenario.
 */
import { describe, expect, it } from 'vitest';
import { extractRacialTraits, RACIAL_TRAIT_NAME_BLOCKLIST } from './extract-racial-traits.js';

// ---------------------------------------------------------------------------
// SCEN-RT-01 — PHB Dwarf golden path: 10 entries, 4 out, 6 blocked
// PHB p.20 — Dwarf Traits
// ---------------------------------------------------------------------------
describe('SCEN-RT-01: PHB Dwarf golden path — blocklist applied', () => {
  const raceEntries = [
    { type: 'entries', name: 'Age',                entries: ['Dwarves mature at the same rate...'] },
    { type: 'entries', name: 'Size',               entries: ['Dwarves stand between 4 and 5 feet...'] },
    { type: 'entries', name: 'Speed',              entries: ['Your base walking speed is 25 feet.'] },
    { type: 'entries', name: 'Darkvision',         entries: ['Accustomed to life underground...'] },
    { type: 'entries', name: 'Dwarven Resilience', entries: ['You have advantage on saving throws against poison...'] },
    { type: 'entries', name: 'Dwarven Combat Training', entries: ['You have proficiency with the battleaxe...'] },
    { type: 'entries', name: 'Tool Proficiency',   entries: ['You gain proficiency with the artisan\'s tools...'] },
    { type: 'entries', name: 'Stonecunning',       entries: ['Whenever you make an Intelligence (History) check...'] },
    { type: 'entries', name: 'Languages',          entries: ['You can speak, read, and write Common and Dwarvish.'] },
    { type: 'entries', name: 'Alignment',          entries: ['Most dwarves are lawful...'] },
  ];

  it('returns exactly 4 traits', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    expect(result).toHaveLength(4);
  });

  it('returns Dwarven Resilience, Dwarven Combat Training, Tool Proficiency, Stonecunning — in source order', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    expect(result[0]!.name).toBe('Dwarven Resilience');
    expect(result[1]!.name).toBe('Dwarven Combat Training');
    expect(result[2]!.name).toBe('Tool Proficiency');
    expect(result[3]!.name).toBe('Stonecunning');
  });

  it('all results have source: "race"', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    for (const trait of result) {
      expect(trait.source).toBe('race');
    }
  });

  it('blocklisted entries (Age, Size, Speed, Darkvision, Languages, Alignment) are absent', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    const names = result.map((t) => t.name);
    expect(names).not.toContain('Age');
    expect(names).not.toContain('Size');
    expect(names).not.toContain('Speed');
    expect(names).not.toContain('Darkvision');
    expect(names).not.toContain('Languages');
    expect(names).not.toContain('Alignment');
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-02 — High Elf race + subrace: source ordering and tagging
// PHB p.23-24 — Elf Traits and High Elf subrace
// ---------------------------------------------------------------------------
describe('SCEN-RT-02: High Elf race + subrace — ordering and source tags', () => {
  const raceEntries = [
    { type: 'entries', name: 'Darkvision', entries: ['60 feet.'] },       // blocked
    { type: 'entries', name: 'Keen Senses', entries: ['Perception proficiency.'] },
    { type: 'entries', name: 'Fey Ancestry', entries: ['Advantage on saving throws...'] },
    { type: 'entries', name: 'Trance', entries: ['Elves do not sleep...'] },
    { type: 'entries', name: 'Languages', entries: ['Common, Elvish, extra language.'] }, // blocked
  ];
  const subraceEntries = [
    { type: 'entries', name: 'Elf Weapon Training', entries: ['Proficiency with longsword...'] },
    { type: 'entries', name: 'Cantrip', entries: ['You know one cantrip of your choice from the wizard spell list.'] },
  ];

  it('returns 5 traits total (3 race + 2 subrace)', () => {
    const result = extractRacialTraits(raceEntries, subraceEntries);
    expect(result).toHaveLength(5);
  });

  it('race traits appear first in source order', () => {
    const result = extractRacialTraits(raceEntries, subraceEntries);
    expect(result[0]!.name).toBe('Keen Senses');
    expect(result[0]!.source).toBe('race');
    expect(result[1]!.name).toBe('Fey Ancestry');
    expect(result[1]!.source).toBe('race');
    expect(result[2]!.name).toBe('Trance');
    expect(result[2]!.source).toBe('race');
  });

  it('subrace traits appended after race traits in source order', () => {
    const result = extractRacialTraits(raceEntries, subraceEntries);
    expect(result[3]!.name).toBe('Elf Weapon Training');
    expect(result[3]!.source).toBe('subrace');
    expect(result[4]!.name).toBe('Cantrip');
    expect(result[4]!.source).toBe('subrace');
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-03 — Blocklist is case-insensitive and trims whitespace
// ---------------------------------------------------------------------------
describe('SCEN-RT-03: blocklist is case-insensitive and trims whitespace', () => {
  const raceEntries = [
    { type: 'entries', name: 'AGE',   entries: ['...'] },
    { type: 'entries', name: 'age',   entries: ['...'] },
    { type: 'entries', name: '  Age  ', entries: ['...'] },
    { type: 'entries', name: 'Dwarven Resilience', entries: ['...'] },
  ];

  it('returns only 1 trait (Dwarven Resilience) — AGE/age/  Age   all blocked', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Dwarven Resilience');
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-04 — Empty `name` entry is skipped silently
// ---------------------------------------------------------------------------
describe('SCEN-RT-04: empty or whitespace-only name → skipped silently', () => {
  const raceEntries = [
    { type: 'entries', name: '', entries: ['Some description.'] },
    { type: 'entries', name: '   ', entries: ['Whitespace only name.'] },
    { type: 'entries', name: 'Brave', entries: ['You have advantage on saving throws against being frightened.'] },
  ];

  it('returns only 1 trait (Brave)', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Brave');
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-05 — Multi-paragraph inner entries joined with '\n\n'
// ---------------------------------------------------------------------------
describe('SCEN-RT-05: multi-paragraph inner entries joined with \\n\\n', () => {
  const raceEntries = [
    {
      type: 'entries',
      name: 'Lucky',
      entries: [
        'When you roll a 1 on the d20 for an attack roll...',
        'You can use this feature three times.',
      ],
    },
  ];

  it('joins inner entries with \\n\\n', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe(
      'When you roll a 1 on the d20 for an attack roll...\n\nYou can use this feature three times.',
    );
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-06a — {@filter ...} token preserved verbatim in text
// ---------------------------------------------------------------------------
describe('SCEN-RT-06a: {@filter ...} token preserved verbatim', () => {
  const raceEntries = [
    {
      type: 'entries',
      name: 'Gnome Cunning',
      entries: ['You have advantage on all Intelligence, Wisdom, and Charisma saving throws against {@filter magic|spells|school=A;C;D;EN;EV;I;N;T}.'],
    },
  ];

  it('preserves {@filter ...} token raw in text', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('{@filter magic|spells|school=A;C;D;EN;EV;I;N;T}');
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-06b — {@spell ...} token preserved verbatim
// ---------------------------------------------------------------------------
describe('SCEN-RT-06b: {@spell ...} token preserved verbatim', () => {
  const raceEntries = [
    {
      type: 'entries',
      name: 'Infernal Legacy',
      entries: ['You know the {@spell thaumaturgy} cantrip.'],
    },
  ];

  it('text equals raw string with {@spell thaumaturgy} intact', () => {
    const result = extractRacialTraits(raceEntries, undefined);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe('You know the {@spell thaumaturgy} cantrip.');
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-07 — Empty / absent entries arrays return []
// ---------------------------------------------------------------------------
describe('SCEN-RT-07: empty/absent entries arrays return []', () => {
  it('variant a: both undefined → []', () => {
    expect(extractRacialTraits(undefined, undefined)).toEqual([]);
  });

  it('variant b: both empty arrays → []', () => {
    expect(extractRacialTraits([], [])).toEqual([]);
  });

  it('variant c: undefined subrace → race traits returned with source "race"', () => {
    const result = extractRacialTraits(
      [{ type: 'entries', name: 'Brave', entries: ['...'] }],
      undefined,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('race');
  });

  it('variant d: undefined race → subrace trait returned with source "subrace"', () => {
    const result = extractRacialTraits(
      undefined,
      [{ type: 'entries', name: 'Some subrace trait', entries: ['...'] }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('subrace');
  });
});

// ---------------------------------------------------------------------------
// RACIAL_TRAIT_NAME_BLOCKLIST export check
// ---------------------------------------------------------------------------
describe('RACIAL_TRAIT_NAME_BLOCKLIST export', () => {
  it('exports a ReadonlySet containing the 6 canonical blocklist entries (lowercased)', () => {
    expect(RACIAL_TRAIT_NAME_BLOCKLIST.has('age')).toBe(true);
    expect(RACIAL_TRAIT_NAME_BLOCKLIST.has('size')).toBe(true);
    expect(RACIAL_TRAIT_NAME_BLOCKLIST.has('speed')).toBe(true);
    expect(RACIAL_TRAIT_NAME_BLOCKLIST.has('languages')).toBe(true);
    expect(RACIAL_TRAIT_NAME_BLOCKLIST.has('darkvision')).toBe(true);
    expect(RACIAL_TRAIT_NAME_BLOCKLIST.has('alignment')).toBe(true);
    expect(RACIAL_TRAIT_NAME_BLOCKLIST.size).toBe(6);
  });
});

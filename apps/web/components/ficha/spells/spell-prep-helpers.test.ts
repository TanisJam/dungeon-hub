/**
 * Tests for spell-prep helpers — SPELL-PREP-02, SPELL-PREP-05.
 *
 * T1: filterPrepUniverse excludes cantrips (level===0) from Druid list.
 * T2: filterPrepUniverse for Cleric (no knownUniverseSlugs) returns full leveled list.
 * T3: filterPrepUniverse for Wizard intersects with knownUniverseSlugs.
 * T4: filterPrepUniverse for Wizard with empty knownUniverseSlugs → empty result.
 * T5: filterPrepUniverse with mixed leveled + cantrips → cantrips always excluded.
 */
import { describe, it, expect } from 'vitest';
import { filterPrepUniverse } from './spell-prep-helpers';

const makeSpell = (slug: string, level: number) => ({
  slug,
  source: 'PHB',
  name: slug,
  level,
  ritual: false,
  concentration: false,
  componentsM: false,
  componentsMCost: null,
});

// Druid-like list: mix of cantrips + leveled
const druidSpells = [
  makeSpell('shillelagh', 0),        // cantrip — exclude
  makeSpell('thunderwave', 0),       // cantrip — exclude
  makeSpell('entangle', 1),          // leveled — keep
  makeSpell('moonbeam', 2),          // leveled — keep
  makeSpell('call-lightning', 3),    // leveled — keep
];

// Wizard spellbook slugs
const wizardKnown = new Set(['magic-missile', 'shield', 'counterspell']);

// Available spells list for Wizard (larger than spellbook)
const wizardAvailable = [
  makeSpell('magic-missile', 1),
  makeSpell('shield', 1),
  makeSpell('counterspell', 3),
  makeSpell('fireball', 3),         // NOT in spellbook
  makeSpell('prestidigitation', 0), // cantrip — always exclude
];

describe('filterPrepUniverse', () => {
  it('T1: excludes cantrips from Druid-like list', () => {
    const result = filterPrepUniverse(druidSpells, undefined);
    const levels = result.map((s) => s.level);
    expect(levels.every((l) => l > 0)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('T2: Cleric/Druid with no knownUniverseSlugs → returns full leveled list', () => {
    const result = filterPrepUniverse(druidSpells, undefined);
    expect(result.map((s) => s.slug)).toEqual(['entangle', 'moonbeam', 'call-lightning']);
  });

  it('T3: Wizard — intersects with knownUniverseSlugs, cantrips excluded', () => {
    const result = filterPrepUniverse(wizardAvailable, wizardKnown);
    const slugs = result.map((s) => s.slug);
    // Only spellbook slugs that are leveled
    expect(slugs).toContain('magic-missile');
    expect(slugs).toContain('shield');
    expect(slugs).toContain('counterspell');
    // fireball not in spellbook
    expect(slugs).not.toContain('fireball');
    // prestidigitation is cantrip — excluded
    expect(slugs).not.toContain('prestidigitation');
    expect(result).toHaveLength(3);
  });

  it('T4: Wizard with empty knownUniverseSlugs → empty result', () => {
    const result = filterPrepUniverse(wizardAvailable, new Set<string>());
    expect(result).toHaveLength(0);
  });

  it('T5: mixed list — cantrips always excluded regardless of knownUniverseSlugs', () => {
    const mixed = [makeSpell('mage-hand', 0), makeSpell('sleep', 1)];
    // Even if cantrip slug is in known set, it should still be excluded
    const knownWithCantrip = new Set(['mage-hand', 'sleep']);
    const result = filterPrepUniverse(mixed, knownWithCantrip);
    expect(result.map((s) => s.slug)).toEqual(['sleep']);
  });
});

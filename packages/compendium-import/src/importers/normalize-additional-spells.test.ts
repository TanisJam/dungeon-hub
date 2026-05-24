/**
 * Tests for normalizeAdditionalSpells — the pure function that converts
 * 5etools additionalSpells JSONB into RaceInnateSpell[] rows.
 *
 * Spec: engram #607 (REQ-I-NORM-01..06, REQ-D-RACE-INNATE-01..04).
 * Bootstrap: engram #599 (shape grammar).
 * PHB citations inline per strict TDD requirement (CLAUDE.md §5).
 */
import { describe, it, expect } from 'vitest';
import { normalizeAdditionalSpells } from './normalize-additional-spells.js';

// ---- Shape fixtures from bootstrap #599 -----------------------------------

// Shape A — Tiefling (PHB p.42-43 Infernal Legacy)
const TIEFLING_RAW = {
  ability: 'cha',
  known: {
    '1': ['thaumaturgy#c'],
  },
  innate: {
    '3': { daily: { '1': ['hellish rebuke#2'] } },
    '5': { daily: { '1': ['darkness'] } },
  },
};

// Shape A — Drow (PHB p.24 Drow Magic)
const DROW_RAW = {
  ability: 'cha',
  known: {
    '1': ['dancing lights'],
  },
  innate: {
    '3': { daily: { '1': ['faerie fire'] } },
    '5': { daily: { '1': ['darkness'] } },
  },
};

// Shape C — Forest Gnome (PHB p.37 Natural Illusionist)
const FOREST_GNOME_RAW = {
  ability: 'int',
  known: {
    '1': ['minor illusion#c'],
  },
};

// Shape B — High Elf (PHB p.23 Cantrip)
const HIGH_ELF_RAW = {
  ability: 'int',
  known: {
    '1': {
      _: [{ choose: 'level=0|class=Wizard' }],
    },
  },
};

// ---- Tests -----------------------------------------------------------------

describe('normalizeAdditionalSpells', () => {
  // N-1: Tiefling Shape A → 3 RaceInnateSpell entries (PHB p.42-43)
  it('N-1: Tiefling Shape A → 3 entries with correct slugs/frequencies/abilities', () => {
    const result = normalizeAdditionalSpells(TIEFLING_RAW, 'Tiefling');
    expect(result.warnings).toEqual([]);
    expect(result.spells).toHaveLength(3);

    // thaumaturgy — at-will (known bucket, level 1), PHB p.282
    expect(result.spells).toContainEqual({
      slug: 'thaumaturgy',
      source: 'phb',
      characterLevelAvailable: 1,
      frequency: 'at-will',
      ability: 'cha',
    });

    // hellish rebuke — daily-1 (innate bucket, level 3), cast as 2nd level, PHB p.250
    expect(result.spells).toContainEqual({
      slug: 'hellish-rebuke',
      source: 'phb',
      characterLevelAvailable: 3,
      frequency: 'daily-1',
      ability: 'cha',
      castLevel: 2,
    });

    // darkness — daily-1 (innate bucket, level 5), PHB p.230
    expect(result.spells).toContainEqual({
      slug: 'darkness',
      source: 'phb',
      characterLevelAvailable: 5,
      frequency: 'daily-1',
      ability: 'cha',
    });
  });

  // N-2: Drow Shape A → 3 entries, dancing-lights WITHOUT #c suffix (PHB p.24)
  it('N-2: Drow Shape A → 3 entries, dancing-lights classified at-will via known bucket NOT #c', () => {
    const result = normalizeAdditionalSpells(DROW_RAW, 'Drow');
    expect(result.warnings).toEqual([]);
    expect(result.spells).toHaveLength(3);

    // dancing-lights — at-will (known bucket position, PHB p.230)
    // CRITICAL: #c is absent in 5etools Drow data (bootstrap #599)
    expect(result.spells).toContainEqual({
      slug: 'dancing-lights',
      source: 'phb',
      characterLevelAvailable: 1,
      frequency: 'at-will',
      ability: 'cha',
    });

    expect(result.spells).toContainEqual({
      slug: 'faerie-fire',
      source: 'phb',
      characterLevelAvailable: 3,
      frequency: 'daily-1',
      ability: 'cha',
    });

    expect(result.spells).toContainEqual({
      slug: 'darkness',
      source: 'phb',
      characterLevelAvailable: 5,
      frequency: 'daily-1',
      ability: 'cha',
    });
  });

  // N-3: Forest Gnome Shape C → 1 entry (PHB p.37)
  it('N-3: Forest Gnome Shape C → 1 entry with ability=int', () => {
    const result = normalizeAdditionalSpells(FOREST_GNOME_RAW, 'Forest Gnome');
    expect(result.warnings).toEqual([]);
    expect(result.spells).toHaveLength(1);
    expect(result.spells[0]).toEqual({
      slug: 'minor-illusion',
      source: 'phb',
      characterLevelAvailable: 1,
      frequency: 'at-will',
      ability: 'int',
    });
  });

  // N-4: High Elf Shape B → 1 sentinel entry with isPlayerChoice (PHB p.23)
  it('N-4: High Elf Shape B → 1 sentinel entry with isPlayerChoice=true', () => {
    const result = normalizeAdditionalSpells(HIGH_ELF_RAW, 'High Elf');
    expect(result.warnings).toEqual([]);
    expect(result.spells).toHaveLength(1);
    expect(result.spells[0]).toEqual({
      slug: '__choose__',
      source: '',
      characterLevelAvailable: 1,
      frequency: 'at-will',
      ability: 'int',
      isPlayerChoice: true,
      fromClass: 'wizard',
    });
  });

  // N-5: #c cantrip tag stripped from slug, NOT used for cantrip classification
  it('N-5: #c suffix stripped from slug; frequency determined by bucket position (known=at-will)', () => {
    // REQ-I-NORM-02: #c is unreliable (bootstrap #599 notes Drow lacks it)
    const raw = {
      ability: 'cha',
      known: { '1': ['thaumaturgy#c'] },
    };
    const result = normalizeAdditionalSpells(raw, 'TestRace');
    expect(result.spells).toHaveLength(1);
    expect(result.spells[0]!.slug).toBe('thaumaturgy');
    expect(result.spells[0]!.slug).not.toContain('#c');
    expect(result.spells[0]!.frequency).toBe('at-will');
    expect(result.warnings).toEqual([]);
  });

  // N-6: #N upcast suffix → castLevel captured on entry
  it('N-6: #2 upcast suffix → castLevel:2 emitted on entry', () => {
    // REQ-I-NORM-02: hellish rebuke#2 → slug='hellish-rebuke', castLevel:2
    const raw = {
      ability: 'cha',
      innate: {
        '3': { daily: { '1': ['hellish rebuke#2'] } },
      },
    };
    const result = normalizeAdditionalSpells(raw, 'TestRace');
    expect(result.spells).toHaveLength(1);
    expect(result.spells[0]!.slug).toBe('hellish-rebuke');
    expect(result.spells[0]!.castLevel).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  // N-7: Unknown daily key "2" → warning + spell still present as daily-1 (decision #604)
  it('N-7: unknown daily key "2" → warning emitted + spell still present as daily-1', () => {
    // REQ-I-NORM-05: no data loss; CI MUST NOT fail on warnings
    const raw = {
      ability: 'cha',
      innate: {
        '3': { daily: { '2': ['some-spell'] } },
      },
    };
    const result = normalizeAdditionalSpells(raw, 'TestRace');
    expect(result.spells).toHaveLength(1);
    expect(result.spells[0]!.frequency).toBe('daily-1');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('daily key "2"'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('normalized to daily-1'))).toBe(true);
  });

  // N-8: Unrecognized choose shape → warning + NO entry emitted
  it('N-8: unrecognized choose shape (class=Druid) → warning + no entry emitted', () => {
    // REQ-I-NORM-03: only 'level=0|class=Wizard' is recognized (decision #602)
    const raw = {
      ability: 'int',
      known: {
        '1': {
          _: [{ choose: 'level=0|class=Druid' }],
        },
      },
    };
    const result = normalizeAdditionalSpells(raw, 'TestRace');
    expect(result.spells).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('choose shape'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('level=0|class=Druid'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('not recognized'))).toBe(true);
  });

  // N-9: Unknown innate frequency key → warning + block skipped
  it('N-9: unknown innate frequency key "monthly" → warning + block skipped', () => {
    // REQ-I-NORM-01: only 'daily' is recognized in innate bucket
    const raw = {
      ability: 'cha',
      innate: {
        '3': { monthly: { '1': ['some-spell'] } },
      },
    };
    const result = normalizeAdditionalSpells(raw, 'TestRace');
    expect(result.spells).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('monthly'))).toBe(true);
  });

  // N-10: Unknown character-level key → warning + entry skipped (REQ-I-NORM-06)
  it('N-10: unknown character-level key "7" → warning + entry skipped', () => {
    // REQ-I-NORM-06: only 1|3|5 are valid in PHB scope (decision #603)
    const raw = {
      ability: 'cha',
      innate: {
        '7': { daily: { '1': ['some-spell'] } },
      },
    };
    const result = normalizeAdditionalSpells(raw, 'TestRace');
    expect(result.spells).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('7') || w.includes('unrecognized level'))).toBe(true);
  });

  // N-11: expanded bucket present → warning emitted + block skipped
  it('N-11: expanded bucket present → warning emitted + block skipped', () => {
    // REQ-I-NORM-01: expanded is DMG/MPMM only, out of scope for Batch 6
    const raw = {
      ability: 'cha',
      expanded: {
        s1: ['some-spell'],
      },
    };
    const result = normalizeAdditionalSpells(raw, 'TestRace');
    expect(result.spells).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('expanded'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('not supported') || w.includes('skipped'))).toBe(true);
  });

  // N-12: null/undefined input → empty result, no warnings, no throw
  it('N-12: null input → empty spells, no warnings, no throw', () => {
    const nullResult = normalizeAdditionalSpells(null, 'TestRace');
    expect(nullResult).toEqual({ spells: [], warnings: [] });

    const undefResult = normalizeAdditionalSpells(undefined, 'TestRace');
    expect(undefResult).toEqual({ spells: [], warnings: [] });
  });
});

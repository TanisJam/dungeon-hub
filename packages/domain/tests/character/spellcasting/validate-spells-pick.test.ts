/**
 * Tests for the domain-lifted validateSpellsPick function.
 *
 * REQ-CLU-XCUT-LIFT-VALIDATE-SPELLS-PICK: pure validation function must live in domain,
 * not in web/_picker.tsx. Returns structured SpellsPickIssue[] (empty = valid).
 * REQ-CLU-XCUT-TDD: test-first.
 */
import { describe, it, expect } from 'vitest';
import { validateSpellsPick } from '../../../src/character/spellcasting/validate-spells-pick.js';
import type { SpellLimitsView } from '../../../src/character/spellcasting/preparation.js';
import type { AppliedClassSpells } from '../../../src/character/spellcasting/validate-spells.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeLimits(overrides: Partial<SpellLimitsView> = {}): SpellLimitsView {
  return {
    cantripsKnown: 2,
    spellsKnown: null,
    spellsPrepared: 4,
    maxSpellLevel: 5,
    ability: 'wis',
    ...overrides,
  };
}

function makeSpells(...args: Array<[string, string]>): Array<{ slug: string; source: string }> {
  return args.map(([slug, source]) => ({ slug, source }));
}

const ref = (slug: string, source = 'PHB') => ({ slug, source });

// ── Known caster (mode: 'known') ──────────────────────────────────────────

describe('validateSpellsPick — known caster (Bard/Sorcerer/Warlock/Ranger)', () => {
  const knownLimits = makeLimits({ cantripsKnown: 2, spellsKnown: 7, spellsPrepared: null });

  it('returns [] (valid) when cantrips and known match limits exactly', () => {
    const value: AppliedClassSpells = {
      cantrips: [ref('dancing-lights'), ref('vicious-mockery')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6'), ref('s7')],
      prepared: [],
    };
    expect(validateSpellsPick(knownLimits, [], value)).toEqual([]);
  });

  it('returns SPELLS_KNOWN_COUNT_MISMATCH when known spells count is below limit', () => {
    // Bard L3 (6 known) advancing to L4 (7 known): pre-seeded with 6, needs 1 more
    const limitsL4 = makeLimits({ cantripsKnown: 2, spellsKnown: 7, spellsPrepared: null });
    const value: AppliedClassSpells = {
      cantrips: [ref('dancing-lights'), ref('vicious-mockery')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6')], // 6 of 7
      prepared: [],
    };
    const issues = validateSpellsPick(limitsL4, [], value);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.code).toBe('SPELLS_KNOWN_COUNT_MISMATCH');
  });

  it('returns CANTRIPS_COUNT_MISMATCH when cantrip count is below limit', () => {
    const value: AppliedClassSpells = {
      cantrips: [ref('dancing-lights')], // 1 of 2
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6'), ref('s7')],
      prepared: [],
    };
    const issues = validateSpellsPick(knownLimits, [], value);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.code).toBe('CANTRIPS_COUNT_MISMATCH');
  });

  it('returns [] when subclass-granted spells fill the gap', () => {
    // subclassGrantedSlugs provides 1 spell that counts toward known
    const limits = makeLimits({ cantripsKnown: 2, spellsKnown: 7, spellsPrepared: null });
    const value: AppliedClassSpells = {
      cantrips: [ref('dancing-lights'), ref('vicious-mockery')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6'), ref('subclass-spell')],
      prepared: [],
    };
    // subclass-spell is granted, so free limit = 7 - 1 = 6, free count = 6 ✓
    expect(validateSpellsPick(limits, ['subclass-spell'], value)).toEqual([]);
  });
});

// ── Wizard caster (mode: 'wizard') ──────────────────────────────────────────

describe('validateSpellsPick — wizard caster', () => {
  // Wizard L2: spellbook size = 8 (6 base + 2 per level after L1 = 6 + 2 = 8)
  const wizardLimits = makeLimits({
    cantripsKnown: 3,
    spellsKnown: null,
    spellsPrepared: null,
    wizardSpellbookSize: 8,
  });

  it('returns [] when spellbook has exactly wizardSpellbookSize entries', () => {
    const value: AppliedClassSpells = {
      cantrips: [ref('fire-bolt'), ref('light'), ref('prestidigitation')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6'), ref('s7'), ref('s8')],
      prepared: [],
    };
    expect(validateSpellsPick(wizardLimits, [], value)).toEqual([]);
  });

  it('returns SPELLS_PREPARED_COUNT_MISMATCH (or similar) when spellbook is under limit', () => {
    // Wizard spellbook pre-seeded size=6 with limit=8 → needs 2 more
    const value: AppliedClassSpells = {
      cantrips: [ref('fire-bolt'), ref('light'), ref('prestidigitation')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6')], // 6 of 8
      prepared: [],
    };
    const issues = validateSpellsPick(wizardLimits, [], value);
    expect(issues.length).toBeGreaterThan(0);
    // Any mismatch code is acceptable — SPELLS_KNOWN_COUNT_MISMATCH or SPELLS_PREPARED_COUNT_MISMATCH
    const validCodes = ['SPELLS_KNOWN_COUNT_MISMATCH', 'SPELLS_PREPARED_COUNT_MISMATCH', 'CANTRIPS_COUNT_MISMATCH'];
    expect(validCodes).toContain(issues[0]?.code);
  });
});

// ── Prepared caster (mode: 'prep') ────────────────────────────────────────

describe('validateSpellsPick — prepared caster (Cleric/Druid/Paladin)', () => {
  const prepLimits = makeLimits({ cantripsKnown: 2, spellsKnown: null, spellsPrepared: 4 });

  it('returns [] when prepared matches limit exactly', () => {
    const value: AppliedClassSpells = {
      cantrips: [ref('guidance'), ref('sacred-flame')],
      known: [],
      prepared: [ref('bless'), ref('cure-wounds'), ref('healing-word'), ref('shield-of-faith')],
    };
    expect(validateSpellsPick(prepLimits, [], value)).toEqual([]);
  });

  it('returns SPELLS_PREPARED_COUNT_MISMATCH when prepared count is below limit', () => {
    const value: AppliedClassSpells = {
      cantrips: [ref('guidance'), ref('sacred-flame')],
      known: [],
      prepared: [ref('bless'), ref('cure-wounds'), ref('healing-word')], // 3 of 4
    };
    const issues = validateSpellsPick(prepLimits, [], value);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.code).toBe('SPELLS_PREPARED_COUNT_MISMATCH');
  });
});

// ── Level-up specific scenarios ────────────────────────────────────────────

describe('validateSpellsPick — level-up scenarios', () => {
  it('Bard L3→L4: pre-seeded 6 known, limit=7 → returns SPELLS_KNOWN_COUNT_MISMATCH', () => {
    // PHB p.53 Bard table: L3 = 6 known, L4 = 7 known
    const limits = makeLimits({ cantripsKnown: 2, spellsKnown: 7, spellsPrepared: null });
    const value: AppliedClassSpells = {
      cantrips: [ref('dancing-lights'), ref('vicious-mockery')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6')],
      prepared: [],
    };
    const issues = validateSpellsPick(limits, [], value);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.code).toBe('SPELLS_KNOWN_COUNT_MISMATCH');
  });

  it('Wizard L1→L2: spellbook pre-seeded size=6 with limit=8 → returns mismatch issue', () => {
    // PHB p.114: Wizard L1 = 6 spells (starting), L2 = 6 + 2 = 8
    const limits = makeLimits({
      cantripsKnown: 3,
      spellsKnown: null,
      spellsPrepared: null,
      wizardSpellbookSize: 8,
    });
    const value: AppliedClassSpells = {
      cantrips: [ref('fire-bolt'), ref('light'), ref('prestidigitation')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6')],
      prepared: [],
    };
    const issues = validateSpellsPick(limits, [], value);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('All values at cap → returns [] (valid)', () => {
    const limits = makeLimits({ cantripsKnown: 2, spellsKnown: 7, spellsPrepared: null });
    const value: AppliedClassSpells = {
      cantrips: [ref('c1'), ref('c2')],
      known: [ref('s1'), ref('s2'), ref('s3'), ref('s4'), ref('s5'), ref('s6'), ref('s7')],
      prepared: [],
    };
    expect(validateSpellsPick(limits, [], value)).toEqual([]);
  });
});

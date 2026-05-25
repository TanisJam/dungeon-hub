/**
 * Component tests for SpellsPickerProps — school decode + R/C/M badges + filter chips + collapse.
 *
 * REQ-SP02-WEB-SCHOOL-DECODE: titleCase(spell.school) → decodeSchool(spell.school)
 * REQ-SP02-WEB-BADGES: R/C/M badge presence for ritual/concentration/componentsM
 * REQ-SP03-FILTER-RITUAL: Ritual chip narrows visible spells (spec #689 SP03-S1)
 * REQ-SP03-FILTER-CONCENTRATION: Concentration chip narrows visible spells (spec #689 SP03-S2)
 * REQ-SP03-COLLAPSE-DEFAULT: Lowest non-empty level open, others closed (spec #689 SP03-S5,S6)
 * REQ-SP03-COUNTER-CONSISTENCY: Counters read selection sets, not filtered rows (spec #689 SP03-S8)
 *
 * Spec #680, Scenario SP02-S7:
 *   GIVEN a spell with school "V" (Evocation) and ritual=true, concentration=true
 *   WHEN the SpellRow renders
 *   THEN school text reads "Evocation" (not "V")
 *   AND "R" badge is visible, "C" badge is visible
 *
 * Mobile-first: badges are single-char (R/C/M) to fit at 375px.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock next/navigation to prevent router errors in component tests
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/characters/test-id/wizard/spells',
}));

vi.mock('./actions', () => ({
  saveSpells: vi.fn().mockResolvedValue(undefined),
}));

import { SpellsPickerProps, SpellsPicker } from './_picker';

const makeLimits = (overrides = {}) => ({
  cantripsKnown: 2,
  spellsKnown: null,
  spellsPrepared: 4,
  maxSpellLevel: 5,
  ability: 'wis' as const,
  ...overrides,
});

const makeSpell = (overrides: Partial<{
  slug: string;
  source: string;
  name: string;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  componentsMCost: number | null;
}> = {}) => ({
  slug: 'test-spell',
  source: 'PHB',
  name: 'Test Spell',
  level: 1,
  school: 'A',
  ritual: false,
  concentration: false,
  componentsM: false,
  componentsMCost: null,
  ...overrides,
});

const defaultProps: SpellsPickerProps = {
  characterId: 'char-1',
  classSlug: 'cleric',
  classSource: 'PHB',
  limits: makeLimits(),
  availableSpells: [],
  subclassGrantedSlugs: [],
  initialSpells: { cantrips: [], known: [], prepared: [] },
};

describe('SpellsPicker — school decode (REQ-SP02-WEB-SCHOOL-DECODE)', () => {
  it('renders "Evocation" for school code "V" (not raw "V")', () => {
    const spell = makeSpell({ slug: 'fireball', school: 'V', level: 3, name: 'Fireball' });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    // "Evocation" must appear, raw "V" should not appear as the school label
    expect(screen.getAllByText('Evocation').length).toBeGreaterThan(0);
  });

  it('renders "Enchantment" for school code "E" (not raw "E")', () => {
    const spell = makeSpell({ slug: 'charm-person', school: 'E', level: 1, name: 'Charm Person' });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.getAllByText('Enchantment').length).toBeGreaterThan(0);
  });

  it('renders "Abjuration" for school code "A"', () => {
    const spell = makeSpell({ slug: 'shield', school: 'A', level: 1, name: 'Shield' });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.getAllByText('Abjuration').length).toBeGreaterThan(0);
  });
});

describe('SpellsPicker — R/C/M badges (REQ-SP02-WEB-BADGES)', () => {
  it('renders "R" badge when ritual=true', () => {
    const spell = makeSpell({ slug: 'identify', name: 'Identify', ritual: true });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.getByText('R')).toBeDefined();
  });

  it('does NOT render "R" badge when ritual=false', () => {
    const spell = makeSpell({ slug: 'magic-missile', name: 'Magic Missile', ritual: false });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.queryByText('R')).toBeNull();
  });

  it('renders "C" badge when concentration=true', () => {
    const spell = makeSpell({ slug: 'bless', name: 'Bless', concentration: true });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.getByText('C')).toBeDefined();
  });

  it('does NOT render "C" badge when concentration=false', () => {
    const spell = makeSpell({ slug: 'cure-wounds', name: 'Cure Wounds', concentration: false });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.queryByText('C')).toBeNull();
  });

  it('renders "M" badge when componentsM=true', () => {
    const spell = makeSpell({ slug: 'identify', name: 'Identify', componentsM: true });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.getByText('M')).toBeDefined();
  });

  it('does NOT render "M" badge when componentsM=false', () => {
    const spell = makeSpell({ slug: 'magic-missile', name: 'Magic Missile', componentsM: false });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.queryByText('M')).toBeNull();
  });

  it('renders all 3 badges (R/C/M) for a spell with all flags', () => {
    const spell = makeSpell({
      slug: 'detect-magic',
      name: 'Detect Magic',
      ritual: true,
      concentration: true,
      componentsM: true,
    });
    render(
      <SpellsPicker
        {...defaultProps}
        availableSpells={[spell]}
      />,
    );
    expect(screen.getByText('R')).toBeDefined();
    expect(screen.getByText('C')).toBeDefined();
    expect(screen.getByText('M')).toBeDefined();
  });
});

// ── Filter chips (REQ-SP03-FILTER-RITUAL / REQ-SP03-FILTER-CONCENTRATION) ──

/**
 * Fixture: 5 leveled spells covering all ritual/concentration combos.
 * PHB p.201 (ritual designation) + PHB p.203 (concentration).
 */
const filterFixtureSpells = [
  makeSpell({ slug: 'identify', name: 'Identify', level: 1, ritual: true, concentration: false }),
  makeSpell({ slug: 'detect-magic', name: 'Detect Magic', level: 1, ritual: true, concentration: true }),
  makeSpell({ slug: 'bless', name: 'Bless', level: 1, ritual: false, concentration: true }),
  makeSpell({ slug: 'magic-missile', name: 'Magic Missile', level: 1, ritual: false, concentration: false }),
  makeSpell({ slug: 'shield', name: 'Shield', level: 1, ritual: false, concentration: false }),
];

const filterProps: SpellsPickerProps = {
  ...defaultProps,
  limits: makeLimits({ cantripsKnown: 0, spellsPrepared: 3, maxSpellLevel: 1 }),
  availableSpells: filterFixtureSpells,
};

describe('SpellsPicker — filter chips (REQ-SP03-FILTER-RITUAL, SP03-S1)', () => {
  it('A-RED-1: Ritual chip narrows visible spell rows to ritual=true only', () => {
    render(<SpellsPicker {...filterProps} />);
    // Ritual chip must exist
    const ritualChip = screen.getByRole('button', { name: /ritual/i });
    // Before filter: all 5 spells visible
    expect(screen.getByText('Identify')).toBeDefined();
    expect(screen.getByText('Magic Missile')).toBeDefined();
    // Toggle Ritual chip ON
    fireEvent.click(ritualChip);
    // Only ritual=true spells should remain
    expect(screen.getByText('Identify')).toBeDefined();
    expect(screen.getByText('Detect Magic')).toBeDefined();
    // Non-ritual spells must not render
    expect(screen.queryByText('Magic Missile')).toBeNull();
    expect(screen.queryByText('Bless')).toBeNull();
    expect(screen.queryByText('Shield')).toBeNull();
  });

  it('A-RED-2: Concentration chip narrows visible spell rows to concentration=true only', () => {
    render(<SpellsPicker {...filterProps} />);
    const concChip = screen.getByRole('button', { name: /concentrac/i });
    fireEvent.click(concChip);
    // Only concentration=true spells should remain
    expect(screen.getByText('Detect Magic')).toBeDefined();
    expect(screen.getByText('Bless')).toBeDefined();
    // Non-concentration spells must not render
    expect(screen.queryByText('Identify')).toBeNull();
    expect(screen.queryByText('Magic Missile')).toBeNull();
    expect(screen.queryByText('Shield')).toBeNull();
  });

  it('A-RED-3: Both chips ON = AND intersection (ritual && concentration)', () => {
    render(<SpellsPicker {...filterProps} />);
    const ritualChip = screen.getByRole('button', { name: /ritual/i });
    const concChip = screen.getByRole('button', { name: /concentrac/i });
    fireEvent.click(ritualChip);
    fireEvent.click(concChip);
    // Only ritual && concentration: Detect Magic
    expect(screen.getByText('Detect Magic')).toBeDefined();
    // All others hidden
    expect(screen.queryByText('Identify')).toBeNull();
    expect(screen.queryByText('Bless')).toBeNull();
    expect(screen.queryByText('Magic Missile')).toBeNull();
    expect(screen.queryByText('Shield')).toBeNull();
  });

  it('A-RED-4: Counter unchanged when Ritual chip is ON (REQ-SP03-COUNTER-CONSISTENCY, SP03-S8)', () => {
    // Pre-select 2 non-ritual spells (Bless + Magic Missile) as initial prepared
    const bless = filterFixtureSpells.find((s) => s.slug === 'bless')!;
    const mm = filterFixtureSpells.find((s) => s.slug === 'magic-missile')!;
    const propsWithSelected: SpellsPickerProps = {
      ...filterProps,
      initialSpells: {
        cantrips: [],
        known: [],
        prepared: [
          { slug: bless.slug, source: bless.source },
          { slug: mm.slug, source: mm.source },
        ],
      },
    };
    render(<SpellsPicker {...propsWithSelected} />);
    // Counter shows 2/3 before filter
    expect(screen.getByText('Preparados: 2/3')).toBeDefined();
    // Toggle Ritual chip ON — hides Bless and Magic Missile from view
    const ritualChip = screen.getByRole('button', { name: /ritual/i });
    fireEvent.click(ritualChip);
    // Counter must STILL show 2/3 (selection sets unchanged)
    expect(screen.getByText('Preparados: 2/3')).toBeDefined();
  });
});

/**
 * Component tests for SpellsPickerProps — school decode + R/C/M badges.
 *
 * REQ-SP02-WEB-SCHOOL-DECODE: titleCase(spell.school) → decodeSchool(spell.school)
 * REQ-SP02-WEB-BADGES: R/C/M badge presence for ritual/concentration/componentsM
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
import { render, screen } from '@testing-library/react';

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

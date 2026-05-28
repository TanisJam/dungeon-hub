/**
 * Tests for SpellsStep — level-up spell selection step.
 *
 * REQ-CLU-SPL-STEP-CONDITION: shown only when step-graph includes 'spells'.
 * REQ-CLU-SPL-DOMAIN-VALIDATION: CTA gated by validateSpellsPick from domain.
 * REQ-CLU-XCUT-MOBILE: sticky CTA ≥44px, scroll area above.
 *
 * Data source: availableSpells prop (client-fetched by _flow.tsx, passed as prop).
 * limits prop: computed server-side in page.tsx via computeSpellLimits at toLevel.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpellsStep } from './_spells-step';
import type { SpellLimitsView, AvailableSpell, AppliedClassSpells } from '@/app/characters/[id]/wizard/spells/_picker';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Bard L3→L4: known caster, spellsKnown=7, already has 6 known spells. */
const BARD_LIMITS: SpellLimitsView = {
  cantripsKnown: 2,
  spellsKnown: 7,      // total at L4
  spellsPrepared: null,
  maxSpellLevel: 2,
  ability: 'cha',
};

const BARD_AVAILABLE: AvailableSpell[] = [
  { slug: 'vicious-mockery', source: 'PHB', name: 'Vicious Mockery', level: 0, school: 'enc', ritual: false, concentration: false, componentsM: false, componentsMCost: null },
  { slug: 'healing-word', source: 'PHB', name: 'Healing Word', level: 1, school: 'evo', ritual: false, concentration: false, componentsM: false, componentsMCost: null },
  { slug: 'hold-person', source: 'PHB', name: 'Hold Person', level: 2, school: 'enc', ritual: false, concentration: true, componentsM: false, componentsMCost: null },
  { slug: 'shatter', source: 'PHB', name: 'Shatter', level: 2, school: 'evo', ritual: false, concentration: false, componentsM: false, componentsMCost: null },
];

/** Pre-seeded: 2 cantrips + 6 known (at cap-1 to force picking 1 more). */
const BARD_INITIAL_VALUE: AppliedClassSpells = {
  cantrips: [
    { slug: 'vicious-mockery', source: 'PHB' },
    { slug: 'minor-illusion', source: 'PHB' },
  ],
  known: [
    { slug: 'healing-word', source: 'PHB' },
    { slug: 'spell-b', source: 'PHB' },
    { slug: 'spell-c', source: 'PHB' },
    { slug: 'spell-d', source: 'PHB' },
    { slug: 'spell-e', source: 'PHB' },
    { slug: 'spell-f', source: 'PHB' },
  ],
  prepared: [],
};

const defaultProps = {
  classSlug: 'bard',
  classSource: 'PHB',
  limits: BARD_LIMITS,
  availableSpells: BARD_AVAILABLE,
  subclassGrantedSlugs: [],
  initialValue: BARD_INITIAL_VALUE,
  onContinue: vi.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SpellsStep', () => {
  it('renders SpellsPicker with the given limits and available spells', () => {
    render(<SpellsStep {...defaultProps} />);
    // SpellsPicker renders the known spells list — Healing Word should appear
    expect(screen.getByText('Healing Word')).toBeDefined();
  });

  it('renders a loading state when availableSpells is null', () => {
    render(
      <SpellsStep
        {...defaultProps}
        availableSpells={null}
      />,
    );
    expect(screen.getByText(/cargando|loading/i)).toBeDefined();
  });

  it('CTA is disabled when validateSpellsPick returns issues (not enough picks)', () => {
    // Bard at L4 needs 7 known, but initialValue has only 6 known (cantrips at cap 2).
    // Should be invalid until 1 more known spell is picked.
    render(<SpellsStep {...defaultProps} />);
    const cta = screen.getByRole('button', { name: /confirmar|continuar/i });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
  });

  it('CTA becomes enabled after picking enough spells', () => {
    render(<SpellsStep {...defaultProps} />);

    // Click "Hold Person" (a 2nd-level known spell to add)
    fireEvent.click(screen.getByText('Hold Person'));

    const cta = screen.getByRole('button', { name: /confirmar|continuar/i });
    expect((cta as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onContinue with updated AppliedClassSpells when CTA clicked', () => {
    const onContinue = vi.fn();
    render(<SpellsStep {...defaultProps} onContinue={onContinue} />);

    // Pick Hold Person to satisfy known=7
    fireEvent.click(screen.getByText('Hold Person'));

    const cta = screen.getByRole('button', { name: /confirmar|continuar/i });
    fireEvent.click(cta);

    expect(onContinue).toHaveBeenCalledOnce();
    const arg = onContinue.mock.calls[0]?.[0] as AppliedClassSpells;
    // Should include the 6 pre-seeded + the newly picked Hold Person
    expect(arg.known.some((s) => s.slug === 'hold-person')).toBe(true);
    expect(arg.known.length).toBe(7);
  });

  it('mobile: CTA has min-h-[44px] class', () => {
    render(<SpellsStep {...defaultProps} />);
    const cta = screen.getByRole('button', { name: /confirmar|continuar/i });
    expect(cta.className).toContain('min-h-[44px]');
  });
});

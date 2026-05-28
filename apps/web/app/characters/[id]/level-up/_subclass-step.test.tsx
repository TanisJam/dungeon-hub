/**
 * Tests for SubclassStep — level-up subclass selection step.
 *
 * REQ-CLU-SUB-UNLOCK-CONDITION: step renders subclass options from props.
 * REQ-CLU-SUB-UI-MOBILE: cards min-h-[80px], CTA min-h-[44px], tap-card pattern.
 * REQ-CLU-XCUT-MOBILE: 375px viewport verified via class assertions.
 *
 * Data source: rows prop (pre-fetched server-side in page.tsx, passed down).
 * No client fetch on mount.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubclassStep } from './_subclass-step';
import type { SubclassRow } from '@/app/characters/[id]/wizard/class/_picker';

const rows: SubclassRow[] = [
  { id: '1', slug: 'cleric--life', source: 'PHB', name: 'Life Domain', classSlug: 'cleric', classSource: 'PHB' },
  { id: '2', slug: 'cleric--light', source: 'PHB', name: 'Light Domain', classSlug: 'cleric', classSource: 'PHB' },
];

const defaultProps = {
  selectedClass: { slug: 'cleric', source: 'PHB' },
  subclassTitle: 'Dominio divino',
  rows,
  onContinue: vi.fn(),
};

describe('SubclassStep', () => {
  it('renders subclass cards from rows prop', () => {
    render(<SubclassStep {...defaultProps} />);
    expect(screen.getByText('Life Domain')).toBeDefined();
    expect(screen.getByText('Light Domain')).toBeDefined();
  });

  it('renders subclass title heading', () => {
    render(<SubclassStep {...defaultProps} />);
    const matches = screen.getAllByText(/Dominio divino/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('CTA is disabled until a card is selected', () => {
    render(<SubclassStep {...defaultProps} />);
    const cta = screen.getByRole('button', { name: /confirmar|continuar/i });
    expect(cta).toBeDefined();
    expect((cta as HTMLButtonElement).disabled).toBe(true);
  });

  it('selecting a card enables CTA and calls onContinue with slug+source', () => {
    const onContinue = vi.fn();
    render(<SubclassStep {...defaultProps} onContinue={onContinue} />);

    // Click the first card
    fireEvent.click(screen.getByText('Life Domain'));

    // CTA should now be enabled
    const cta = screen.getByRole('button', { name: /confirmar|continuar/i });
    expect((cta as HTMLButtonElement).disabled).toBe(false);

    // Click CTA
    fireEvent.click(cta);
    expect(onContinue).toHaveBeenCalledWith({ slug: 'cleric--life', source: 'PHB' });
  });

  it('renders loading state when rows prop is null', () => {
    render(
      <SubclassStep
        {...defaultProps}
        rows={null}
      />,
    );
    // Should show some loading indicator when rows is null
    expect(screen.getByText(/cargando|loading/i)).toBeDefined();
  });

  it('mobile: cards have min-h-[80px] class', () => {
    render(<SubclassStep {...defaultProps} />);
    // Check that the card buttons have the correct mobile sizing class
    const cardButtons = screen.getAllByRole('button');
    const cardButton = cardButtons.find((b) => b.textContent?.includes('Life Domain'));
    expect(cardButton?.className).toContain('min-h-[80px]');
  });

  it('mobile: CTA has min-h-[44px] class', () => {
    render(<SubclassStep {...defaultProps} />);
    const cta = screen.getByRole('button', { name: /confirmar|continuar/i });
    expect(cta.className).toContain('min-h-[44px]');
  });
});

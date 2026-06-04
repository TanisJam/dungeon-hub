/**
 * Tests for SectionAffordance — Dedup 2 (Tier 1 homogenization).
 *
 * Extracts the triplicate pencil-button + ViewOnlySectionSheet pattern
 * shared by BackgroundSection, ClassSection, and RaceSection.
 *
 * T1: Renders a pencil edit button with the provided aria-label.
 * T2: Pencil button click opens the ViewOnlySectionSheet (dialog visible).
 * T3: Sheet title matches the provided title prop.
 * T4: display children are rendered inside the sheet.
 * T5: The pencil button has the correct styling classes (h-8 w-8 affordance).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { SectionAffordance } from './section-affordance';

const baseProps = {
  ariaLabel: 'Editar trasfondo',
  title: 'Trasfondo',
  characterStatus: 'draft' as const,
  isDm: false,
  wizardStepHref: '/characters/char-1/wizard/background',
};

describe('SectionAffordance', () => {
  it('T1: renders pencil button with the given aria-label', () => {
    render(
      <SectionAffordance {...baseProps}>
        <p>Display content</p>
      </SectionAffordance>,
    );
    expect(screen.getByRole('button', { name: 'Editar trasfondo' })).toBeTruthy();
  });

  it('T2: clicking pencil opens the sheet (dialog visible)', () => {
    render(
      <SectionAffordance {...baseProps}>
        <p>Display content</p>
      </SectionAffordance>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar trasfondo' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('T3: sheet title matches the title prop', () => {
    render(
      <SectionAffordance {...baseProps}>
        <p>Display content</p>
      </SectionAffordance>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar trasfondo' }));
    expect(screen.getByText('Trasfondo')).toBeTruthy();
  });

  it('T4: display children are rendered inside the opened sheet', () => {
    render(
      <SectionAffordance {...baseProps}>
        <p>My section display</p>
      </SectionAffordance>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar trasfondo' }));
    expect(screen.getByText('My section display')).toBeTruthy();
  });

  it('T5: pencil button has correct styling classes', () => {
    render(
      <SectionAffordance {...baseProps}>
        <p>Display content</p>
      </SectionAffordance>,
    );
    const btn = screen.getByRole('button', { name: 'Editar trasfondo' });
    expect(btn.className).toContain('h-8');
    expect(btn.className).toContain('w-8');
  });
});

/**
 * Tests for BackgroundSection — pencil affordance + ViewOnlySectionSheet wrapper.
 *
 * T1: Pencil button with aria-label "Editar trasfondo" is present.
 * T2: Click pencil → ViewOnlySectionSheet opens (sheet title visible).
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

import { BackgroundSection } from './background-section';

const baseProps = {
  characterId: 'char-1',
  characterStatus: 'active' as const,
  isDm: false,
  backgroundName: 'Sabio',
  skillProficiencies: ['arcana', 'historia'],
};

describe('BackgroundSection', () => {
  it('T1: pencil button with aria-label "Editar trasfondo" is present', () => {
    render(<BackgroundSection {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Editar trasfondo' })).toBeTruthy();
  });

  it('T2: click pencil → ViewOnlySectionSheet opens (title "Trasfondo" visible)', () => {
    render(<BackgroundSection {...baseProps} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar trasfondo' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Trasfondo')).toBeTruthy();
  });
});

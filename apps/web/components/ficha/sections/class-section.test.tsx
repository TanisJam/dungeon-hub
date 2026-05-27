/**
 * Tests for ClassSection — pencil affordance + ViewOnlySectionSheet wrapper.
 *
 * T1: Pencil button with aria-label "Editar clase" is present.
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

import { ClassSection } from './class-section';

const baseProps = {
  characterId: 'char-1',
  characterStatus: 'active' as const,
  isDm: false,
  classes: [{ slug: 'wizard', level: 5 }],
};

describe('ClassSection', () => {
  it('T1: pencil button with aria-label "Editar clase" is present', () => {
    render(<ClassSection {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Editar clase' })).toBeTruthy();
  });

  it('T2: click pencil → ViewOnlySectionSheet opens (title "Clase" visible)', () => {
    render(<ClassSection {...baseProps} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar clase' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Clase')).toBeTruthy();
  });
});

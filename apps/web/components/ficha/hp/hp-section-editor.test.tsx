/**
 * Tests for HPSectionEditor — pencil affordance + V3Sheet wrapper for HP editing.
 *
 * T1: Pencil button renders with aria-label "Editar HP".
 * T2: Click pencil → HPEditor mounts inside V3Sheet dialog.
 * T3: HPSectionEditor passes isDmHere prop to HPEditor.
 *
 * Spec: sdd/ficha-dm-affordances #995 — HPEditor Component
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock createPortal for V3Sheet
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock HPEditor to track isDmHere prop
vi.mock('./hp-editor', () => ({
  HPEditor: ({ isDmHere }: { isDmHere: boolean }) => (
    <div data-testid="hp-editor" data-isdmhere={String(isDmHere)}>
      HP Editor
    </div>
  ),
}));

import { HPSectionEditor } from './hp-section-editor';

const defaultProps = {
  characterId: 'char-1',
  currentHp: { current: 10, max: 20, temp: 2 },
  isDmHere: false,
};

describe('HPSectionEditor', () => {
  it('T1: pencil button renders with aria-label "Editar HP"', () => {
    render(<HPSectionEditor {...defaultProps} />);
    const btn = screen.getByRole('button', { name: 'Editar HP' });
    expect(btn).toBeTruthy();
  });

  it('T2: click pencil → HPEditor mounts inside dialog', () => {
    render(<HPSectionEditor {...defaultProps} />);

    expect(screen.queryByTestId('hp-editor')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Editar HP' }));

    expect(screen.getByTestId('hp-editor')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('T3: isDmHere=true is forwarded to HPEditor', () => {
    render(<HPSectionEditor {...defaultProps} isDmHere={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar HP' }));

    const editor = screen.getByTestId('hp-editor');
    expect(editor.getAttribute('data-isdmhere')).toBe('true');
  });
});

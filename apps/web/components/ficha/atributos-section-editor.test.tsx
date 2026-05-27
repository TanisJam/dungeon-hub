/**
 * Tests for AtributosSectionEditor — pencil affordance + V3Sheet host.
 *
 * T1: Pencil button with aria-label "Editar atributos" is present.
 * T2: Click pencil → V3Sheet content becomes visible (dialog rendered).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock createPortal for V3Sheet
import { createPortal } from 'react-dom';
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock saveAtributos action — not needed for these tests (pencil/open only)
vi.mock('./save-atributos-action', () => ({
  saveAtributos: vi.fn().mockResolvedValue({ ok: true }),
}));

import { AtributosSectionEditor } from './atributos-section-editor';

const defaultStats = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };

describe('AtributosSectionEditor', () => {
  it('T1: pencil button with aria-label "Editar atributos" is present', () => {
    render(
      <AtributosSectionEditor
        characterId="char-1"
        currentStats={defaultStats}
        currentMethod="point-buy"
        statusLocked={false}
        isDm={false}
      />,
    );
    const pencilBtn = screen.getByRole('button', { name: 'Editar atributos' });
    expect(pencilBtn).toBeTruthy();
  });

  it('T2: click pencil → V3Sheet dialog becomes visible', () => {
    render(
      <AtributosSectionEditor
        characterId="char-1"
        currentStats={defaultStats}
        currentMethod="point-buy"
        statusLocked={false}
        isDm={false}
      />,
    );
    // Sheet should NOT be open before click
    expect(screen.queryByRole('dialog')).toBeNull();

    const pencilBtn = screen.getByRole('button', { name: 'Editar atributos' });
    fireEvent.click(pencilBtn);

    // Sheet should now be visible
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

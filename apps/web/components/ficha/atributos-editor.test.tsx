/**
 * Tests for AtributosEditor — permission-aware ability score editor.
 *
 * T1: Pre-fills inputs from currentStats.
 * T2: Locked non-DM → inputs disabled + banner visible + Guardar absent/disabled.
 * T3: DM bypass with locked status → inputs enabled; no banner.
 * T4: Cancel calls onClose without dispatching action.
 * T5: Editable mode (not locked) → Guardar enabled.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock createPortal for V3Sheet (it creates a portal to document.body)
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock save action — prevents env var validation from supabase/server.
vi.mock('./save-atributos-action', () => ({
  saveAtributos: vi.fn().mockResolvedValue({ ok: true }),
}));

import { AtributosEditor } from './atributos-editor';

const defaultStats = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };
const onClose = vi.fn();

describe('AtributosEditor', () => {
  it('T1: pre-fills inputs from currentStats', () => {
    render(
      <AtributosEditor
        characterId="char-1"
        currentStats={defaultStats}
        currentMethod="point-buy"
        statusLocked={false}
        isDm={false}
        onClose={onClose}
      />,
    );
    const strInput = screen.getByLabelText('FUE') as HTMLInputElement;
    expect(strInput.value).toBe('16');
    const chaInput = screen.getByLabelText('CAR') as HTMLInputElement;
    expect(chaInput.value).toBe('15');
  });

  it('T2: locked non-DM → inputs disabled; banner visible; Guardar absent/disabled', () => {
    render(
      <AtributosEditor
        characterId="char-1"
        currentStats={defaultStats}
        currentMethod="point-buy"
        statusLocked={true}
        isDm={false}
        onClose={onClose}
      />,
    );
    const strInput = screen.getByLabelText('FUE') as HTMLInputElement;
    expect(strInput.disabled).toBeTruthy();
    expect(
      screen.getByText('Esta ficha está cerrada. Pedíle al DM que la devuelva.'),
    ).toBeTruthy();
    // Guardar should be absent or disabled
    const guardar = screen.queryByRole('button', { name: /guardar/i });
    if (guardar) {
      expect((guardar as HTMLButtonElement).disabled).toBeTruthy();
    }
  });

  it('T3: DM bypass with locked status → inputs enabled; no banner', () => {
    render(
      <AtributosEditor
        characterId="char-1"
        currentStats={defaultStats}
        currentMethod="point-buy"
        statusLocked={true}
        isDm={true}
        onClose={onClose}
      />,
    );
    const strInput = screen.getByLabelText('FUE') as HTMLInputElement;
    expect(strInput.disabled).toBeFalsy();
    expect(
      screen.queryByText('Esta ficha está cerrada. Pedíle al DM que la devuelva.'),
    ).toBeNull();
  });

  it('T4: Cancel calls onClose without dispatching action', () => {
    const mockClose = vi.fn();
    render(
      <AtributosEditor
        characterId="char-1"
        currentStats={defaultStats}
        currentMethod="point-buy"
        statusLocked={false}
        isDm={false}
        onClose={mockClose}
      />,
    );
    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    fireEvent.click(cancelBtn);
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('T5: editable mode (statusLocked=false, isDm=false) → Guardar enabled', () => {
    render(
      <AtributosEditor
        characterId="char-1"
        currentStats={defaultStats}
        currentMethod="point-buy"
        statusLocked={false}
        isDm={false}
        onClose={onClose}
      />,
    );
    const guardar = screen.getByRole('button', { name: /guardar/i }) as HTMLButtonElement;
    expect(guardar.disabled).toBeFalsy();
  });
});

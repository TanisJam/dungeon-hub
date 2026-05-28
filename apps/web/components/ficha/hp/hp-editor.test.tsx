/**
 * Tests for HPEditor — dual-mode HP form (player vs DM).
 *
 * T1: DM mode → all 3 inputs enabled + "DM Override" badge visible.
 * T2: Player mode → max input is read-only with hint text.
 * T3: Player mode → current + temp inputs are enabled.
 * T4: Submit calls saveHp with correct characterId and hp values.
 * T5: Save success → onClose called.
 *
 * Spec: sdd/ficha-dm-affordances #995 — HPEditor Component
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock save action
vi.mock('./save-hp-action', () => ({
  saveHp: vi.fn().mockResolvedValue({ ok: true }),
}));

import { saveHp } from './save-hp-action';
import { HPEditor } from './hp-editor';

const defaultHp = { current: 10, max: 20, temp: 2 };
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HPEditor', () => {
  it('T1: DM mode → all 3 inputs enabled + "DM Override" badge visible', () => {
    render(
      <HPEditor
        characterId="char-1"
        currentHp={defaultHp}
        isDmHere={true}
        onClose={onClose}
      />,
    );

    const currentInput = screen.getByLabelText('HP actual') as HTMLInputElement;
    const maxInput = screen.getByLabelText('HP máximo') as HTMLInputElement;
    const tempInput = screen.getByLabelText('HP temporal') as HTMLInputElement;

    expect(currentInput.readOnly).toBeFalsy();
    expect(maxInput.readOnly).toBeFalsy();
    expect(tempInput.readOnly).toBeFalsy();
    expect(screen.getByTestId('dm-override-badge')).toBeTruthy();
  });

  it('T2: player mode → max input is read-only with hint text', () => {
    render(
      <HPEditor
        characterId="char-1"
        currentHp={defaultHp}
        isDmHere={false}
        onClose={onClose}
      />,
    );

    const maxInput = screen.getByLabelText('HP máximo') as HTMLInputElement;
    expect(maxInput.readOnly).toBeTruthy();
    expect(screen.getByText('Solo el DM puede ajustar el máximo')).toBeTruthy();
    expect(screen.queryByTestId('dm-override-badge')).toBeNull();
  });

  it('T3: player mode → current + temp inputs are enabled', () => {
    render(
      <HPEditor
        characterId="char-1"
        currentHp={defaultHp}
        isDmHere={false}
        onClose={onClose}
      />,
    );

    const currentInput = screen.getByLabelText('HP actual') as HTMLInputElement;
    const tempInput = screen.getByLabelText('HP temporal') as HTMLInputElement;

    expect(currentInput.readOnly).toBeFalsy();
    expect(tempInput.readOnly).toBeFalsy();
  });

  it('T4: submit calls saveHp with correct characterId and hp values', async () => {
    (saveHp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    render(
      <HPEditor
        characterId="char-1"
        currentHp={defaultHp}
        isDmHere={false}
        onClose={onClose}
      />,
    );

    // Change current HP
    const currentInput = screen.getByLabelText('HP actual');
    fireEvent.change(currentInput, { target: { value: '5' } });

    const submitBtn = screen.getByRole('button', { name: /guardar/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(saveHp).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 'char-1', current: 5 }),
    );
  });

  it('T5: save success → onClose called', async () => {
    (saveHp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    render(
      <HPEditor
        characterId="char-1"
        currentHp={defaultHp}
        isDmHere={false}
        onClose={onClose}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /guardar/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});

/**
 * Component tests for RestActions — Short Rest + Long Rest at sheet header.
 *
 * Short rest: PHB p.186 + p.107 — restores warlock pact slots only.
 * Long rest: PHB p.186 — restores HP + half hit dice + all spell slots.
 *
 * Long rest is a destructive-feeling action (resets HP, hit dice, slots), so the
 * button MUST surface a window.confirm() before firing the action.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RestActions } from './_rest-actions';

vi.mock('./actions', () => ({
  shortRest: vi.fn().mockResolvedValue({ ok: true }),
  longRest: vi.fn().mockResolvedValue({ ok: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RestActions', () => {
  it('renders both Descanso corto and Descanso largo buttons', () => {
    render(<RestActions charId="char-1" />);
    expect(screen.getByText('Descanso corto')).toBeTruthy();
    expect(screen.getByText('Descanso largo')).toBeTruthy();
  });

  it('both buttons have min-h-[44px] class for mobile touch target (a11y mobile lock)', () => {
    render(<RestActions charId="char-1" />);
    const shortBtn = screen.getByRole('button', { name: 'Descanso corto' });
    const longBtn = screen.getByRole('button', { name: 'Descanso largo' });
    expect(shortBtn.className).toContain('min-h-[44px]');
    expect(longBtn.className).toContain('min-h-[44px]');
  });

  it('clicking short rest calls shortRest with charId', async () => {
    const { shortRest } = await import('./actions');
    render(<RestActions charId="char-1" />);

    fireEvent.click(screen.getByText('Descanso corto'));

    await vi.waitFor(() => {
      expect(shortRest).toHaveBeenCalledWith('char-1');
    });
  });

  it('long rest prompts for confirmation; cancel → no action', async () => {
    const { longRest } = await import('./actions');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<RestActions charId="char-1" />);
    fireEvent.click(screen.getByText('Descanso largo'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(longRest).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('long rest prompts for confirmation; accept → calls longRest', async () => {
    const { longRest } = await import('./actions');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<RestActions charId="char-1" />);
    fireEvent.click(screen.getByText('Descanso largo'));

    await vi.waitFor(() => {
      expect(longRest).toHaveBeenCalledWith('char-1');
    });
    confirmSpy.mockRestore();
  });
});

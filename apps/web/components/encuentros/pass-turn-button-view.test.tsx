/**
 * Tests for PassTurnButtonView — pure presentational layer.
 * REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02
 *
 * All assertions are prop-driven: no SA mocks, no useRouter needed.
 * PHB p.189 — "Pasar Turno" is a player convenience action that ends their turn.
 * Mobile-first 375px: full-width button with ≥44px touch target.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PassTurnButtonView } from './pass-turn-button-view';

const BASE_PROPS = {
  isDisabled: false,
  pending: false,
  actionError: null,
  onPass: vi.fn(),
};

describe('PassTurnButtonView — presentational', () => {
  // (a) Renders "Pasar Turno" button
  it('(a) renders "Pasar Turno" button', () => {
    render(<PassTurnButtonView {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /pasar turno/i })).toBeTruthy();
  });

  // (b) Button has w-full min-h-[44px] touch target (mobile-first 375px — CLAUDE.md §2)
  it('(b) button has w-full min-h-[44px] touch target class', () => {
    render(<PassTurnButtonView {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect(btn.className).toContain('w-full');
    expect(btn.className).toContain('min-h-[44px]');
  });

  // (c) Button has aria-label="Pasar turno"
  it('(c) button has aria-label="Pasar turno"', () => {
    render(<PassTurnButtonView {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect(btn.getAttribute('aria-label')).toBe('Pasar turno');
  });

  // (d) isDisabled===true → button disabled
  it('(d) isDisabled===true → button is disabled', () => {
    render(<PassTurnButtonView {...BASE_PROPS} isDisabled={true} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (e) pending===true → button disabled
  it('(e) pending===true → button is disabled', () => {
    render(<PassTurnButtonView {...BASE_PROPS} pending={true} isDisabled={false} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (f) isDisabled===false + pending===false → button enabled
  it('(f) isDisabled===false + pending===false → button is enabled', () => {
    render(<PassTurnButtonView {...BASE_PROPS} isDisabled={false} pending={false} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  // actionError → FormErrorAlert rendered
  it('actionError renders an alert element', () => {
    render(<PassTurnButtonView {...BASE_PROPS} actionError="Error al pasar el turno." />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Error al pasar el turno.');
  });

  // onPass called when button clicked
  it('clicking button calls onPass', () => {
    const onPass = vi.fn();
    render(<PassTurnButtonView {...BASE_PROPS} onPass={onPass} />);
    fireEvent.click(screen.getByRole('button', { name: /pasar turno/i }));
    expect(onPass).toHaveBeenCalledTimes(1);
  });
});

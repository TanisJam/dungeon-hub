/**
 * Tests for RageControlsView — pure presentational layer.
 * REQ-WCR-WEB-UI-01
 *
 * All assertions are prop-driven: no SA mocks, no useRouter needed.
 * PHB p.48 — Rage: enter/end as a bonus action on own turn.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RageControlsView } from './rage-controls-view';

const BASE_PROPS = {
  isRaging: false,
  isDisabled: false,
  pending: false,
  actionError: null,
  toastMessage: null,
  rageUnlimited: false,
  rageUsesRemaining: 2,
  rageMax: 3,
  onToggle: vi.fn(),
};

describe('RageControlsView — presentational', () => {
  // (a) Counter shows "X / Y usos de Furia" (PHB p.48 rage uses table)
  it('(a) renders counter: "X / Y usos de Furia"', () => {
    render(<RageControlsView {...BASE_PROPS} rageUsesRemaining={2} rageMax={3} />);
    expect(screen.getByText(/usos de Furia/i)).toBeTruthy();
    expect(screen.getByText(/2/)).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy();
  });

  // (b) rageUnlimited → counter shows "Ilimitado" (PHB p.48 — Unlimited at L20)
  it('(b) rageUnlimited → counter shows "Ilimitado"', () => {
    render(<RageControlsView {...BASE_PROPS} rageUnlimited={true} />);
    expect(screen.getByText(/ilimitado/i)).toBeTruthy();
    expect(screen.queryByText(/999/)).toBeNull();
  });

  // (c) isDisabled passthrough → button disabled
  it('(c) isDisabled===true → button is disabled', () => {
    render(<RageControlsView {...BASE_PROPS} isDisabled={true} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (d) pending===true → button disabled even when isDisabled===false
  it('(d) pending===true → button is disabled', () => {
    render(<RageControlsView {...BASE_PROPS} pending={true} isDisabled={false} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (e) isRaging===false → shows "Entrar en Furia"
  it('(e) isRaging===false → shows "Entrar en Furia" button', () => {
    render(<RageControlsView {...BASE_PROPS} isRaging={false} />);
    expect(screen.getByRole('button', { name: /entrar en furia/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /terminar furia/i })).toBeNull();
  });

  // (f) isRaging===true → shows "Terminar Furia" (PHB p.48 — end rage as bonus action)
  it('(f) isRaging===true → shows "Terminar Furia" button', () => {
    render(<RageControlsView {...BASE_PROPS} isRaging={true} />);
    const btn = screen.getByRole('button', { name: /terminar furia/i });
    expect(btn).toBeTruthy();
    expect(screen.queryByRole('button', { name: /entrar en furia/i })).toBeNull();
  });

  // Button has ≥44px touch target (mobile-first 375px — CLAUDE.md §2)
  it('button has min-h-[44px] touch target class', () => {
    render(<RageControlsView {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect(btn.className).toContain('min-h-[44px]');
  });

  // actionError → FormErrorAlert rendered
  it('actionError renders an alert element', () => {
    render(<RageControlsView {...BASE_PROPS} actionError="Error al cambiar estado de Furia." />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Error al cambiar estado de Furia.');
  });

  // onToggle called when button clicked
  it('clicking button calls onToggle', () => {
    const onToggle = vi.fn();
    render(<RageControlsView {...BASE_PROPS} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /entrar en furia/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

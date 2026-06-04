/**
 * Tests for PassTurnButton client island — REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02.
 *
 * PHB p.189 — "Pasar Turno" is a player convenience action that ends their turn.
 * Mobile-first 375px: full-width button with ≥44px touch target.
 *
 * Mirrors rage-controls.test.tsx pattern (vi.mock for Server Actions + useRouter).
 * REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PassTurnButton } from './pass-turn-button';

// Server Actions mocked — not available in jsdom context.
vi.mock('@/app/encuentros/[id]/actions', () => ({
  passTurn: vi.fn().mockResolvedValue({ ok: true }),
}));

// useRouter for VERSION_CONFLICT router.refresh()
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { passTurn } from '@/app/encuentros/[id]/actions';

const BASE_PROPS = {
  encounterId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  combatantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  version: 1,
  isOwnTurn: true,
};

describe('PassTurnButton — REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02', () => {
  beforeEach(() => vi.clearAllMocks());

  // (a) Renders "Pasar Turno" button
  it('(a) renders "Pasar Turno" button', () => {
    render(<PassTurnButton {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /pasar turno/i })).toBeTruthy();
  });

  // (b) Button has w-full min-h-[44px] touch target (mobile-first 375px — CLAUDE.md §2)
  it('(b) button has w-full min-h-[44px] touch target class', () => {
    render(<PassTurnButton {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect(btn.className).toContain('w-full');
    expect(btn.className).toContain('min-h-[44px]');
  });

  // (c) Button has aria-label="Pasar turno"
  it('(c) button has aria-label="Pasar turno"', () => {
    render(<PassTurnButton {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect(btn.getAttribute('aria-label')).toBe('Pasar turno');
  });

  // (d) isOwnTurn===false → button disabled
  it('(d) isOwnTurn===false → button is disabled', () => {
    render(<PassTurnButton {...BASE_PROPS} isOwnTurn={false} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (e) isOwnTurn===true → button enabled
  it('(e) isOwnTurn===true → button is enabled', () => {
    render(<PassTurnButton {...BASE_PROPS} isOwnTurn={true} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  // (f) Click calls passTurn with correct args
  it('(f) click calls passTurn with encounterId, combatantId, version', async () => {
    vi.mocked(passTurn).mockResolvedValue({ ok: true });
    render(<PassTurnButton {...BASE_PROPS} version={5} />);
    fireEvent.click(screen.getByRole('button', { name: /pasar turno/i }));

    await waitFor(() => {
      expect(passTurn).toHaveBeenCalledWith(
        BASE_PROPS.encounterId,
        BASE_PROPS.combatantId,
        5,
      );
    });
  });

  // (g) VERSION_CONFLICT → router.refresh() called
  it('(g) VERSION_CONFLICT from passTurn → router.refresh() called', async () => {
    vi.mocked(passTurn).mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
    } as never);
    mockRefresh.mockClear();

    render(<PassTurnButton {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /pasar turno/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // (h) FORBIDDEN → inline error rendered
  it('(h) FORBIDDEN from passTurn → inline error message renders', async () => {
    vi.mocked(passTurn).mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
    } as never);

    render(<PassTurnButton {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /pasar turno/i }));

    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toContain('No tienes permiso para realizar esta acción.');
  });
});

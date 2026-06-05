/**
 * Tests for PassTurnButtonIsland — container layer.
 * REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02
 *
 * Covers: isDisabled derivation from isOwnTurn, SA wiring (passTurn),
 * VERSION_CONFLICT → router.refresh(), FORBIDDEN → inline error.
 * PHB p.189 — "Pasar Turno" is a player convenience action that ends their turn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PassTurnButtonIsland } from './pass-turn-button-island';

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

describe('PassTurnButtonIsland — container', () => {
  beforeEach(() => vi.clearAllMocks());

  // isDisabled derivation — isOwnTurn===false
  it('(d) isOwnTurn===false → button is disabled', () => {
    render(<PassTurnButtonIsland {...BASE_PROPS} isOwnTurn={false} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // isDisabled derivation — isOwnTurn===true
  it('(e) isOwnTurn===true → button is enabled', () => {
    render(<PassTurnButtonIsland {...BASE_PROPS} isOwnTurn={true} />);
    const btn = screen.getByRole('button', { name: /pasar turno/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  // SA wiring: click calls passTurn with correct args
  it('(f) click calls passTurn with encounterId, combatantId, version', async () => {
    vi.mocked(passTurn).mockResolvedValue({ ok: true });
    render(<PassTurnButtonIsland {...BASE_PROPS} version={5} />);
    fireEvent.click(screen.getByRole('button', { name: /pasar turno/i }));

    await waitFor(() => {
      expect(passTurn).toHaveBeenCalledWith(
        BASE_PROPS.encounterId,
        BASE_PROPS.combatantId,
        5,
      );
    });
  });

  // VERSION_CONFLICT → router.refresh() called
  it('(g) VERSION_CONFLICT from passTurn → router.refresh() called', async () => {
    vi.mocked(passTurn).mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
    } as never);
    mockRefresh.mockClear();

    render(<PassTurnButtonIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /pasar turno/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // FORBIDDEN → inline error rendered
  it('(h) FORBIDDEN from passTurn → inline error message renders', async () => {
    vi.mocked(passTurn).mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
    } as never);

    render(<PassTurnButtonIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /pasar turno/i }));

    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toContain('No tienes permiso para realizar esta acción.');
  });
});

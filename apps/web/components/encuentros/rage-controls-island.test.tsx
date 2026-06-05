/**
 * Tests for RageControlsIsland — container layer.
 * REQ-WCR-WEB-UI-01
 *
 * Covers: isDisabled derivation from isOwnTurn/bonusActionUsed/rageUsesRemaining,
 * SA wiring (activateRage/deactivateRage), VERSION_CONFLICT → router.refresh(),
 * FORBIDDEN → inline error.
 * PHB p.48 — Rage: enter/end as a bonus action on own turn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RageControlsIsland } from './rage-controls-island';

// Server Actions mocked — not available in jsdom context.
vi.mock('@/app/encuentros/[id]/actions', () => ({
  activateRage: vi.fn().mockResolvedValue({ ok: true }),
  deactivateRage: vi.fn().mockResolvedValue({ ok: true }),
}));

// useRouter for VERSION_CONFLICT router.refresh()
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { activateRage, deactivateRage } from '@/app/encuentros/[id]/actions';

const BASE_PROPS = {
  combatantId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  encounterId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  isRaging: false,
  isOwnTurn: true,
  bonusActionUsed: false,
  rageUsesRemaining: 2,
  rageMax: 3,
  rageUnlimited: false,
  version: 1,
};

describe('RageControlsIsland — container', () => {
  beforeEach(() => vi.clearAllMocks());

  // isDisabled derivation — isOwnTurn===false
  it('(c) isOwnTurn===false → button is disabled', () => {
    render(<RageControlsIsland {...BASE_PROPS} isOwnTurn={false} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // isDisabled derivation — bonusActionUsed===true
  it('(d) bonusActionUsed===true → button is disabled', () => {
    render(<RageControlsIsland {...BASE_PROPS} bonusActionUsed={true} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // isDisabled derivation — rageUsesRemaining===0 and not raging
  it('(e) rageUsesRemaining===0 → button is disabled', () => {
    render(<RageControlsIsland {...BASE_PROPS} rageUsesRemaining={0} isRaging={false} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // isRaging===true + bonusActionUsed → Terminar Furia disabled
  it('(g-extra) isRaging===true but bonusActionUsed → Terminar Furia disabled', () => {
    render(<RageControlsIsland {...BASE_PROPS} isRaging={true} bonusActionUsed={true} />);
    const btn = screen.getByRole('button', { name: /terminar furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // FIX W2: isRaging===true but NOT own turn → Terminar Furia must be disabled
  // (PHB p.48 — Rage: enter/end as bonus action on OWN TURN only)
  it('(W2) isRaging===true + isOwnTurn===false → Terminar Furia is disabled', () => {
    render(<RageControlsIsland {...BASE_PROPS} isRaging={true} isOwnTurn={false} />);
    const btn = screen.getByRole('button', { name: /terminar furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // Happy path: click → activateRage called with correct args
  it('clicking "Entrar en Furia" calls activateRage with encounterId, combatantId, version', async () => {
    vi.mocked(activateRage).mockResolvedValue({ ok: true });
    render(<RageControlsIsland {...BASE_PROPS} version={7} />);
    fireEvent.click(screen.getByRole('button', { name: /entrar en furia/i }));

    await waitFor(() => {
      expect(activateRage).toHaveBeenCalledWith(
        BASE_PROPS.encounterId,
        BASE_PROPS.combatantId,
        7,
      );
    });
  });

  // Happy path: deactivateRage called when raging
  it('clicking "Terminar Furia" calls deactivateRage', async () => {
    vi.mocked(deactivateRage).mockResolvedValue({ ok: true });
    render(<RageControlsIsland {...BASE_PROPS} isRaging={true} version={3} />);
    fireEvent.click(screen.getByRole('button', { name: /terminar furia/i }));

    await waitFor(() => {
      expect(deactivateRage).toHaveBeenCalledWith(
        BASE_PROPS.encounterId,
        BASE_PROPS.combatantId,
        3,
      );
    });
  });

  // (h) VERSION_CONFLICT → router.refresh() called
  it('(h) VERSION_CONFLICT from activateRage → router.refresh() called', async () => {
    vi.mocked(activateRage).mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
    } as never);
    mockRefresh.mockClear();

    render(<RageControlsIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /entrar en furia/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // FIX S8: FORBIDDEN → permission error message renders
  it('(S8) FORBIDDEN from activateRage → permission error message renders', async () => {
    vi.mocked(activateRage).mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
    } as never);

    render(<RageControlsIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /entrar en furia/i }));

    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toContain('No tienes permiso para realizar esta acción.');
  });
});

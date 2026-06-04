/**
 * Tests for RageControls client island — REQ-WCR-WEB-UI-01
 *
 * PHB p.48 — Rage: Barbarian can enter/end Rage as a bonus action on own turn.
 * L20 Barbarian has Unlimited rages (sentinel value 999 in DB).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RageControls } from './rage-controls';

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

describe('RageControls — REQ-WCR-WEB-UI-01', () => {
  beforeEach(() => vi.clearAllMocks());

  // (a) Counter shows "X / Y usos de Furia" (PHB p.48 rage uses table)
  it('(a) renders counter: "X / Y usos de Furia"', () => {
    render(<RageControls {...BASE_PROPS} rageUsesRemaining={2} rageMax={3} />);
    // Should contain "2" and "3" and "usos de Furia"
    expect(screen.getByText(/usos de Furia/i)).toBeTruthy();
    expect(screen.getByText(/2/)).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy();
  });

  // (b) max===999 (sentinel) → "Ilimitado" (PHB p.48 — Unlimited at L20)
  it('(b) rageUnlimited → counter shows "Ilimitado"', () => {
    render(<RageControls {...BASE_PROPS} rageUnlimited={true} />);
    expect(screen.getByText(/ilimitado/i)).toBeTruthy();
    // Must NOT display "999"
    expect(screen.queryByText(/999/)).toBeNull();
  });

  // (c) isOwnTurn===false → button disabled
  it('(c) isOwnTurn===false → button is disabled', () => {
    render(<RageControls {...BASE_PROPS} isOwnTurn={false} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (d) bonusActionUsed===true → button disabled
  it('(d) bonusActionUsed===true → button is disabled', () => {
    render(<RageControls {...BASE_PROPS} bonusActionUsed={true} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (e) rageUsesRemaining===0 → button disabled (PHB p.48 — exhausted uses)
  it('(e) rageUsesRemaining===0 → button is disabled', () => {
    render(<RageControls {...BASE_PROPS} rageUsesRemaining={0} isRaging={false} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // (f) isRaging===false → shows "Entrar en Furia"
  it('(f) isRaging===false → shows "Entrar en Furia" button', () => {
    render(<RageControls {...BASE_PROPS} isRaging={false} />);
    expect(screen.getByRole('button', { name: /entrar en furia/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /terminar furia/i })).toBeNull();
  });

  // (g) isRaging===true → shows "Terminar Furia" (PHB p.48 — end rage as bonus action)
  it('(g) isRaging===true → shows "Terminar Furia" button enabled', () => {
    render(<RageControls {...BASE_PROPS} isRaging={true} />);
    const btn = screen.getByRole('button', { name: /terminar furia/i });
    expect(btn).toBeTruthy();
    // When raging + own turn + bonus action available → button enabled
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /entrar en furia/i })).toBeNull();
  });

  // (g-extra) isRaging===true and bonus action already used → button disabled
  it('(g-extra) isRaging===true but bonusActionUsed → Terminar Furia disabled', () => {
    render(<RageControls {...BASE_PROPS} isRaging={true} bonusActionUsed={true} />);
    const btn = screen.getByRole('button', { name: /terminar furia/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // Button has ≥44px touch target (mobile-first 375px — CLAUDE.md §2)
  it('button has min-h-[44px] touch target class', () => {
    render(<RageControls {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    expect(btn.className).toContain('min-h-[44px]');
  });

  // (h) VERSION_CONFLICT → router.refresh() called
  it('(h) VERSION_CONFLICT from activateRage → router.refresh() called', async () => {
    vi.mocked(activateRage).mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
    } as never);
    mockRefresh.mockClear();

    render(<RageControls {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /entrar en furia/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // Happy path: click → activateRage called with correct args
  it('clicking "Entrar en Furia" calls activateRage with combatantId, encounterId, version', async () => {
    vi.mocked(activateRage).mockResolvedValue({ ok: true });
    render(<RageControls {...BASE_PROPS} version={7} />);
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
    render(<RageControls {...BASE_PROPS} isRaging={true} version={3} />);
    fireEvent.click(screen.getByRole('button', { name: /terminar furia/i }));

    await waitFor(() => {
      expect(deactivateRage).toHaveBeenCalledWith(
        BASE_PROPS.encounterId,
        BASE_PROPS.combatantId,
        3,
      );
    });
  });
});

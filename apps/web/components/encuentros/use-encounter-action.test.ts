/**
 * Tests for useEncounterAction hook — Dedup 3 (Tier 1 homogenization).
 *
 * Encapsulates the repeated async-action boilerplate across ResourcePanel,
 * AttackSheet, RageControls, and PassTurnButton:
 *   - isPending state via useTransition
 *   - runAction(thunk) → clears error → runs action → handles result
 *   - VERSION_CONFLICT → router.refresh() + optional onConflict callback
 *   - FORBIDDEN → setActionError('No tienes permiso...')
 *   - Other errors → setActionError(result.message ?? fallback)
 *   - Success → no error set
 *
 * T1: isPending is false initially.
 * T2: runAction calls router.refresh() on VERSION_CONFLICT.
 * T3: runAction sets actionError on FORBIDDEN.
 * T4: runAction sets actionError for generic failure message.
 * T5: actionError is null after a successful action.
 * T6: onConflict callback is called when VERSION_CONFLICT fires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock useRouter
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { useEncounterAction } from './use-encounter-action';

describe('useEncounterAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T1: isPending is false initially, actionError is null', () => {
    const { result } = renderHook(() => useEncounterAction());
    expect(result.current.isPending).toBe(false);
    expect(result.current.actionError).toBeNull();
  });

  it('T2: VERSION_CONFLICT → router.refresh() called', async () => {
    const { result } = renderHook(() => useEncounterAction());

    await act(async () => {
      result.current.runAction(
        async () => ({ ok: false as const, code: 'VERSION_CONFLICT' }),
      );
    });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('T3: FORBIDDEN → actionError set', async () => {
    const { result } = renderHook(() => useEncounterAction());

    await act(async () => {
      result.current.runAction(
        async () => ({ ok: false as const, code: 'FORBIDDEN' }),
      );
    });

    await waitFor(() => {
      expect(result.current.actionError).toBe('No tienes permiso para realizar esta acción.');
    });
  });

  it('T4: generic failure → actionError set to result.message or fallback', async () => {
    const { result } = renderHook(() =>
      useEncounterAction({ fallbackError: 'Error genérico.' }),
    );

    await act(async () => {
      result.current.runAction(
        async () => ({ ok: false as const, code: 'SOME_ERROR', message: 'Algo salió mal.' }),
      );
    });

    await waitFor(() => {
      expect(result.current.actionError).toBe('Algo salió mal.');
    });
  });

  it('T4b: fallback used when result.message is absent', async () => {
    const { result } = renderHook(() =>
      useEncounterAction({ fallbackError: 'Error genérico.' }),
    );

    await act(async () => {
      result.current.runAction(
        async () => ({ ok: false as const, code: 'UNKNOWN' }),
      );
    });

    await waitFor(() => {
      expect(result.current.actionError).toBe('Error genérico.');
    });
  });

  it('T5: successful action → actionError stays null', async () => {
    const { result } = renderHook(() => useEncounterAction());

    await act(async () => {
      result.current.runAction(async () => ({ ok: true as const }));
    });

    await waitFor(() => {
      expect(result.current.actionError).toBeNull();
      expect(mockRefresh).not.toHaveBeenCalled();
    });
  });

  it('T6: onConflict callback is called on VERSION_CONFLICT', async () => {
    const onConflict = vi.fn();
    const { result } = renderHook(() => useEncounterAction({ onConflict }));

    await act(async () => {
      result.current.runAction(
        async () => ({ ok: false as const, code: 'VERSION_CONFLICT' }),
      );
    });

    await waitFor(() => {
      expect(onConflict).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });
});

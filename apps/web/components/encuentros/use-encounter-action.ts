'use client';

/**
 * useEncounterAction — shared async-action boilerplate for encuentros islands.
 *
 * Encapsulates the repeated pattern across ResourcePanel, RageControls,
 * PassTurnButton, and AttackSheet:
 *   - isPending via useTransition
 *   - runAction(thunk): clears error, runs thunk in a transition, dispatches
 *     result to the appropriate branch:
 *       VERSION_CONFLICT → router.refresh() + optional onConflict()
 *       FORBIDDEN        → actionError = 'No tienes permiso...'
 *       other !ok        → actionError = result.message ?? fallbackError
 *       ok               → no error
 *
 * Each component supplies its own action thunk so callers keep their specific
 * server-action wiring. The hook handles only the lifecycle — NOT the UI
 * (toast, open/close) — components manage those themselves.
 *
 * Dedup: web-component-catalog/homogenization-tier1 — Dedup 3.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Minimal shape the hook expects from a server action result. */
type ActionResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; code?: string; message?: string; [key: string]: unknown };

export interface UseEncounterActionOptions {
  /**
   * Fallback error message when result.message is absent on failure.
   * Defaults to 'Error al realizar la acción.'
   */
  fallbackError?: string;
  /**
   * Called after router.refresh() on VERSION_CONFLICT.
   * Use this for components that need to close a sheet or reset state
   * (e.g. AttackSheet calls setOpen(false)).
   */
  onConflict?: () => void;
}

export interface UseEncounterActionReturn {
  isPending: boolean;
  actionError: string | null;
  /**
   * Run an async action thunk inside a React transition.
   * Clears actionError before running. Dispatches the result.
   */
  runAction: (thunk: () => Promise<ActionResult>) => void;
}

export function useEncounterAction(
  options: UseEncounterActionOptions = {},
): UseEncounterActionReturn {
  const { fallbackError = 'Error al realizar la acción.', onConflict } = options;
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(thunk: () => Promise<ActionResult>): void {
    startTransition(async () => {
      setActionError(null);
      const result = await thunk();
      if (!result.ok) {
        if (result.code === 'VERSION_CONFLICT') {
          router.refresh();
          onConflict?.();
        } else if (result.code === 'FORBIDDEN') {
          setActionError('No tienes permiso para realizar esta acción.');
        } else {
          setActionError(result.message ?? fallbackError);
        }
      }
    });
  }

  return { isPending, actionError, runAction };
}

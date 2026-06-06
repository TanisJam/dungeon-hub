'use client';

/**
 * DevModeToggle — per-user devMode switch row.
 *
 * codex-knowledge B-4 (SDD tasks #1950, spec #1947, design #1948 §4.5):
 *   REQ-CK-DEV-03: toggle calls setDevMode Server Action (updates users.devMode server-side).
 *   REQ-CK-DEV-01: no client-side localStorage or cookie — server persistence only.
 *   Design §4.5: full-width switch row in account/profile area. Mobile-first (375px).
 *
 * Usage: embed in any profile/settings sheet or menu.
 * currentValue comes from the server (SSR — no stale client state).
 *
 * Design intent: FORK 5 (#1944). This arc encodes NO PHB rule.
 */

import { useState } from 'react';
import { setDevMode } from '@/app/settings/actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DevModeToggleProps {
  /** Server-resolved current devMode value — passed from Server Component. */
  currentValue: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DevModeToggle({ currentValue }: DevModeToggleProps) {
  const [checked, setChecked] = useState(currentValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setError(null);
    setPending(true);
    setChecked(next); // optimistic UI

    const result = await setDevMode(next);
    setPending(false);

    if (!result.ok) {
      setChecked(!next); // revert on error
      setError(result.error ?? 'No se pudo actualizar el modo desarrollador.');
    }
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="flex min-h-[44px] w-full items-center justify-between gap-3 cursor-pointer">
        <span className="flex-1">
          <span className="block text-sm font-medium text-ink">Modo desarrollador</span>
          <span className="block text-xs text-ink-soft">Ver todo el códex sin restricciones</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Modo desarrollador"
          aria-checked={checked}
          checked={checked}
          disabled={pending}
          onChange={handleChange}
          className="h-5 w-9 cursor-pointer rounded-full appearance-none bg-line checked:bg-ink disabled:opacity-50 transition-colors"
        />
      </label>

      {error && (
        <p role="alert" className="text-xs text-red-600 px-1">
          {error}
        </p>
      )}
    </div>
  );
}

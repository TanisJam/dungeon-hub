'use client';

// REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02 — PassTurnButton client island.
// Player taps once to pass their turn. No sub-flow or sheet.
// Mobile-first 375px: full-width button ≥44px touch target (CLAUDE.md §2).
// VERSION_CONFLICT → router.refresh() (no optimistic UI — mirrors RageControls pattern).
// FORBIDDEN → inline error.
// PHB p.189 — a creature may take fewer actions and declare its turn complete.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { passTurn } from '@/app/encuentros/[id]/actions';
import { Button } from '@/components/ui/button';

type Props = {
  encounterId: string;
  combatantId: string;
  /** Optimistic-concurrency version token forwarded to the Server Action. */
  version: number;
  /** True when this combatant is the current combatant. */
  isOwnTurn: boolean;
};

export function PassTurnButton({ encounterId, combatantId, version, isOwnTurn }: Props) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setActionError(null);
      const result = await passTurn(encounterId, combatantId, version);
      if (!result.ok) {
        if (result.code === 'VERSION_CONFLICT') {
          // ADR-4: stale-page handling — same pattern as ResourcePanel / RageControls.
          router.refresh();
        } else if (result.code === 'FORBIDDEN') {
          setActionError('No tienes permiso para realizar esta acción.');
        } else {
          setActionError(result.message ?? 'Error al pasar el turno.');
        }
      }
      // On success: revalidatePath in Server Action triggers SC re-render.
      // No optimistic state update needed (REQ-WCPT-WEB-UI-01).
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {actionError && (
        <p className="text-xs text-red-600" role="alert">{actionError}</p>
      )}

      {/* Full-width ≥44px button (mobile-first 375px — CLAUDE.md §2) */}
      <Button
        tone="ghost"
        aria-label="Pasar turno"
        disabled={!isOwnTurn || isPending}
        onClick={handleClick}
        className="w-full min-h-[44px]"
      >
        Pasar Turno
      </Button>
    </div>
  );
}

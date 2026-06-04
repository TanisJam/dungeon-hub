'use client';

// REQ-WCR-WEB-UI-01 — RageControls client island.
// Renders ONLY for the player's own Barbarian combatant.
// Mobile-first 375px layout; button ≥44px touch target (CLAUDE.md §2).
// No optimistic UI — success triggers revalidatePath in the Server Action,
// then the Server Component re-renders with fresh data.
// VERSION_CONFLICT → router.refresh() (mirrors ResourcePanel pattern).
// PHB p.48 — Rage: enter/end as a bonus action on own turn.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateRage, deactivateRage } from '@/app/encuentros/[id]/actions';

type Props = {
  combatantId: string;
  encounterId: string;
  /** True when the Barbarian currently has the 'Raging' condition. */
  isRaging: boolean;
  /** True when it is this combatant's turn (detail.currentCombatantId === ownCombatant.id). */
  isOwnTurn: boolean;
  /** True when the bonus action has already been spent this turn. */
  bonusActionUsed: boolean;
  /**
   * Remaining rage uses (max − used). Ignored when rageUnlimited is true.
   * PHB p.48 Barbarian table: 2 @ L1, up to Unlimited at L20.
   */
  rageUsesRemaining: number;
  /**
   * Max rage uses at this Barbarian level. Ignored when rageUnlimited is true.
   * Shown as the denominator in "X / Y usos de Furia".
   */
  rageMax: number;
  /**
   * True when the Barbarian is L20 and has Unlimited rages (sentinel max=999).
   * PHB p.48 — "Unlimited" at level 20.
   */
  rageUnlimited: boolean;
  /** Optimistic-concurrency version token forwarded to the Server Action. */
  version: number;
};

export function RageControls({
  combatantId,
  encounterId,
  isRaging,
  isOwnTurn,
  bonusActionUsed,
  rageUsesRemaining,
  rageMax,
  rageUnlimited,
  version,
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Button is disabled when:
  //   - not own turn (PHB: must be own turn to use a bonus action)
  //   - bonus action already spent
  //   - no uses remaining AND not already raging (ending rage is always allowed on own turn
  //     regardless of remaining uses)
  const isDisabled =
    !isOwnTurn ||
    bonusActionUsed ||
    (!isRaging && !rageUnlimited && rageUsesRemaining <= 0);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function handleClick() {
    startTransition(async () => {
      setActionError(null);
      const action = isRaging ? deactivateRage : activateRage;
      const result = await action(encounterId, combatantId, version);
      if (!result.ok) {
        if (result.code === 'VERSION_CONFLICT') {
          // ADR-4: stale-page handling — same pattern as ResourcePanel
          showToast('El estado cambió, actualizando...');
          router.refresh();
        } else if (result.code === 'FORBIDDEN') {
          setActionError('No tienes permiso para realizar esta acción.');
        } else {
          setActionError(result.message ?? 'Error al cambiar estado de Furia.');
        }
      }
      // On success: revalidatePath in Server Action triggers SC re-render.
      // No optimistic state update needed (REQ-WCR-WEB-UI-01).
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* VERSION_CONFLICT toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="text-xs text-center px-3 py-2 bg-warning-soft text-warning-deep rounded"
        >
          {toast}
        </div>
      )}

      {actionError && (
        <p className="text-xs text-red-600" role="alert">{actionError}</p>
      )}

      {/* Counter — PHB p.48 Rage uses; "Ilimitado" when L20 (sentinel 999) */}
      <p className="text-sm text-ink-soft">
        {rageUnlimited ? (
          <>Ilimitado usos de Furia</>
        ) : (
          <>{rageUsesRemaining}&nbsp;/&nbsp;{rageMax}&nbsp;usos de Furia</>
        )}
      </p>

      {/* Full-width ≥44px button (mobile-first 375px) */}
      <button
        type="button"
        aria-label={isRaging ? 'Terminar Furia' : 'Entrar en Furia'}
        disabled={isDisabled || isPending}
        onClick={handleClick}
        className="w-full min-h-[44px] rounded text-sm font-semibold border border-line disabled:opacity-40"
      >
        {isRaging ? 'Terminar Furia' : 'Entrar en Furia'}
      </button>
    </div>
  );
}

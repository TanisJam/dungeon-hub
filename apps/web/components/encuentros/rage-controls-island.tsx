'use client';

// REQ-WCR-WEB-UI-01 — RageControlsIsland container layer.
// Owns: useToast, useEncounterAction, isDisabled derivation, SA wiring.
// Renders RageControlsView with all derived state.
// Public prop interface is identical to the former RageControls monolith.
// VERSION_CONFLICT → router.refresh() (mirrors ResourcePanel pattern).
// PHB p.48 — Rage: enter/end as a bonus action on own turn.

import { activateRage, deactivateRage } from '@/app/encuentros/[id]/actions';
import { useToast } from '@/lib/use-toast';
import { useEncounterAction } from './use-encounter-action';
import { RageControlsView } from './rage-controls-view';

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

export function RageControlsIsland({
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
  const { message: toast, showToast } = useToast();
  const { isPending, actionError, runAction } = useEncounterAction({
    fallbackError: 'Error al cambiar estado de Furia.',
    onConflict: () => showToast('El estado cambió, actualizando...'),
  });

  // Button is disabled when:
  //   - not own turn (PHB: must be own turn to use a bonus action)
  //   - bonus action already spent
  //   - no uses remaining AND not already raging (ending rage is always allowed on own turn
  //     regardless of remaining uses)
  const isDisabled =
    !isOwnTurn ||
    bonusActionUsed ||
    (!isRaging && !rageUnlimited && rageUsesRemaining <= 0);

  function handleClick() {
    const action = isRaging ? deactivateRage : activateRage;
    runAction(() => action(encounterId, combatantId, version));
  }

  return (
    <RageControlsView
      isRaging={isRaging}
      isDisabled={isDisabled}
      pending={isPending}
      actionError={actionError}
      toastMessage={toast}
      rageUnlimited={rageUnlimited}
      rageUsesRemaining={rageUsesRemaining}
      rageMax={rageMax}
      onToggle={handleClick}
    />
  );
}

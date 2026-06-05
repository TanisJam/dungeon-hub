'use client';

// REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02 — PassTurnButtonIsland container layer.
// Owns: useEncounterAction, isDisabled derivation, SA wiring.
// Renders PassTurnButtonView with all derived state.
// Public prop interface is identical to the former PassTurnButton monolith.
// VERSION_CONFLICT → router.refresh() (no optimistic UI — mirrors RageControls pattern).
// FORBIDDEN → inline error.
// PHB p.189 — a creature may take fewer actions and declare its turn complete.

import { passTurn } from '@/app/encuentros/[id]/actions';
import { useEncounterAction } from './use-encounter-action';
import { PassTurnButtonView } from './pass-turn-button-view';

type Props = {
  encounterId: string;
  combatantId: string;
  /** Optimistic-concurrency version token forwarded to the Server Action. */
  version: number;
  /** True when this combatant is the current combatant. */
  isOwnTurn: boolean;
};

export function PassTurnButtonIsland({ encounterId, combatantId, version, isOwnTurn }: Props) {
  const { isPending, actionError, runAction } = useEncounterAction({
    fallbackError: 'Error al pasar el turno.',
  });

  function handleClick() {
    runAction(() => passTurn(encounterId, combatantId, version));
  }

  return (
    <PassTurnButtonView
      isDisabled={!isOwnTurn}
      pending={isPending}
      actionError={actionError}
      onPass={handleClick}
    />
  );
}

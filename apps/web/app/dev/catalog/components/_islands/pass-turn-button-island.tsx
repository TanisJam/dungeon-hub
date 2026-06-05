'use client';

// Dev-only catalog island for PassTurnButtonView.
// Uses PassTurnButtonView directly with fixture props + local React state
// (no server actions called — catalog visualization only).

import { useState } from 'react';
import { PassTurnButtonView } from '@/components/encuentros/pass-turn-button-view';

type Props = {
  isOwnTurn?: boolean;
};

export function PassTurnButtonIsland({ isOwnTurn = true }: Props) {
  const [passed, setPassed] = useState(false);

  function handlePass() {
    setPassed(true);
    // Reset after brief delay to allow re-tapping in catalog
    setTimeout(() => setPassed(false), 1500);
  }

  return (
    <>
      {passed && (
        <p className="text-xs text-ink-soft" role="status">
          (Catálogo) Turno pasado — sin acción de servidor real.
        </p>
      )}
      <PassTurnButtonView
        isDisabled={!isOwnTurn}
        pending={false}
        actionError={null}
        onPass={handlePass}
      />
    </>
  );
}

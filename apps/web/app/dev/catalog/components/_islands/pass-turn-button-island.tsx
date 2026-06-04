'use client';

// NOTE: mirrors PassTurnButton (apps/web/components/encuentros/pass-turn-button.tsx)
// Dev-only catalog island — fixture props + no-op handler (no passTurn server action called).

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  isOwnTurn?: boolean;
};

export function PassTurnButtonIsland({ isOwnTurn = true }: Props) {
  const [passed, setPassed] = useState(false);

  function handleClick() {
    setPassed(true);
    // Reset after brief delay to allow re-tapping in catalog
    setTimeout(() => setPassed(false), 1500);
  }

  return (
    <div className="flex flex-col gap-2">
      {passed && (
        <p className="text-xs text-ink-soft" role="status">
          (Catálogo) Turno pasado — sin acción de servidor real.
        </p>
      )}
      <Button
        tone="ghost"
        aria-label="Pasar turno"
        disabled={!isOwnTurn}
        onClick={handleClick}
        className="w-full min-h-[44px]"
      >
        Pasar Turno
      </Button>
    </div>
  );
}

'use client';

// NOTE: mirrors TurnControls + TurnControlsIsland
// (apps/web/components/encuentros/turn-controls.tsx + turn-controls-island.tsx)
// Dev-only catalog island — no-op onAdvance (no advanceEncounterTurn server action called).
// The feature's TurnControlsIsland is NOT reused directly because it imports a real server
// action — this catalog island recreates the visual faithfully with local pending state.

import { useState } from 'react';
import { TurnControls } from '@/components/encuentros/turn-controls';

export function TurnControlsIslandCatalog() {
  const [pending, setPending] = useState(false);

  function handleAdvance() {
    setPending(true);
    // Simulate async round advance in catalog
    setTimeout(() => setPending(false), 800);
  }

  return <TurnControls onAdvance={handleAdvance} pending={pending} />;
}

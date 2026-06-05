'use client';

/**
 * SetActiveCharacterButtonIsland — catalog wrapper for the REAL SetActiveCharacterButton.
 *
 * The production component now accepts injectable `actions` (SetActiveCharacterActions,
 * default = real setActiveCharacter + router.refresh()). The catalog injects stubs:
 * onActivated flips local state so the star fills, without any server action or router
 * refresh. Activation is one-way (matching production — a no-op once active); the two
 * registry combos cover the active (★) and inactive (☆) states.
 *
 * INTERACTIVE — tap the inactive star to activate; aria-pressed updates accordingly.
 */

import { useState } from 'react';
import { SetActiveCharacterButton } from '@/components/personajes/set-active-character-button';

type Props = {
  /** Initial active state for the catalog demo. */
  initialIsActive?: boolean;
};

export function SetActiveCharacterButtonIsland({ initialIsActive = false }: Props) {
  const [isActive, setIsActive] = useState(initialIsActive);

  const actions = {
    setActive: async () => {
      // Stub — no real setActiveCharacter server action in the catalog.
    },
    onActivated: () => setIsActive(true),
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <SetActiveCharacterButton
        characterId="char-demo"
        worldId="world-demo"
        isActive={isActive}
        actions={actions}
      />
      <p className="text-[10px] text-ink-soft font-mono">
        {isActive ? 'active (★)' : 'inactive (☆)'}
      </p>
      <p className="text-[10px] text-ink-mute font-mono">
        {isActive ? 'no-op when active' : 'tap to activate'}
      </p>
    </div>
  );
}

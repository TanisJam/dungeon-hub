'use client';

/**
 * SetActiveCharacterButtonIsland — catalog-safe replica of SetActiveCharacterButton.
 *
 * The production component calls setActiveCharacter (server action from
 * app/set-active-character) and then router.refresh(). Both are replaced with
 * local stubs: clicking cycles the local isActive state to show both the filled
 * (★ active) and unfilled (☆ inactive) visual states — no network, no router.
 *
 * INTERACTIVE — tap/click toggles star fill; aria-pressed updates accordingly.
 */

import { useState } from 'react';

type Props = {
  /** Initial active state for the catalog demo. */
  initialIsActive?: boolean;
};

export function SetActiveCharacterButtonIsland({ initialIsActive = false }: Props) {
  const [isActive, setIsActive] = useState(initialIsActive);

  const handleClick = async () => {
    setIsActive((prev) => !prev);
    // Stub — no setActiveCharacter call, no router.refresh() in catalog
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        aria-label={isActive ? 'Personaje activo' : 'Seleccionar como personaje activo'}
        aria-pressed={isActive}
        className={`flex min-h-[44px] w-[44px] shrink-0 items-center justify-center rounded-r-md transition-colors ${
          isActive
            ? 'text-accent'
            : 'text-ink-mute hover:text-accent'
        }`}
      >
        {isActive ? '★' : '☆'}
      </button>
      <p className="text-[10px] text-ink-soft font-mono">
        {isActive ? 'active (★)' : 'inactive (☆)'}
      </p>
      <p className="text-[10px] text-ink-mute font-mono">tap to toggle</p>
    </div>
  );
}

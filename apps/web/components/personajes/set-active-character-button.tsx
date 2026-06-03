'use client';

import { useRouter } from 'next/navigation';
import { setActiveCharacter } from '@/app/set-active-character';

interface SetActiveCharacterButtonProps {
  characterId: string;
  worldId: string;
  /** True when this character is already the active lens — renders filled state, no-op on click. */
  isActive: boolean;
}

/**
 * SetActiveCharacterButton — 'use client' island that sets the active character
 * lens and refreshes the page.
 *
 * REQ-AC-SEL-01: ≥44px touch target, sibling to the card Link (NOT nested inside it).
 * REQ-AC-SEL-02: Parent controls visibility — only rendered for status==='active' rows.
 * ADR F-AFF: no button nested in anchor; outer div flex wrapper is the parent.
 */
export function SetActiveCharacterButton({
  characterId,
  worldId,
  isActive,
}: SetActiveCharacterButtonProps) {
  const router = useRouter();

  const handleClick = async () => {
    // No-op guard: if this card is already the active character, do nothing.
    if (isActive) return;
    await setActiveCharacter(characterId, worldId);
    router.refresh();
  };

  return (
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
  );
}

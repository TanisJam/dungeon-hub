'use client';

/**
 * Equip/unequip toggle for an inventory row.
 *
 * REQ-INV-EQUIP-TOGGLE (spec #843 — inventory-foundation). Mobile tap target
 * is ≥44×44px (iOS HIG minimum, REQ-INV-MOBILE-LAYOUT).
 */
import { useState, useTransition } from 'react';
import { updateInventoryItem } from '../../actions';

interface EquipToggleProps {
  characterId: string;
  instanceId: string;
  currentState: 'equipped' | 'carried' | 'stowed';
}

export function EquipToggle({
  characterId,
  instanceId,
  currentState,
}: EquipToggleProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEquipped = currentState === 'equipped';
  const nextState: 'equipped' | 'carried' = isEquipped ? 'carried' : 'equipped';
  const label = isEquipped ? 'Desequipar' : 'Equipar';

  function handleClick() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await updateInventoryItem(characterId, instanceId, {
        state: nextState,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={isEquipped}
        aria-label={`${label} ítem`}
        className={`min-h-[44px] rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
          isEquipped
            ? 'border-ink bg-ink text-paper hover:bg-ink-soft'
            : 'border-line bg-paper-soft text-ink-mute hover:bg-paper-muted hover:text-ink'
        }`}
      >
        {isPending ? '…' : label}
      </button>
      {error && (
        <p role="alert" className="text-[10px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

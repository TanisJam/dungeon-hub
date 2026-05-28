'use client';

/**
 * EquipChip — client wrapper for the equip toggle in the detail sheet hero.
 *
 * Reqs: WIE10-MIGRATE-01 (spec #1070)
 * Design: DBE5 (design #1071) — reuses existing updateInventoryItem Server Action.
 *
 * Renders as a Pill-shaped chip with aria-pressed reflecting the equipped state.
 * Label: "Equipado" (filled accent) when equipped; "Equipar" (ghost) when not.
 */
import { useTransition } from 'react';
import { updateInventoryItem } from '../../../actions';

interface EquipChipProps {
  characterId: string;
  instanceId: string;
  equipped: boolean;
}

export function EquipChip({ characterId, instanceId, equipped }: EquipChipProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await updateInventoryItem(characterId, instanceId, {
        state: equipped ? 'carried' : 'equipped',
      });
    });
  }

  return (
    <button
      type="button"
      aria-pressed={equipped}
      disabled={isPending}
      onClick={handleClick}
      className="inventory-init-detail-equip-chip"
      aria-label={equipped ? 'Desequipar ítem' : 'Equipar ítem'}
    >
      {equipped ? 'Equipado' : 'Equipar'}
    </button>
  );
}

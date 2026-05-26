'use client';

/**
 * Delete-an-inventory-line button.
 *
 * REQ-INV-REMOVE-ITEM (spec #843 — inventory-foundation). Uses native
 * `window.confirm` to keep the surface small; a richer Confirm component is
 * out of scope for this batch.
 */
import { useState, useTransition } from 'react';
import { removeInventoryItem } from '../../actions';

interface DeleteButtonProps {
  characterId: string;
  instanceId: string;
  itemName: string;
}

export function DeleteButton({
  characterId,
  instanceId,
  itemName,
}: DeleteButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending) return;
    const confirmed = window.confirm(`¿Eliminar "${itemName}" del inventario?`);
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await removeInventoryItem(characterId, instanceId);
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
        aria-label={`Eliminar ${itemName}`}
        className="min-h-[44px] min-w-[44px] rounded-md border border-line bg-paper-soft px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-60"
      >
        {isPending ? '…' : '✕'}
      </button>
      {error && (
        <p role="alert" className="text-[10px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

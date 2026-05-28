'use client';

/**
 * InventoryDetailFooter — client component.
 *
 * Sheet footer with "Eliminar del inventario" ghost button.
 * Uses native confirm() guard then fires deleteInventoryItem Server Action.
 *
 * Reqs: WIE10-MIGRATE-02 (spec #1070)
 * Design: DBE5 — reuses existing removeInventoryItem Server Action.
 */
import { removeInventoryItem } from '../../../actions';

interface InventoryDetailFooterProps {
  characterId: string;
  instanceId: string;
  itemName: string;
  onDeleted?: () => void;
}

export function InventoryDetailFooter({
  characterId,
  instanceId,
  itemName,
  onDeleted,
}: InventoryDetailFooterProps) {
  async function handleDelete() {
    const confirmed = window.confirm(`¿Eliminar "${itemName}" del inventario?`);
    if (!confirmed) return;
    await removeInventoryItem(characterId, instanceId);
    onDeleted?.();
  }

  return (
    <div className="inventory-init-detail-footer">
      <button
        type="button"
        onClick={handleDelete}
        className="danger-ghost"
        aria-label={`Eliminar ${itemName}`}
      >
        Eliminar del inventario
      </button>
    </div>
  );
}

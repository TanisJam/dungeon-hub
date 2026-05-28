/**
 * InventoryGroup — group head + list of InventoryRow children.
 *
 * Server Component (pure render).
 * Reqs: WIVLS-ROWS-01 (spec #1063)
 *
 * The group head carries data-group={v3Type} so CSS filter rules can
 * show/hide it when the active chip filter changes (DA1).
 */
import type { EnrichedInventoryItem, V3ItemType } from '@/lib/sheet-types';
import { InventoryRow } from './inventory-row.js';

interface InventoryGroupProps {
  v3Type: V3ItemType;
  label: string;
  items: EnrichedInventoryItem[];
  characterId: string;
}

export function InventoryGroup({ v3Type, label, items, characterId }: InventoryGroupProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="inventory-init-grouphead" data-group={v3Type}>
        <span className="ttl">{label}</span>
        <span className="meta">{items.length}</span>
      </div>
      {items.map((item) => (
        <InventoryRow key={item.instanceId} item={item} characterId={characterId} />
      ))}
    </div>
  );
}

/**
 * InventoryRow — single inventory item row in the v3 list view.
 *
 * Server Component rendered as a <button data-instance-id data-v3-type>. Tap is
 * captured by InventoryDetailIsland via event delegation on a single root (DBE1).
 * Reqs: WIVLS-ROWS-01 (spec #1063)
 *
 * Each row:
 * - Carries data-itype={v3Type} for CSS filter rules (DA1).
 * - Applies .rarity-{class} CSS class for box-shadow glow (DA7 — existing tokens).
 * - Shows .equipped-flag badge when equipped === true.
 * - Shows .sparkle ✦ when magicFlag === true.
 */
import type { EnrichedInventoryItem } from '@/lib/sheet-types';

interface InventoryRowProps {
  item: EnrichedInventoryItem;
  characterId: string;
}

const V3_ICONS: Record<string, string> = {
  weapon:     '⚔',
  armor:      '🛡',
  consumable: '⚗',
  magic:      '✨',
  food:       '🍖',
  trinket:    '◈',
  book:       '📖',
  quest:      '◎',
};

export function InventoryRow({ item, characterId: _characterId }: InventoryRowProps) {
  const rarityClass = item.rarity ? `rarity-${item.rarity}` : '';

  return (
    <button
      type="button"
      className={`inventory-init-row ${rarityClass}`.trim()}
      data-itype={item.v3Type}
      data-instance-id={item.instanceId}
      data-v3-type={item.v3Type}
      aria-label={item.displayName}
    >
      {/* Icon cell */}
      <div className="ic-cell">
        <span aria-hidden="true">{V3_ICONS[item.v3Type] ?? '◈'}</span>
        {item.equipped && (
          <span className="equipped-flag" aria-label="Equipado">Eq</span>
        )}
      </div>

      {/* Body: name + sub-copy */}
      <div className="body">
        <span className="nm">
          {item.displayName}
          {item.magicFlag && (
            <span className="sparkle" aria-hidden="true"> ✦</span>
          )}
        </span>
        {item.rarity && (
          <span className="sub">{item.rarity}</span>
        )}
      </div>

      {/* Quantity */}
      {item.qty > 1 && (
        <span className="qty">×{item.qty}</span>
      )}
    </button>
  );
}

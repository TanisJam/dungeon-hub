/**
 * InventoryV3List — server shell for the v3 inventory list view.
 *
 * Server Component (no 'use client'). Outer wrapper `.inventory-init` provides
 * the CSS scope boundary (WED-CSS-SCOPED-05 pattern, WIVS-SCOPE-01).
 *
 * Architecture (DA1 — design #1064):
 * - TypeFilterChips (client island) wraps server-rendered row content.
 * - Filter state lives client-side; rows are server-rendered once with data-itype attrs.
 * - CSS `[data-filter="x"] [data-itype]:not([data-itype="x"])` hides non-matching rows.
 *
 * Reqs: WIVLS-CURRENCY-01, WIVLS-WEIGHT-01, WIVLS-EQUIPPED-01,
 *       WIVLS-CHIPS-01, WIVLS-ROWS-01, WIVLS-EMPTY-01, WIVS-SCOPE-01
 */
import type { Currency, EncumbranceView, EnrichedInventoryItem } from '@/lib/sheet-types';
import type { SheetWarningCode } from '@/lib/sheet-types';
import { CurrencyStrip } from './currency-strip.js';
import { WeightBar } from './weight-bar.js';
import { EquippedSlotsGrid } from './equipped-slots-grid.js';
import { TypeFilterChips } from './type-filter-chips.js';
import { InventoryGroup } from './inventory-group.js';
import { EmptyState } from './empty-state.js';
import { CHIP_LABELS, GROUP_ORDER } from './types.js';
import { InventoryDetailIsland } from '../v3-detail/index.js';

interface InventoryV3ListProps {
  characterId: string;
  inventory: EnrichedInventoryItem[];
  currency: Currency;
  encumbrance: EncumbranceView;
  warnings: SheetWarningCode[];
}

export function InventoryV3List({
  characterId,
  inventory,
  currency,
  encumbrance,
}: InventoryV3ListProps) {
  // Group items by v3Type
  const grouped = Object.fromEntries(
    GROUP_ORDER.map((key) => [key, inventory.filter((it) => it.v3Type === key)]),
  ) as Record<typeof GROUP_ORDER[number], EnrichedInventoryItem[]>;

  const isEmpty = inventory.length === 0;

  return (
    <div className="inventory-init">
      <InventoryDetailIsland characterId={characterId}>
        <TypeFilterChips>
          <CurrencyStrip currency={currency} />
          {encumbrance && <WeightBar encumbrance={encumbrance} />}
          <EquippedSlotsGrid items={inventory} />

          {isEmpty ? (
            <EmptyState filter="all" />
          ) : (
            GROUP_ORDER.map((key) => {
              const items = grouped[key];
              if (!items || items.length === 0) return null;
              return (
                <InventoryGroup
                  key={key}
                  v3Type={key}
                  label={CHIP_LABELS[key]}
                  items={items}
                  characterId={characterId}
                />
              );
            })
          )}
        </TypeFilterChips>
      </InventoryDetailIsland>
    </div>
  );
}

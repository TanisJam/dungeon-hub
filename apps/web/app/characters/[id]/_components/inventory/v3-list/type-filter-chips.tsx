'use client';

/**
 * TypeFilterChips — type filter chip strip (client island).
 *
 * Owns filter state and the `.inventory-init-list` wrapper div that carries
 * `data-filter` for CSS-based row show/hide (DA1).
 *
 * Reqs: WIVLS-CHIPS-01 (spec #1063)
 * Design DA1: client island wraps server-rendered children via React 19 streaming.
 * Design DA8: CSS horizontal scroll (no JS carousel).
 * Design DA9: Libros + Quest chips are disabled with aria-disabled="true" (D4 deferral).
 *
 * RSC stub pattern (CLAUDE.md §11): NO onClick on disabled buttons — native `disabled` attribute only.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { CHIP_LABELS, DEFERRED_TYPES, GROUP_ORDER, type FilterKey } from './types.js';

const ALL_CHIPS: FilterKey[] = ['all', ...GROUP_ORDER];

interface TypeFilterChipsProps {
  children: ReactNode;
  defaultFilter?: FilterKey;
}

export function TypeFilterChips({ children, defaultFilter = 'all' }: TypeFilterChipsProps) {
  const [filter, setFilter] = useState<FilterKey>(defaultFilter);

  return (
    <>
      <div className="inventory-init-chips" role="tablist" aria-label="Filtrar por tipo">
        {ALL_CHIPS.map((key) => {
          const isDeferred = DEFERRED_TYPES.has(key);
          const isActive = filter === key;

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDeferred ? 'true' : undefined}
              disabled={isDeferred}
              className={`chip${isActive ? ' on' : ''}`}
              onClick={isDeferred ? undefined : () => setFilter(key)}
            >
              {CHIP_LABELS[key]}
            </button>
          );
        })}
      </div>
      <div className="inventory-init-list" data-filter={filter}>
        {children}
      </div>
    </>
  );
}

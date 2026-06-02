'use client';

// Generic list island for compendium category browse pages.
// ADR-3: ONE island keyed by category — per-category variation is in config.RowView only.
// REQ-CBROWSE-04: debounced search, 200ms, stale-drop via reqIdRef.
// REQ-CBROWSE-09: mobile-first, 44px tap targets, no horizontal overflow.
//
// IMPORTANT: config is NOT passed as a prop from the Server Component — function components
// (RowView, Header) cannot be serialized across the Server/Client boundary in Next.js RSC.
// Instead, this island imports CATEGORY_CONFIG directly and resolves config by category string.

import { useEffect, useRef, useState } from 'react';
import { CATEGORY_CONFIG } from '../_config/registry';
import type { CompendiumCategory } from '@/app/compendium/_components/types';
import { searchCompendium } from '../actions';
import { DetailSheet } from './detail-sheet';

interface CompendiumListProps {
  category: CompendiumCategory;
  campaignId: string;
  worldId: string | null;
  accessToken: string;
  initialRows: unknown[];
  total: number;
  // NOTE: config is NOT in props — resolved client-side from CATEGORY_CONFIG to avoid
  // serialization of function components across the Server/Client boundary.
}

/**
 * CompendiumList — generic paginated + searchable list island.
 * Clones the debounce + stale-drop pattern from inventory/picker.tsx verbatim.
 * REQ-CBROWSE-04: debounced search. REQ-CBROWSE-09: 44px tap targets @375px.
 */
export function CompendiumList({
  category,
  campaignId,
  worldId,
  accessToken,
  initialRows,
  total: initialTotal,
}: CompendiumListProps) {
  // Resolve config client-side — avoids passing function components as props (RSC boundary).
  const config = CATEGORY_CONFIG[category];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<unknown[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [offset, setOffset] = useState(initialRows.length);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<unknown | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);

  // Debounced search — 200ms, stale-drop. Clone of Picker pattern.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      // Reset to SSR initial rows on clear
      setResults(initialRows);
      setTotalCount(initialTotal);
      setOffset(initialRows.length);
      setSearching(false);
      return;
    }

    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const res = await searchCompendium(category, campaignId, trimmed, 0);
      if (reqIdRef.current === myReqId) {
        setResults(res.rows);
        setTotalCount(res.total);
        setOffset(res.rows.length);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, category, campaignId, initialRows, initialTotal]);

  async function handleLoadMore() {
    if (loadingMore || offset >= totalCount) return;
    setLoadingMore(true);
    const trimmed = query.trim();
    const res = await searchCompendium(category, campaignId, trimmed, offset);
    setResults((prev) => [...prev, ...res.rows]);
    setTotalCount(res.total);
    setOffset((prev) => prev + res.rows.length);
    setLoadingMore(false);
  }

  const hasMore = offset < totalCount;

  return (
    <div className="flex flex-col">
      {/* Sticky search input — REQ-CBROWSE-04, 44px min-height */}
      <div className="sticky top-0 z-10 border-b border-line bg-paper px-4 py-2">
        <input
          type="search"
          inputMode="search"
          placeholder={`Buscar ${config.label.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Buscar ${config.label.toLowerCase()}`}
          className="min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-4 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* List */}
      {searching ? (
        <div className="px-4 py-8 text-center text-sm text-ink-soft">Buscando…</div>
      ) : results.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-ink-soft">Sin resultados</div>
      ) : (
        <ul className="divide-y divide-line">
          {results.map((row, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full min-h-[44px] px-4 text-left hover:bg-paper-soft transition-colors"
                onClick={() => setSelected(row)}
              >
                <config.RowView row={row} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Load more — REQ-CBROWSE-04 pagination V1 */}
      {hasMore && !searching && (
        <div className="px-4 py-4">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {loadingMore ? 'Cargando…' : `Cargar más (${totalCount - offset} restantes)`}
          </button>
        </div>
      )}

      {/* Detail sheet — opens on row tap */}
      {selected !== null && (
        <DetailSheet
          open={true}
          category={category}
          row={selected}
          campaignId={campaignId}
          worldId={worldId}
          accessToken={accessToken}
          config={config}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

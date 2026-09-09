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
import type { CompendiumCategory, ShopContext } from '@/app/compendium/_components/types';
import { searchCompendium, type CompendiumScope } from '../actions';
import { DetailSheet } from './detail-sheet';
import { ITEM_TYPE_LABELS } from './row-views';

// Item type filter options (#3.4) — sorted by label. Items-only; the API
// GET /compendium/items?type= already supports it. Static vocabulary (PHB p.150).
const ITEM_TYPE_OPTIONS = Object.entries(ITEM_TYPE_LABELS)
  .map(([code, label]) => ({ code, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

interface CompendiumListProps {
  category: CompendiumCategory;
  /** scope — XOR: {campaign} for /compendium browser; {world} for /codex player view. */
  scope: CompendiumScope;
  worldId: string | null;
  accessToken: string;
  initialRows: unknown[];
  total: number;
  /**
   * Initial search query, pre-populated from the SSR fetch (page.tsx already used it to
   * fetch initialRows/total). REQ-BIB-SEARCH-05: lets the Biblioteca cross-category search
   * sheet deep-link into a category browse pre-filtered to the entry it linked from, since
   * this app has no separate per-entry detail route. Omitted → unchanged empty-query behavior.
   */
  initialQuery?: string;
  /**
   * Extra per-call filters merged into activeFilters and forwarded to searchCompendium.
   * Callers that do not pass this prop receive the current behavior unchanged.
   * REQ-MERC-SURF-01, ADR-3: Mercado passes { magic: 'false' } to pin mundane-only.
   */
  extraFilters?: Record<string, string>;
  /**
   * shopContext (market-shop-buy-ui 3c) — optional, threaded to config.RowView + config.Header
   * (via DetailSheet) alongside scope/worldId/accessToken. Only /mercado/page.tsx passes it;
   * /compendium/[category]/page.tsx never does, so the codex browser stays browse-only.
   */
  shopContext?: ShopContext;
  // NOTE: config is NOT in props — resolved client-side from CATEGORY_CONFIG to avoid
  // serialization of function components across the Server/Client boundary.
}

/**
 * CompendiumList — generic paginated + searchable list island.
 * Clones the debounce + stale-drop pattern from inventory/picker.tsx verbatim.
 * REQ-CBROWSE-04: debounced search. REQ-CBROWSE-09: 44px tap targets @375px.
 * codex-rehome ADR-2: scope prop replaces bare campaignId — supports both {campaign} and {world}.
 */
export function CompendiumList({
  category,
  scope,
  worldId,
  accessToken,
  initialRows,
  total: initialTotal,
  initialQuery = '',
  extraFilters = {},
  shopContext,
}: CompendiumListProps) {
  // Resolve config client-side — avoids passing function components as props (RSC boundary).
  const config = CATEGORY_CONFIG[category];
  // Item type filter (#3.4) — items-only. Empty string = no filter.
  const showTypeFilter = category === 'items';
  const [typeFilter, setTypeFilter] = useState('');
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<unknown[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [offset, setOffset] = useState(initialRows.length);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<unknown | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);

  // Active filters passed to searchCompendium: extra pinned filters (e.g. magic=false
  // from /mercado) merged with dynamic per-request filters (e.g. type picker).
  // extraFilters are stable (from props) and always included; typeFilter is transient.
  const activeFilters: Record<string, string> = {
    ...extraFilters,
    ...(typeFilter ? { type: typeFilter } : {}),
  };

  // Debounced search — 200ms, stale-drop. Clone of Picker pattern.
  // Re-runs on query OR type-filter change.
  // extraFilters are stable from props and always forwarded (e.g. magic=false from Mercado).
  // scope and extraFilters are stable object references passed from RSC — JSON.stringify
  // tracks them by value instead of identity. activeFilters is not listed separately:
  // it is derived purely from typeFilter (tracked directly) and extraFilters (tracked
  // via JSON.stringify below), so it carries no information the array doesn't already have.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value-compares scope/extraFilters via JSON.stringify instead of object identity; activeFilters is fully derived from the tracked deps.
  useEffect(() => {
    const trimmed = query.trim();
    // Fall back to SSR rows when there is NEITHER a query NOR a dynamic filter.
    // extraFilters are always active (pinned from caller) — they do NOT block SSR fallback.
    if (trimmed.length === 0 && !typeFilter) {
      setResults(initialRows);
      setTotalCount(initialTotal);
      setOffset(initialRows.length);
      setSearching(false);
      return;
    }

    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const res = await searchCompendium(
        category,
        scope,
        trimmed,
        0,
        activeFilters,
      );
      if (reqIdRef.current === myReqId) {
        setResults(res.rows);
        setTotalCount(res.total);
        setOffset(res.rows.length);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, typeFilter, category, JSON.stringify(scope), JSON.stringify(extraFilters), initialRows, initialTotal]);

  async function handleLoadMore() {
    if (loadingMore || offset >= totalCount) return;
    setLoadingMore(true);
    const trimmed = query.trim();
    const res = await searchCompendium(category, scope, trimmed, offset, activeFilters);
    setResults((prev) => [...prev, ...res.rows]);
    setTotalCount(res.total);
    setOffset((prev) => prev + res.rows.length);
    setLoadingMore(false);
  }

  const hasMore = offset < totalCount;

  return (
    <div className="flex flex-col">
      {/* Sticky search input — REQ-CBROWSE-04, 44px min-height */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line bg-paper px-4 py-2">
        <input
          type="search"
          inputMode="search"
          placeholder={`Buscar ${config.label.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Buscar ${config.label.toLowerCase()}`}
          className="min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-4 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
        {/* Item type filter (#3.4) — items category only */}
        {showTypeFilter && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filtrar por tipo"
            className="min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
          >
            <option value="">Todos los tipos</option>
            {ITEM_TYPE_OPTIONS.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {searching ? (
        <div className="px-4 py-8 text-center text-sm text-ink-soft">Buscando…</div>
      ) : results.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-ink-soft">Sin resultados</div>
      ) : (
        <ul className="divide-y divide-line">
          {results.map((row) => {
            const { slug, source } = row as { slug: string; source: string };
            return (
              <li key={`${slug}|${source}`}>
                <button
                  type="button"
                  className="w-full min-h-[44px] px-4 text-left hover:bg-paper-soft transition-colors"
                  onClick={() => setSelected(row)}
                >
                  <config.RowView row={row} shopContext={shopContext} />
                </button>
              </li>
            );
          })}
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
          scope={scope}
          worldId={worldId}
          accessToken={accessToken}
          config={config}
          shopContext={shopContext}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

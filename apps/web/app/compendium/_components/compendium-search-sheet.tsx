'use client';

// CompendiumSearchSheet — cross-category search overlay for the Biblioteca landing
// (docs/ROADMAP.md §1 item 4). Opens over the landing grid rather than replacing it —
// this is the same tap-to-open / tap-outside-to-close bottom-sheet pattern V3Sheet
// already provides everywhere else in the app (DetailSheet, forms, pickers), so search
// gets a familiar interaction instead of a new one.
//
// Debounce + cancellation (REQ-BIB-SEARCH-02): 300ms debounce (vs. 200ms for a single
// category in CompendiumList) — every keystroke here fans out ×8 requests instead of 1,
// so the extra 100ms meaningfully cuts wasted round trips over the home-lab tunnel.
// Two layers of cancellation: (1) the debounce timer itself is cleared on every keystroke,
// so a value that never "settles" for 300ms never fires a request at all; (2) a reqIdRef
// stale-drop (cloned from CompendiumList) guards the case where an earlier query's request
// DID fire and is still in flight when a later one resolves first — the earlier response is
// applied only if it is still the current request, so a slow "fir" can never overwrite "fireball".
//
// Minimum query length (REQ-BIB-SEARCH-03): the API accepts q from 1 character, but at 1
// character fanning out ×8 requests per keystroke is wasteful for a query that cannot be
// meaningfully narrowed yet. 2 characters is the chosen floor — short enough that no real
// PHB entry name gets excluded, long enough to skip the least useful keystroke.
//
// Partial failure (REQ-BIB-SEARCH-04): searchAllCategories always returns one entry per
// category, ok:true or ok:false — never drops a category. Categories that failed are named
// explicitly, with their own Spanish network-error wording, alongside whatever succeeded.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { V3Sheet } from '@/components/ui';
import { CATEGORY_CONFIG } from '../[category]/_config/registry';
import { searchAllCategories, type CategorySearchResult } from '../actions';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

interface SearchResultRow {
  slug: string;
  source: string;
  name: string;
  [key: string]: unknown;
}

interface CompendiumSearchSheetProps {
  open: boolean;
  onClose: () => void;
  /** Active campaign UUID. null → sheet opens but explains a campaign is required. */
  campaignId: string | null;
}

export function CompendiumSearchSheet({ open, onClose, campaignId }: CompendiumSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CategorySearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const reqIdRef = useRef(0);

  const trimmed = query.trim();

  // Reset to a clean slate every time the sheet closes, so reopening it starts fresh
  // rather than showing stale results from the previous search (mirrors DetailSheet).
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
      setSearching(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !campaignId || trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const res = await searchAllCategories(campaignId, trimmed);
      // Stale-drop: only apply this response if no newer request has been fired since.
      if (reqIdRef.current === myReqId) {
        setResults(res);
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [open, campaignId, trimmed]);

  const failed = results?.filter((r) => !r.ok) ?? [];
  const groups = results?.filter((r) => r.ok && r.rows.length > 0) ?? [];
  const totalMatches = groups.reduce((sum, g) => sum + g.rows.length, 0);

  return (
    <V3Sheet open={open} onClose={onClose} title="Buscar en la Biblioteca">
      <input
        type="search"
        inputMode="search"
        data-autofocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Hechizo, item, monstruo…"
        aria-label="Buscar en toda la Biblioteca"
        className="min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-4 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
      />

      <div className="mt-4 flex flex-col gap-4">
        {!campaignId ? (
          <p className="py-8 text-center text-sm text-ink-soft">
            Seleccioná una campaña para buscar en la Biblioteca.
          </p>
        ) : trimmed.length < MIN_QUERY_LENGTH ? (
          <p className="py-8 text-center text-sm text-ink-soft">
            Escribí al menos 2 letras para buscar en todas las categorías.
          </p>
        ) : searching ? (
          <p className="py-8 text-center text-sm text-ink-soft" aria-live="polite">
            Buscando…
          </p>
        ) : results === null ? null : (
          <>
            {failed.length > 0 && <SearchFailureNotice failed={failed} />}

            {totalMatches === 0 ? (
              <p className="py-8 text-center text-sm text-ink-soft">
                Sin resultados para &ldquo;{trimmed}&rdquo;.
              </p>
            ) : (
              groups.map((group) => (
                <CategoryResultGroup
                  key={group.category}
                  group={group}
                  campaignId={campaignId}
                  query={trimmed}
                  onNavigate={onClose}
                />
              ))
            )}
          </>
        )}
      </div>
    </V3Sheet>
  );
}

function SearchFailureNotice({ failed }: { failed: CategorySearchResult[] }) {
  return (
    <div role="alert" className="rounded-md border border-line bg-paper-soft px-3 py-2 text-xs text-ink-soft">
      <p className="font-medium text-ink">No pudimos buscar en algunas categorías:</p>
      <ul className="mt-1 list-disc pl-4">
        {failed.map((r) => (
          <li key={r.category}>
            {CATEGORY_CONFIG[r.category].label}: {r.errorMessage ?? 'Error desconocido'}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CategoryResultGroupProps {
  group: CategorySearchResult;
  campaignId: string;
  query: string;
  onNavigate: () => void;
}

function CategoryResultGroup({ group, campaignId, query, onNavigate }: CategoryResultGroupProps) {
  const config = CATEGORY_CONFIG[group.category];
  const rows = group.rows as SearchResultRow[];
  const hasMore = group.total > rows.length;

  return (
    <div>
      <div className="flex items-baseline gap-2.5 pb-1">
        <span className="font-display font-semibold text-[17px] leading-tight tracking-tight text-ink">
          {config.label}
        </span>
        <span className="ml-auto text-[11px] font-semibold text-ink-mute tracking-wide">
          {group.total} resultado{group.total === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={`${row.source}:${row.slug}`}>
            <Link
              href={`/compendium/${config.endpoint}?campaign=${campaignId}&q=${encodeURIComponent(row.name)}`}
              onClick={onNavigate}
              className="block min-h-[44px] hover:bg-paper-soft transition-colors"
            >
              <config.RowView row={row} />
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Link
          href={`/compendium/${config.endpoint}?campaign=${campaignId}&q=${encodeURIComponent(query)}`}
          onClick={onNavigate}
          className="mt-1 block py-2 text-xs font-medium text-ink-soft hover:text-ink"
        >
          Ver los {group.total} resultados en {config.label} →
        </Link>
      )}
    </div>
  );
}

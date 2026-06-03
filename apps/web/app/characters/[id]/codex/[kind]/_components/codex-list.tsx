'use client';

// CodexList — character-scoped knowledge browser island.
//
// Thin variant of CompendiumList (apps/web/app/compendium/[category]/_components/compendium-list.tsx).
// Mirrors the RSC boundary workaround: imports CODEX_CATEGORY_CONFIG and codex actions
// at MODULE LEVEL — do NOT pass config or actions as props from a Server Component.
// RowView and Header are function components that cannot be serialized across the RSC boundary.
//
// Differences from CompendiumList:
//   - Calls searchCodexCategory (→ /characters/:id/knowledge/:kind)
//   - Calls getCodexDetail via worldId (→ /compendium/:category/:slug?world=)
//   - Resolves config by `kind` string from CODEX_CATEGORY_CONFIG (not CATEGORY_CONFIG)
//
// REQ-CCB-WEB-02, REQ-CCB-WEB-03, ADR-4 (character-codex-browser design)

import { useEffect, useRef, useState } from 'react';
import { V3Sheet } from '@/components/ui';
import { CompendiumEntriesWithTerms } from '@/components/compendium/term/CompendiumEntriesWithTerms';
import type { Entry } from '@/components/compendium/types';
import type { ComponentType } from 'react';
import { CODEX_CATEGORY_CONFIG, type CodexKind } from '../_config/registry';
import { searchCodexCategory, getCodexDetail } from '../actions';

interface CodexListProps {
  kind: CodexKind;
  charId: string;
  worldId: string;
  accessToken: string;
  initialRows: unknown[];
  total: number;
  effectiveView: 'dm' | 'player';
}

// ---------------------------------------------------------------------------
// CodexDetailSheet — reuses V3Sheet + CompendiumEntriesWithTerms directly.
// Calls getCodexDetail (→ ?world=) instead of getCompendiumDetail (→ ?campaign=).
// This keeps the global DetailSheet component untouched (ADR-2 isolation).
// ---------------------------------------------------------------------------

/** Minimal config surface needed by CodexDetailSheet — avoids coupling to CategoryConfig shape. */
interface CodexDetailConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Header: ComponentType<{ data: any }>;
}

interface CodexDetailSheetProps {
  open: boolean;
  category: string;
  row: unknown;
  worldId: string;
  accessToken: string;
  config: CodexDetailConfig;
  onClose: () => void;
}

function CodexDetailSheet({
  open,
  category,
  row,
  worldId,
  accessToken,
  config,
  onClose,
}: CodexDetailSheetProps) {
  const [detail, setDetail] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const rowRecord = row as Record<string, unknown>;
  const displayName = (rowRecord.name as string | undefined) ?? '…';

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setLoading(true);
      setError(false);
      return;
    }

    const slug = rowRecord.slug as string;
    const source = rowRecord.source as string;
    if (!slug || !source) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    // Call codex-scoped detail action (→ /compendium/:category/:slug?world=)
    getCodexDetail(category, worldId, slug, source)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setError(true);
        } else {
          setDetail(result);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category, worldId, rowRecord.slug, rowRecord.source]);

  const detailRecord = detail as Record<string, unknown> | null;
  const entries = detailRecord?.data
    ? ((detailRecord.data as Record<string, unknown>).entries as Entry[] | undefined) ?? []
    : [];

  return (
    <V3Sheet open={open} onClose={onClose} title={displayName}>
      {loading ? (
        <div className="py-8 text-center text-sm text-ink-soft" aria-live="polite">
          Cargando…
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500" aria-live="polite">
          No se pudo cargar el detalle.
        </div>
      ) : detail !== null ? (
        <div>
          <config.Header data={detail} />
          <div className="mt-4">
            <CompendiumEntriesWithTerms
              entries={entries}
              worldId={worldId}
              accessToken={accessToken}
            />
          </div>
        </div>
      ) : null}
    </V3Sheet>
  );
}

// ---------------------------------------------------------------------------
// CodexList — main list island
// ---------------------------------------------------------------------------

/**
 * CodexList — paginated + searchable character knowledge list island.
 * REQ-CCB-WEB-02: debounced search, stale-drop. REQ-CCB-WEB-03: 44px tap targets @375px.
 */
export function CodexList({
  kind,
  charId,
  worldId,
  accessToken,
  initialRows,
  total: initialTotal,
  effectiveView,
}: CodexListProps) {
  // Resolve config client-side — avoids passing function components as props (RSC boundary).
  const config = CODEX_CATEGORY_CONFIG[kind];

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<unknown[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [offset, setOffset] = useState(initialRows.length);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<unknown | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);

  // Debounced search — 200ms, stale-drop. Mirrors CompendiumList pattern.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(initialRows);
      setTotalCount(initialTotal);
      setOffset(initialRows.length);
      setSearching(false);
      return;
    }

    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const res = await searchCodexCategory(charId, kind, trimmed, 0);
      if (reqIdRef.current === myReqId) {
        setResults(res.rows);
        setTotalCount(res.total);
        setOffset(res.rows.length);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, charId, kind, initialRows, initialTotal]);

  async function handleLoadMore() {
    if (loadingMore || offset >= totalCount) return;
    setLoadingMore(true);
    const trimmed = query.trim();
    const res = await searchCodexCategory(charId, kind, trimmed, offset);
    setResults((prev) => [...prev, ...res.rows]);
    setTotalCount(res.total);
    setOffset((prev) => prev + res.rows.length);
    setLoadingMore(false);
  }

  const hasMore = offset < totalCount;

  return (
    <div className="flex flex-col">
      {/* Effective view banner — DM only */}
      {effectiveView === 'dm' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700">
          Vista de DM — mostrando todos los monstruos con indicador de conocimiento
        </div>
      )}

      {/* Sticky search input — REQ-CCB-WEB-02, 44px min-height */}
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
        <div className="px-4 py-8 text-center text-sm text-ink-soft">
          {query.trim().length > 0 ? 'Sin resultados' : 'No hay entradas descubiertas aún.'}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {results.map((row, i) => {
            const r = row as Record<string, unknown>;
            return (
              <li key={i}>
                <button
                  type="button"
                  className="relative w-full min-h-[44px] px-4 text-left hover:bg-paper-soft transition-colors"
                  onClick={() => setSelected(row)}
                >
                  <config.RowView row={row} />
                  {/* DM-only known indicator (REQ-CCB-WEB-03) */}
                  {effectiveView === 'dm' && r.known === true && (
                    <span
                      aria-label="Conocido por el personaje"
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-green-500"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Load more */}
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

      {/* Detail sheet — opens on row tap, uses world scope (ADR-2) */}
      {selected !== null && (
        <CodexDetailSheet
          open={true}
          category={config.compendiumCategory}
          row={selected}
          worldId={worldId}
          accessToken={accessToken}
          config={config}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

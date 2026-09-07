'use client';

// WorldEntityShell<TRow, TDetail> — generic reusable island for world-content entities.
//
// Composes: debounced search (200ms, stale-drop via reqIdRef — cloned from compendium-list.tsx),
// 44px-min-height list rows (divide-y), V3Sheet for detail view, DM-gated FAB (create),
// DM-gated edit/delete inside detail sheet.
//
// CRITICAL RSC BOUNDARY: slot functions (renderRow, renderDetail, renderForm) CANNOT be
// passed from a Server Component — function props are not serializable across the RSC→Client
// boundary in Next.js. They MUST be supplied by a per-entity CLIENT wrapper.
// See compendium-list.tsx comment for the same constraint.
//
// REQ-FAC-01, REQ-GATE-01: DM affordances (FAB/edit/delete) render ONLY when
// effectiveView === 'dm' — absent from DOM entirely for players, not just disabled.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { V3Sheet } from '@/components/ui';

export type EffectiveView = 'dm' | 'player';

export interface WorldEntityShellProps<TRow, TDetail> {
  /** Initial SSR-hydrated list rows. */
  items: TRow[];
  /** Total row count (for "load more" logic). */
  total: number;
  /** Computed from callerRole + viewPref on the Server Component. */
  effectiveView: EffectiveView;
  /** Placeholder for the search input. */
  searchPlaceholder: string;
  /**
   * Called (debounced 200ms) on query change.
   * Returns updated rows + total from the Server Action.
   */
  onSearch: (q: string, offset: number) => Promise<{ rows: TRow[]; total: number }>;
  /**
   * Called when the user taps a list row.
   * Returns full detail object (or null on error).
   */
  onLoadDetail: (row: TRow) => Promise<TDetail | null>;
  /** Render a single list row body (≥44px supplied by parent via min-h-[44px] wrapper). */
  renderRow: (row: TRow) => ReactNode;
  /** Render the detail view inside V3Sheet. */
  renderDetail: (detail: TDetail, view: EffectiveView) => ReactNode;
  /**
   * Render the create/edit form inside V3Sheet (DM-only).
   * Receives `mode`, the current detail (null for create), and `onDone` callback.
   */
  renderForm?: (
    mode: 'create' | 'edit',
    initial: TDetail | null,
    onDone: () => void,
  ) => ReactNode;
  /** DM-only: delete a row. Called from delete button in detail sheet. */
  onDelete?: (row: TRow) => Promise<void>;
  /**
   * Title for the TRUE-empty state (no rows AND no active query). Distinct from a
   * filtered no-match. Defaults to a generic line. Per-entity wrappers can pass a
   * specific one (e.g. "Todavía no hay facciones").
   */
  emptyTitle?: string;
  /**
   * Hint under the empty title, shown to DMs only (they own the create FAB).
   * Defaults to a pointer at the + button.
   */
  emptyHint?: string;
}

/**
 * WorldEntityShell<TRow, TDetail> — generic world-entity client island.
 * Standard Mode (no TDD). REQ-FAC-01, REQ-GATE-01.
 */
export function WorldEntityShell<TRow, TDetail>({
  items,
  total: initialTotal,
  effectiveView,
  searchPlaceholder,
  onSearch,
  onLoadDetail,
  renderRow,
  renderDetail,
  renderForm,
  onDelete,
  emptyTitle,
  emptyHint,
}: WorldEntityShellProps<TRow, TDetail>) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TRow[]>(items);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [offset, setOffset] = useState(items.length);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);

  // Detail sheet state
  const [selectedRow, setSelectedRow] = useState<TRow | null>(null);
  const [detail, setDetail] = useState<TDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Form sheet state (DM-only)
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formInitial, setFormInitial] = useState<TDetail | null>(null);

  // Deleting state
  const [deleting, setDeleting] = useState(false);

  // ─── Debounced search (200ms, stale-drop) ───────────────────────────────────
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(items);
      setTotalCount(initialTotal);
      setOffset(items.length);
      setSearching(false);
      return;
    }

    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const res = await onSearch(trimmed, 0);
      if (reqIdRef.current === myReqId) {
        setResults(res.rows as TRow[]);
        setTotalCount(res.total);
        setOffset(res.rows.length);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, items, initialTotal, onSearch]);

  // ─── Load more ──────────────────────────────────────────────────────────────
  async function handleLoadMore() {
    if (loadingMore || offset >= totalCount) return;
    setLoadingMore(true);
    const trimmed = query.trim();
    const res = await onSearch(trimmed, offset);
    setResults((prev) => [...prev, ...(res.rows as TRow[])]);
    setTotalCount(res.total);
    setOffset((prev) => prev + res.rows.length);
    setLoadingMore(false);
  }

  // ─── Row tap → open detail sheet ────────────────────────────────────────────
  async function handleRowTap(row: TRow) {
    setSelectedRow(row);
    setDetail(null);
    setDetailError(false);
    setDetailLoading(true);
    setDetailOpen(true);

    try {
      const d = await onLoadDetail(row);
      if (d === null) {
        setDetailError(true);
      } else {
        setDetail(d);
      }
    } catch {
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCloseDetail() {
    setDetailOpen(false);
    setSelectedRow(null);
    setDetail(null);
    setDetailError(false);
  }

  // ─── FAB → open create form (DM-only) ────────────────────────────────────────
  function handleOpenCreate() {
    setFormMode('create');
    setFormInitial(null);
    setFormOpen(true);
  }

  // ─── Edit button → open edit form (DM-only) ──────────────────────────────────
  function handleOpenEdit() {
    if (!detail) return;
    setFormMode('edit');
    setFormInitial(detail);
    setFormOpen(true);
  }

  function handleFormDone() {
    setFormOpen(false);
    handleCloseDetail();
    // Re-fetch the SSR list so the created/edited row shows immediately. The list-reset
    // effect (deps include `items`) propagates the refreshed data into `results`.
    router.refresh();
  }

  // ─── Delete (DM-only) ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selectedRow || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(selectedRow);
      handleCloseDetail();
      router.refresh(); // re-fetch SSR list so the deleted row disappears immediately
    } catch {
      // Surface error inline — just stop deleting; user can retry
    } finally {
      setDeleting(false);
    }
  }

  const hasMore = offset < totalCount;
  const isDM = effectiveView === 'dm';

  return (
    <div className="flex flex-col">
      {/* Search input — sticky, 44px min-height */}
      <div className="sticky top-0 z-10 border-b border-line bg-paper px-4 py-2">
        <input
          type="search"
          inputMode="search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={searchPlaceholder}
          className="min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-4 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* List */}
      {searching ? (
        <div className="px-4 py-8 text-center text-sm text-ink-soft">Buscando…</div>
      ) : results.length === 0 ? (
        query.trim() !== '' ? (
          // Filtered no-match: concise is fine, the query is the context.
          <div className="px-4 py-8 text-center text-sm text-ink-soft">
            Sin resultados para «{query.trim()}»
          </div>
        ) : (
          // True empty (nothing created yet): guide the user, and point DMs at the + FAB.
          <div className="px-6 py-14 text-center">
            <p className="font-display text-lg text-ink">
              {emptyTitle ?? 'Todavía no hay nada acá'}
            </p>
            {isDM && (
              <p className="mt-1.5 text-sm text-ink-soft">
                {emptyHint ?? 'Tocá el botón + para crear el primero.'}
              </p>
            )}
          </div>
        )
      ) : (
        <ul className="divide-y divide-line">
          {results.map((row, i) => (
            <li key={i}>
              <button
                type="button"
                className="min-h-[44px] w-full px-4 text-left transition-colors hover:bg-paper-soft"
                onClick={() => handleRowTap(row)}
              >
                {renderRow(row)}
              </button>
            </li>
          ))}
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

      {/* Detail sheet */}
      <V3Sheet open={detailOpen} onClose={handleCloseDetail} title="Detalle">
        {detailLoading ? (
          <div className="py-8 text-center text-sm text-ink-soft" aria-live="polite">
            Cargando…
          </div>
        ) : detailError ? (
          <div className="py-8 text-center text-sm text-red-500" aria-live="polite">
            No se pudo cargar el detalle.
          </div>
        ) : detail !== null ? (
          <div>
            {renderDetail(detail, effectiveView)}

            {/* DM-only action buttons inside detail sheet */}
            {isDM && (
              <div className="mt-6 flex gap-3">
                {renderForm && (
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    className="min-h-[44px] flex-1 rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper"
                  >
                    Editar
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="min-h-[44px] flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? 'Eliminando…' : 'Eliminar'}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </V3Sheet>

      {/* Form sheet (DM-only: create / edit) */}
      {isDM && renderForm && (
        <V3Sheet
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={formMode === 'create' ? 'Crear' : 'Editar'}
        >
          {renderForm(formMode, formInitial, handleFormDone)}
        </V3Sheet>
      )}

      {/* FAB — DM-only: fixed bottom-right, above TabBar (pb-28) */}
      {isDM && renderForm && (
        <button
          type="button"
          aria-label="Crear"
          onClick={handleOpenCreate}
          className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-surface shadow-stamp-lg transition-transform hover:scale-105 active:scale-95"
        >
          <span aria-hidden="true" className="text-2xl leading-none">+</span>
        </button>
      )}
    </div>
  );
}

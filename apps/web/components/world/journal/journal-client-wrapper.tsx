'use client';

// JournalClientWrapper — CLIENT RSC boundary for Notas.
//
// ADR-2: This wrapper exists specifically because render slots (renderRow, renderDetail,
// renderForm) and Server Action callbacks cannot be passed as props from a Server Component
// across the RSC→Client boundary. Function components are not serializable.
//
// This component receives only serializable props from the Server Component (worldId,
// effectiveView, initialEntries, initialTag) and wires up all the typed slot functions
// internally before passing them to WorldEntityShell<JournalRow, JournalRow>.
//
// REQ-CRO-03, REQ-GATE-01: tag filter chip row; dm-only notes filtered by API + client guard.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { WorldEntityShell } from '@/components/world/_shell/world-entity-shell';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { JournalRowView } from './journal-row';
import { JournalDetailView } from './journal-detail';
import { JournalForm } from './journal-form';
import {
  listJournalEntries,
  getJournalDetail,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
} from '@/app/bitacora/actions';
import type { JournalRow, JournalBody } from '@/app/bitacora/actions';

// ---------------------------------------------------------------------------
// Dependency injection bundle
// ---------------------------------------------------------------------------

export type JournalWrapperActions = {
  listJournalEntries: typeof listJournalEntries;
  getJournalDetail: typeof getJournalDetail;
  createJournalEntry: typeof createJournalEntry;
  updateJournalEntry: typeof updateJournalEntry;
  deleteJournalEntry: typeof deleteJournalEntry;
};

const DEFAULT_JOURNAL_ACTIONS: JournalWrapperActions = {
  listJournalEntries,
  getJournalDetail,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
};

// ---------------------------------------------------------------------------

interface JournalClientWrapperProps {
  worldId: string;
  effectiveView: EffectiveView;
  initialEntries: JournalRow[];
  initialTag?: string;
  /** Optional action bundle for catalog/testing; defaults to real server actions. */
  actions?: JournalWrapperActions;
}

/**
 * Collects unique tags from a journal entry list for the chip filter row.
 * REQ-CRO-03: tag filter chips.
 */
function collectTags(entries: JournalRow[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      seen.add(tag);
    }
  }
  return Array.from(seen).sort();
}

export function JournalClientWrapper({
  worldId,
  effectiveView,
  initialEntries,
  initialTag,
  actions,
}: JournalClientWrapperProps) {
  const a = actions ?? DEFAULT_JOURNAL_ACTIONS;
  const router = useRouter();
  const [activeTag, setActiveTag] = useState<string | undefined>(initialTag);
  const [knownTags] = useState<string[]>(() => collectTags(initialEntries));

  // Filter initial entries by the active tag on the client side for immediate feedback
  const filteredInitial = activeTag
    ? initialEntries.filter((entry) => entry.tags.includes(activeTag))
    : initialEntries;

  // ─── Tag filter chip click ───────────────────────────────────────────────────
  function handleTagClick(tag: string) {
    const next = activeTag === tag ? undefined : tag;
    setActiveTag(next);
    const url = next ? `/bitacora/notas?tag=${encodeURIComponent(next)}` : '/bitacora/notas';
    router.push(url);
  }

  // ─── Slot: renderRow ────────────────────────────────────────────────────────
  function renderRow(row: JournalRow): ReactNode {
    return <JournalRowView row={row} />;
  }

  // ─── Slot: renderDetail ─────────────────────────────────────────────────────
  function renderDetail(detail: JournalRow, view: EffectiveView): ReactNode {
    return <JournalDetailView detail={detail} effectiveView={view} />;
  }

  // ─── Slot: renderForm (DM-only) ─────────────────────────────────────────────
  function renderForm(
    mode: 'create' | 'edit',
    initial: JournalRow | null,
    onDone: () => void,
  ): ReactNode {
    async function handleSubmit(body: JournalBody) {
      if (mode === 'create') {
        const result = await a.createJournalEntry(worldId, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      } else {
        if (!initial?.id) return { ok: false, error: 'ID de nota desconocido' };
        const result = await a.updateJournalEntry(initial.id, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      }
    }

    return (
      <JournalForm
        mode={mode}
        initial={initial}
        onSubmit={handleSubmit}
        onDone={onDone}
      />
    );
  }

  // ─── onSearch ───────────────────────────────────────────────────────────────
  async function onSearch(q: string, offset: number) {
    return a.listJournalEntries(worldId, q, offset, activeTag);
  }

  // ─── onLoadDetail ───────────────────────────────────────────────────────────
  async function onLoadDetail(row: JournalRow) {
    return a.getJournalDetail(row.id);
  }

  // ─── onDelete (DM-only) ─────────────────────────────────────────────────────
  async function onDelete(row: JournalRow) {
    await a.deleteJournalEntry(row.id);
  }

  return (
    <div>
      {/* Tag filter chip row — REQ-CRO-03 */}
      {knownTags.length > 0 && (
        <div
          aria-label="Filtrar por etiqueta"
          className="mb-3 flex flex-wrap gap-2"
        >
          {knownTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className={[
                'inline-flex min-h-[44px] items-center rounded-full border px-4 py-2 text-xs font-medium transition-colors',
                activeTag === tag
                  ? 'border-ink bg-ink text-surface'
                  : 'border-line bg-paper-soft text-ink hover:bg-paper',
              ].join(' ')}
              aria-pressed={activeTag === tag}
            >
              {tag}
            </button>
          ))}
          {activeTag && (
            <button
              type="button"
              onClick={() => handleTagClick(activeTag)}
              className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-paper-soft px-4 py-2 text-xs font-medium text-ink-soft hover:bg-paper"
            >
              Limpiar filtro ×
            </button>
          )}
        </div>
      )}

      <WorldEntityShell<JournalRow, JournalRow>
        items={filteredInitial}
        total={filteredInitial.length}
        effectiveView={effectiveView}
        searchPlaceholder="Buscar notas…"
        onSearch={onSearch}
        onLoadDetail={onLoadDetail}
        renderRow={renderRow}
        renderDetail={renderDetail}
        renderForm={renderForm}
        onDelete={onDelete}
      />
    </div>
  );
}

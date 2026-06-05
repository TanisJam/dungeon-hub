'use client';

// EventClientWrapper — CLIENT RSC boundary for Eventos.
//
// ADR-2: This wrapper exists specifically because render slots (renderRow, renderDetail,
// renderForm) and Server Action callbacks cannot be passed as props from a Server Component
// across the RSC→Client boundary. Function components are not serializable.
//
// This component receives only serializable props from the Server Component (worldId,
// effectiveView, initialEvents, initialTag) and wires up all the typed slot functions
// internally before passing them to WorldEntityShell<EventRow, EventRow>.
//
// REQ-CRO-02, REQ-GATE-01: tag filter chip row; dm-only events filtered by API + client guard.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { WorldEntityShell } from '@/components/world/_shell/world-entity-shell';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { EventRowView } from './event-row';
import { EventDetailView } from './event-detail';
import { EventForm } from './event-form';
import {
  listEvents,
  getEventDetail,
  createEvent,
  updateEvent,
  deleteEvent,
} from '@/app/cronica/actions';
import type { EventRow, EventBody } from '@/app/cronica/actions';

// ---------------------------------------------------------------------------
// Dependency injection bundle
// ---------------------------------------------------------------------------

export type EventWrapperActions = {
  listEvents: typeof listEvents;
  getEventDetail: typeof getEventDetail;
  createEvent: typeof createEvent;
  updateEvent: typeof updateEvent;
  deleteEvent: typeof deleteEvent;
};

const DEFAULT_EVENT_ACTIONS: EventWrapperActions = {
  listEvents,
  getEventDetail,
  createEvent,
  updateEvent,
  deleteEvent,
};

// ---------------------------------------------------------------------------

interface EventClientWrapperProps {
  worldId: string;
  effectiveView: EffectiveView;
  initialEvents: EventRow[];
  initialTag?: string;
  /** Optional action bundle for catalog/testing; defaults to real server actions. */
  actions?: EventWrapperActions;
}

/**
 * Collects unique tags from an event list for the chip filter row.
 * REQ-CRO-02: tag filter chips.
 */
function collectTags(events: EventRow[]): string[] {
  const seen = new Set<string>();
  for (const ev of events) {
    for (const tag of ev.tags) {
      seen.add(tag);
    }
  }
  return Array.from(seen).sort();
}

export function EventClientWrapper({
  worldId,
  effectiveView,
  initialEvents,
  initialTag,
  actions,
}: EventClientWrapperProps) {
  const a = actions ?? DEFAULT_EVENT_ACTIONS;
  const router = useRouter();
  const [activeTag, setActiveTag] = useState<string | undefined>(initialTag);
  // Collect tags from the initial list for the chip row (may grow as search results change)
  const [knownTags] = useState<string[]>(() => collectTags(initialEvents));

  // Filter initial events by the active tag on the client side for immediate feedback
  const filteredInitial = activeTag
    ? initialEvents.filter((ev) => ev.tags.includes(activeTag))
    : initialEvents;

  // ─── Tag filter chip click ───────────────────────────────────────────────────
  function handleTagClick(tag: string) {
    const next = activeTag === tag ? undefined : tag;
    setActiveTag(next);
    // Update URL so SSR re-fetches the filtered list on next navigation
    const url = next ? `/cronica/eventos?tag=${encodeURIComponent(next)}` : '/cronica/eventos';
    router.push(url);
  }

  // ─── Slot: renderRow ────────────────────────────────────────────────────────
  function renderRow(row: EventRow): ReactNode {
    return <EventRowView row={row} />;
  }

  // ─── Slot: renderDetail ─────────────────────────────────────────────────────
  function renderDetail(detail: EventRow, view: EffectiveView): ReactNode {
    return <EventDetailView detail={detail} effectiveView={view} />;
  }

  // ─── Slot: renderForm (DM-only) ─────────────────────────────────────────────
  function renderForm(
    mode: 'create' | 'edit',
    initial: EventRow | null,
    onDone: () => void,
  ): ReactNode {
    async function handleSubmit(body: EventBody) {
      if (mode === 'create') {
        const result = await a.createEvent(worldId, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      } else {
        if (!initial?.id) return { ok: false, error: 'ID de evento desconocido' };
        const result = await a.updateEvent(initial.id, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      }
    }

    return (
      <EventForm
        mode={mode}
        initial={initial}
        onSubmit={handleSubmit}
        onDone={onDone}
      />
    );
  }

  // ─── onSearch ───────────────────────────────────────────────────────────────
  async function onSearch(q: string, offset: number) {
    return a.listEvents(worldId, q, offset, activeTag);
  }

  // ─── onLoadDetail ───────────────────────────────────────────────────────────
  async function onLoadDetail(row: EventRow) {
    return a.getEventDetail(row.id);
  }

  // ─── onDelete (DM-only) ─────────────────────────────────────────────────────
  async function onDelete(row: EventRow) {
    await a.deleteEvent(row.id);
  }

  return (
    <div>
      {/* Tag filter chip row — REQ-CRO-02 */}
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

      <WorldEntityShell<EventRow, EventRow>
        items={filteredInitial}
        total={filteredInitial.length}
        effectiveView={effectiveView}
        searchPlaceholder="Buscar eventos…"
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

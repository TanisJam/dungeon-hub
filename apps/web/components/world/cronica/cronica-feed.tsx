'use client';

/**
 * CronicaFeed — unified guild bitácora feed client component.
 *
 * bitacora-gremio W4, ADR-4, ADR-5, ADR-6.
 * REQ-GREM-FD-01, REQ-GREM-FD-02, REQ-GREM-FD-03, REQ-GREM-FD-05.
 *
 * Renders:
 *   - TagFilter pinned under the AppShell header
 *   - Vertical stack of FeedCard (full-bleed at 375px, mobile-first)
 *   - "Load more" pagination (offset-based, nextOffset from API)
 *   - "Aportar" button (player entry point for ContributionComposer)
 *   - V3Empty when items.length === 0 after load
 *
 * Props:
 *   worldId       — required
 *   source        — optional facet filter ('gremio' | 'dm' | 'evento')
 *   initialItems  — SSR initial rows (avoids client waterfall on first render)
 *   initialTag    — active tag from ?tag= URL param (optional)
 *   initialNextOffset — nextOffset from SSR fetch (optional)
 *   effectiveView — 'dm' | 'player' (passed through from page)
 */

import { useState } from 'react';
import { V3Empty, V3Sheet } from '@/components/ui';
import { listCronicaFeed } from '@/app/cronica/actions';
import type { FeedItem, FeedSource } from '@/app/cronica/actions';
import { FeedCard } from './feed-card';
import { TagFilter } from './tag-filter';
import { ContributionComposer } from '@/components/codex/contribution-composer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CronicaFeedProps {
  worldId: string;
  source?: FeedSource;
  initialItems: FeedItem[];
  initialTag?: string;
  initialNextOffset?: number | null;
  effectiveView?: 'dm' | 'player';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CronicaFeed({
  worldId,
  source,
  initialItems,
  initialTag,
  initialNextOffset = null,
  effectiveView = 'player',
}: CronicaFeedProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [activeTag, setActiveTag] = useState<string | null>(initialTag ?? null);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [loading, setLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Re-fetch from offset=0 when tag changes
  async function handleTagChange(tag: string | null) {
    setActiveTag(tag);
    setLoading(true);
    try {
      const result = await listCronicaFeed(worldId, {
        ...(tag !== null ? { tag } : {}),
        ...(source ? { source } : {}),
        offset: 0,
      });
      setItems(result.rows);
      setNextOffset(result.nextOffset);
    } finally {
      setLoading(false);
    }
  }

  // Load more (append to list)
  async function handleLoadMore() {
    if (nextOffset === null || loading) return;
    setLoading(true);
    try {
      const result = await listCronicaFeed(worldId, {
        ...(activeTag !== null ? { tag: activeTag } : {}),
        ...(source ? { source } : {}),
        offset: nextOffset,
      });
      setItems((prev) => [...prev, ...result.rows]);
      setNextOffset(result.nextOffset);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-20">
      {/* Tag chip strip — pinned under header (sticky handled by AppShell spacing) */}
      <div className="sticky top-0 z-10 bg-paper pt-2 pb-1">
        <TagFilter activeTag={activeTag} onTagChange={handleTagChange} />
      </div>

      {/* Feed list */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-ink-soft text-sm">
          Cargando…
        </div>
      ) : items.length === 0 ? (
        <V3Empty
          glyph="scroll"
          title="Sin entradas"
          sub="Aquí aparecerán las notas del gremio, eventos y notas del mundo."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Load more */}
      {nextOffset !== null && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loading}
          className="mt-2 w-full min-h-[44px] rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          {loading ? 'Cargando…' : 'Cargar más'}
        </button>
      )}

      {/* "Aportar" entry point — opens ContributionComposer for general guild notes */}
      {/* Accessible from /cronica (player write path, REQ-GREM-FD-05) */}
      <div className="fixed bottom-6 right-4 z-20">
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper shadow-lg"
          aria-label="Aportar nota al gremio"
        >
          <span aria-hidden="true">+</span>
          <span>Aportar</span>
        </button>
      </div>

      {/* ContributionComposer with optional tags — no entity ref (general guild note) */}
      {composerOpen && (
        <V3Sheet open={composerOpen} onClose={() => setComposerOpen(false)} title="Nueva aportación">
          <ContributionComposer
            worldId={worldId}
            onClose={() => setComposerOpen(false)}
            onSuccess={(newItem) => {
              if (newItem) {
                setItems((prev) => [newItem, ...prev]);
              }
              setComposerOpen(false);
            }}
          />
        </V3Sheet>
      )}
    </div>
  );
}

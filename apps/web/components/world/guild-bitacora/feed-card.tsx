/**
 * FeedCard — renders one normalized FeedItem in the unified guild bitácora feed.
 *
 * bitacora-gremio W4, ADR-4, REQ-GREM-FD-02.
 * REQ-RENAME-03 (barrido-final): moved from components/world/cronica/ → guild-bitacora/.
 * Mobile-first 375px: full-bleed card, no hover-dependent interactions.
 * Source badge: gremio | dm | evento.
 * Seal badge: confirmed (green) | debunked (red, body struck-through). Read-path
 * tolerance: debunked rows render degraded — never hidden, never crash (gc-invariants #1808).
 * Tags: compact chips, display-only (non-interactive on the card).
 * Min 44px tap target per mobile-first convention (CLAUDE.md §2).
 */

import type { FeedItem, FeedSource } from '@/app/bitacora/actions';
import { Pill } from '@/components/ui';

// ---------------------------------------------------------------------------
// Source label + tone map
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<FeedSource, string> = {
  gremio: 'Gremio',
  dm: 'DM',
  evento: 'Evento',
};

// ---------------------------------------------------------------------------
// Entity kind → display label map (guild-feed-linked-entity-refs ADR-5)
// ---------------------------------------------------------------------------

const ENTITY_KIND_LABEL: Record<string, string> = {
  bestiary: 'Bestiario',
  npc: 'NPC',
  faction: 'Facción',
  location: 'Lugar',
};

const SOURCE_TONE: Record<FeedSource, 'primary' | 'accent' | 'secondary'> = {
  gremio: 'primary',
  dm: 'accent',
  evento: 'secondary',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function snippet(text: string | null, maxLen = 120): string {
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FeedCardProps {
  item: FeedItem;
}

export function FeedCard({ item }: FeedCardProps) {
  const isDebunked = item.sealedStatus === 'debunked';
  const isConfirmed = item.sealedStatus === 'confirmed';

  return (
    <article className="relative w-full rounded-lg border border-line bg-paper px-4 py-3 flex flex-col gap-2 min-h-[44px]">
      {/* Header row: source badge + seal badge + date */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Source badge: show "Bitácora" when gremio + sourceBitacoraPageId present (ADR-7 REQ-SHARE-07) */}
        {item.source === 'gremio' && item.sourceBitacoraPageId ? (
          <Pill tone="primary" fill="soft" size="sm">
            Bitácora
          </Pill>
        ) : (
          <Pill tone={SOURCE_TONE[item.source]} fill="soft" size="sm">
            {SOURCE_LABEL[item.source]}
          </Pill>
        )}

        {isConfirmed && (
          <Pill tone="success" fill="soft" size="sm">
            Confirmado
          </Pill>
        )}
        {isDebunked && (
          <Pill tone="danger" fill="soft" size="sm">
            Refutado
          </Pill>
        )}

        <span className="ml-auto text-[10px] text-ink-soft">{formatDate(item.sortAt)}</span>
      </div>

      {/* Title or body snippet */}
      {item.title ? (
        <h3 className={`text-sm font-semibold text-ink leading-snug${isDebunked ? ' line-through opacity-60' : ''}`}>
          {item.title}
        </h3>
      ) : null}

      {item.body ? (
        <p className={`text-sm text-ink-mute leading-relaxed${isDebunked ? ' line-through opacity-60' : ''}`}>
          {snippet(item.body)}
        </p>
      ) : null}

      {/* Tag chips — display only */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-pill bg-paper-soft px-2 py-0.5 text-[10px] font-medium text-ink-soft"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Linked-entity card — v1 non-interactive display (guild-feed-linked-entity-refs REQ-GFLE-06, ADR-5)
          Renders ONLY when refEntityName is present (null/undefined = no card, no regression).
          Mobile-first 375px: full-width, min-h-[44px] tap target (iOS HIG).
          SECURITY: name only — dmNotes and parentHexStatus NEVER rendered here (ADR-6). */}
      {item.refEntityName ? (
        <div
          data-testid="entity-card"
          className="flex w-full items-center gap-2 rounded-md border border-line bg-paper-soft px-3 min-h-[44px]"
        >
          {item.refEntityKind && ENTITY_KIND_LABEL[item.refEntityKind] ? (
            <span className="shrink-0 rounded-pill bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {ENTITY_KIND_LABEL[item.refEntityKind]}
            </span>
          ) : null}
          <span className="truncate text-sm font-medium text-ink">{item.refEntityName}</span>
        </div>
      ) : null}
    </article>
  );
}

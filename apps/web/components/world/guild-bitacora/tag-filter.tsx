'use client';

/**
 * TagFilter — horizontal scroll-snap row of KNOWLEDGE_TAGS chips.
 *
 * bitacora-gremio W4, ADR-4, REQ-GREM-FD-03.
 * REQ-RENAME-03 (barrido-final): moved from components/world/cronica/ → guild-bitacora/.
 * Mobile-first 375px: overflow-x-auto, scroll-snap, thumb-swipeable, no hover.
 * Selecting a chip calls onTagChange(tag); deselecting calls onTagChange(null).
 * "Todo" chip = deselect (show all).
 *
 * No PHB rule. Knowledge tag vocabulary from @dungeon-hub/domain (KNOWLEDGE_TAGS).
 */

import { KNOWLEDGE_TAGS } from '@dungeon-hub/domain/world/codex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TagFilterProps {
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
}

// ---------------------------------------------------------------------------
// Label map (Spanish display labels matching the app language)
// ---------------------------------------------------------------------------

const TAG_LABELS: Record<string, string> = {
  monsters: 'Monstruos',
  locations: 'Lugares',
  npcs: 'PNJs',
  factions: 'Facciones',
  lore: 'Tradición',
  items: 'Objetos',
  spells: 'Hechizos',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TagFilter({ activeTag, onTagChange }: TagFilterProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scroll-smooth scroll-fade-r"
      style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      aria-label="Filtro por etiqueta"
    >
      {/* "Todo" chip — deselects active tag */}
      <button
        type="button"
        onClick={() => onTagChange(null)}
        aria-pressed={activeTag === null}
        className={[
          'flex-none scroll-snap-align-start rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
          'min-h-[36px] whitespace-nowrap',
          activeTag === null
            ? 'bg-ink text-paper'
            : 'bg-paper-soft text-ink-soft hover:bg-paper hover:text-ink',
        ].join(' ')}
      >
        Todo
      </button>

      {/* KNOWLEDGE_TAGS chips */}
      {KNOWLEDGE_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onTagChange(activeTag === tag ? null : tag)}
          aria-pressed={activeTag === tag}
          className={[
            'flex-none scroll-snap-align-start rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
            'min-h-[36px] whitespace-nowrap',
            activeTag === tag
              ? 'bg-ink text-paper'
              : 'bg-paper-soft text-ink-soft hover:bg-paper hover:text-ink',
          ].join(' ')}
        >
          {TAG_LABELS[tag] ?? tag}
        </button>
      ))}
    </div>
  );
}

// ListRow — flat divider-style list row atom.
// Leading content: title (required) + optional subtitle, both truncated.
// Trailing slot: any ReactNode (Pill, meta text, action icons).
// REQ-C2-01: models "title + optional subtitle + trailing slot" row pattern,
//            used by NpcRow / FactionRow / EventRow / JournalRow / HexRow.

import type { ReactNode } from 'react';

export interface ListRowProps {
  /** Primary text — always visible, truncated when too long. */
  title: string;
  /**
   * Secondary text line below the title (e.g. date, terrain).
   * Absent when not provided — no empty element in the DOM.
   */
  subtitle?: string;
  /** Trailing content slot: Pill, badge, action, etc. */
  trailing?: ReactNode;
  /** Extra Tailwind classes for layout overrides applied to the root div. */
  className?: string;
}

/**
 * ListRow — atom for the recurring "horizontal list row with leading
 * title/subtitle block and a trailing slot" pattern.
 *
 * Visual grammar: flat divider-style (py-2, no background card).
 * The wrapper is expected to provide min-h-[44px] via its own list-item.
 *
 * Covers: NpcRow, FactionRow, EventRow, JournalRow, HexRow.
 * NOT used for: QuestRow (card variant with icon+chevron — see quest-row.tsx).
 */
export function ListRow({ title, subtitle, trailing, className }: ListRowProps) {
  const rootClass = [
    'flex items-center justify-between gap-2 py-2',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      {/* Leading: title + optional subtitle */}
      {subtitle !== undefined ? (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span data-title className="truncate text-sm font-medium text-ink">
            {title}
          </span>
          <span data-subtitle className="truncate text-xs text-ink-soft">
            {subtitle}
          </span>
        </div>
      ) : (
        <span data-title className="flex-1 truncate text-sm font-medium text-ink">
          {title}
        </span>
      )}

      {/* Trailing slot */}
      {trailing}
    </div>
  );
}

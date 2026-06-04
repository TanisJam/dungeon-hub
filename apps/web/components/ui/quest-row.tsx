// QuestRow — tappable card-row atom for dm quest lists.
// Visual grammar: rounded-xl bg-surface-raised card, icon cell + title/sub + chevron.
// REQ-C2-02: extracted from quests-sin-tocar-list and pendientes-sheet-content (copy-paste).

export interface QuestRowProps {
  /** Quest title — truncated when too long. */
  title: string;
  /** Secondary info line (e.g. "Último cambio: hace 3 días"). */
  subtitle: string;
  /** Extra Tailwind classes for layout overrides applied to the root element. */
  className?: string;
}

/**
 * QuestRow — atom for the copy-pasted dm quest card-row.
 *
 * Visual grammar: card-row (rounded-xl bg-surface-raised px-3 py-2.5),
 * with a leading icon cell (inicio-row-quest-ic), title/sub, and trailing chevron.
 *
 * Used by:
 *   QuestsSinTocarList (quests-sin-tocar-list.tsx)
 *   PendientesSheetContent (pendientes-sheet-content.tsx)
 *
 * NOT used for: flat world-entity rows — see list-row.tsx.
 */
export function QuestRow({ title, subtitle, className }: QuestRowProps) {
  const rootClass = [
    'flex items-center gap-3 rounded-xl bg-surface-raised px-3 py-2.5',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={rootClass} data-quest-row>
      {/* Magenta scroll icon-cell */}
      <span className="inicio-row-quest-ic flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-base">
        📜
      </span>

      {/* Title + subtitle */}
      <div className="flex-1 min-w-0">
        <p data-quest-title className="text-sm font-semibold text-ink truncate">
          {title}
        </p>
        <p className="text-xs text-ink-mute mt-0.5">{subtitle}</p>
      </div>

      {/* Chevron */}
      <span className="text-ink-mute text-base flex-shrink-0">›</span>
    </li>
  );
}

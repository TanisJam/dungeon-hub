/**
 * BreakdownTree — pure Server Component.
 *
 * Renders a provenance breakdown from the resolution engine.
 * REQ-TREE-01, REQ-TREE-02 (spec #1111). Design Decision 3 (#1112):
 * native <details>/<summary>, zero client JS, mobile-first 375px.
 *
 * No 'use client' — collapsibility provided by native <details>.
 */
import type { Source } from '@dungeon-hub/domain';

interface BreakdownTreeProps {
  /** Stat name — displayed in the summary header (e.g. 'ac'). */
  stat: string;
  /** Final resolved value. */
  value: number;
  /** Ordered breakdown sources; base is typically first. */
  breakdown: Source[];
}

/**
 * Format a source amount as a signed string for display.
 * Numbers: +1, -2, +12. Dice strings: shown as-is (e.g. "1d4").
 */
function formatAmount(amount: number | string): string {
  if (typeof amount === 'number') {
    return amount >= 0 ? `+${amount}` : `${amount}`;
  }
  return String(amount);
}

/** Render a single source row + optional nested children. */
function SourceRow({ source }: { source: Source }) {
  const hasChildren = source.children && source.children.length > 0;

  return (
    <li className="py-0.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="flex-1 text-ink">{source.label}</span>
        <span className="font-mono text-ink-soft tabular-nums">
          {formatAmount(source.amount)}
        </span>
        <span className="rounded bg-surface px-1 py-0.5 text-xs text-ink-mute">
          {source.type}
        </span>
      </div>

      {hasChildren && (
        <ul className="pl-3 border-l border-surface-raised mt-0.5 space-y-0.5">
          {source.children!.map((child, i) => (
            <SourceRow key={`${child.label}-${i}`} source={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function BreakdownTree({ stat, value, breakdown }: BreakdownTreeProps) {
  return (
    <details open className="w-full">
      <summary className="flex items-center gap-2 cursor-pointer select-none py-1 min-h-[44px]">
        <span className="font-mono text-xs uppercase text-ink-mute">{stat}</span>
        <span className="text-2xl font-bold text-ink tabular-nums">{value}</span>
      </summary>

      <ul className="mt-2 space-y-1 overflow-x-hidden">
        {breakdown.map((source, i) => (
          <SourceRow key={`${source.label}-${i}`} source={source} />
        ))}
      </ul>
    </details>
  );
}

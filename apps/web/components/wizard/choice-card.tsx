import type { ReactNode } from 'react';
import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';

interface ChoiceCardProps {
  title: string;
  sub?: string;
  metaPills?: Array<{ tone?: PillTone; label: string }>;
  selected: boolean;
  children?: ReactNode; // detail content — rendered inline when selected
  onClick: () => void;
}

export function ChoiceCard({
  title,
  sub,
  metaPills,
  selected,
  children,
  onClick,
}: ChoiceCardProps) {
  return (
    <div
      className={[
        'rounded-md border transition-all overflow-hidden',
        selected
          ? 'border-accent bg-accent-soft shadow-[0_0_0_2px_var(--color-accent-deep)]'
          : 'border-line bg-surface hover:border-accent-soft',
      ].join(' ')}
    >
      {/* Always-visible header */}
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* Checkmark or empty circle */}
        <span
          className={[
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
            selected
              ? 'border-accent bg-accent text-paper'
              : 'border-line-soft bg-paper-soft',
          ].join(' ')}
          aria-hidden="true"
        >
          {selected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path
                d="M1 4L4 7L9 1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-ink-mute">{sub}</p>}
        </div>

        {metaPills && metaPills.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1">
            {metaPills.map((p, i) => (
              <Pill key={i} tone={p.tone ?? 'stone'} size="sm">
                {p.label}
              </Pill>
            ))}
          </div>
        )}
      </button>

      {/* Inline detail — only shown when selected */}
      {selected && children && (
        <div className="border-t border-accent-soft/40 bg-paper px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

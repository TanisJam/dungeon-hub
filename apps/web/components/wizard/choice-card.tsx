import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';

/** Deterministically pick one of 5 icon-square gradient tones from a slug. */
const ICON_TONES = [
  'accent',     // peach
  'primary',    // forest green
  'secondary',  // indigo
  'warning',    // amber
  'coral',      // coral/rose
] as const;

type IconToneKey = (typeof ICON_TONES)[number];

function slugToTone(slug: string): IconToneKey {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return ICON_TONES[Math.abs(h) % ICON_TONES.length]!;
}

const TONE_BG: Record<IconToneKey, string> = {
  accent:    'bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-deep))]',
  primary:   'bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-deep))]',
  secondary: 'bg-[linear-gradient(135deg,var(--color-secondary),var(--color-secondary-deep))]',
  warning:   'bg-[linear-gradient(135deg,var(--color-warning),var(--color-warning-deep))]',
  coral:     'bg-[linear-gradient(135deg,var(--color-secondary-soft),var(--color-secondary))]',
};

interface ChoiceCardProps {
  /** Used for deterministic icon-square color when iconTone is omitted. */
  id?: string;
  title: string;
  subtitle?: string;
  /** Legacy alias for subtitle — accepted so existing callers don't break. */
  sub?: string;
  pills?: Array<{ tone?: PillTone; label: string }>;
  /** Legacy alias for pills — accepted so existing callers don't break. */
  metaPills?: Array<{ tone?: PillTone; label: string }>;
  iconName?: IconName;
  iconTone?: IconToneKey;
  selected: boolean;
  /** Detail content rendered inline below the row when selected. */
  detail?: ReactNode;
  /** Legacy alias for detail — accepted so existing callers don't break. */
  children?: ReactNode;
  onClick: () => void;
}

export function ChoiceCard({
  id,
  title,
  subtitle,
  sub,
  pills,
  metaPills,
  iconName = 'sparkle',
  iconTone,
  selected,
  detail,
  children,
  onClick,
}: ChoiceCardProps) {
  const resolvedSubtitle = subtitle ?? sub;
  const resolvedPills = pills ?? metaPills;
  const resolvedDetail = detail ?? children;
  const tone = iconTone ?? slugToTone(id ?? title);
  const gradientBg = TONE_BG[tone];

  return (
    <div
      className={[
        'rounded-md border transition-all overflow-hidden',
        selected
          ? 'border-accent bg-accent-soft shadow-[0_0_0_1px_var(--color-accent)]'
          : 'border-line bg-surface hover:border-ink-mute',
      ].join(' ')}
    >
      {/* Always-visible header row */}
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        {/* Icon square — 44×44, rounded, gradient */}
        <span
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-paper',
            gradientBg,
          ].join(' ')}
          aria-hidden="true"
        >
          <Icon name={iconName} size={18} strokeWidth={2} className="text-paper opacity-90" />
        </span>

        {/* Middle: title + subtitle + pills */}
        <div className="min-w-0 flex-1">
          <p
            className={[
              'truncate font-display text-base font-semibold leading-tight',
              selected ? 'text-ink' : 'text-ink',
            ].join(' ')}
          >
            {title}
          </p>
          {resolvedSubtitle && (
            <p className="mt-0.5 truncate text-[11px] italic text-ink-mute">{resolvedSubtitle}</p>
          )}
          {resolvedPills && resolvedPills.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {resolvedPills.map((p, i) => (
                <Pill key={i} tone={p.tone ?? 'stone'} size="sm">
                  {p.label}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* Right: check (selected) or chevron */}
        <span
          className={[
            'flex shrink-0 items-center justify-center',
            selected ? 'text-accent' : 'text-ink-mute',
          ].join(' ')}
          aria-hidden="true"
        >
          {selected ? (
            <Icon name="check" size={18} strokeWidth={2.5} />
          ) : (
            <Icon name="arrow-right" size={16} strokeWidth={1.75} />
          )}
        </span>
      </button>

      {/* Inline detail — only shown when selected */}
      {selected && resolvedDetail && (
        <div className="border-t border-accent-soft/50 bg-paper px-4 py-4">
          {resolvedDetail}
        </div>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';

export type ToggleChipTone = 'accent' | 'secondary';

interface ToggleChipProps {
  tone?: ToggleChipTone;
  active?: boolean;
  onClick?: () => void;
  ariaPressed?: boolean;
  ariaLabel?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}

const activeClasses: Record<ToggleChipTone, string> = {
  accent:    'border-accent/45 text-accent bg-accent-soft/60',
  secondary: 'border-secondary/45 text-secondary bg-secondary-soft/60',
};

const inactiveClasses: Record<ToggleChipTone, string> = {
  accent:    'border-line text-ink-mute bg-transparent',
  secondary: 'border-line text-ink-mute bg-transparent',
};

// The button is the TAP TARGET; the span is the pill you see.
//
// Splitting them is what lets the chip stay visually compact while still meeting
// the 44px minimum this codebase applies everywhere else (global-error.tsx,
// not-found.tsx, and REQ-CLU-SUB-UI-MOBILE in subclass-picker.tsx). Before
// this, the whole control measured 21.5px tall —
// under half the minimum, on an app whose primary surface is a phone
// (CLAUDE.md §2). Putting min-h-[44px] on the pill itself would have stretched a
// 9px-text capsule to 44px and wrecked it; an ::after overlay would have fixed
// the real hit area but not the measured height, so a11y checks would still read
// it as too small. A transparent 44px button around the pill fixes both.
const HIT_AREA =
  'inline-flex min-h-[44px] items-center justify-center bg-transparent p-0 hover:brightness-110 active:translate-y-px';

const PILL =
  'inline-flex items-center gap-1 rounded-pill border px-2 py-[3px] font-sans text-[9px] font-bold uppercase tracking-[0.08em] transition-colors';

export function ToggleChip({
  tone = 'accent',
  active = true,
  onClick,
  ariaPressed,
  ariaLabel,
  title,
  children,
  className,
}: ToggleChipProps) {
  const toneState = active ? activeClasses[tone] : inactiveClasses[tone];
  const extra = className ? ` ${className}` : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed}
      aria-label={ariaLabel}
      title={title}
      className={`${HIT_AREA}${extra}`}
    >
      <span className={`${PILL} ${toneState}`}>{children}</span>
    </button>
  );
}

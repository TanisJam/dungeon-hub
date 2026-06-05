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

const BASE =
  'inline-flex items-center gap-1 rounded-pill border px-2 py-[3px] font-sans text-[9px] font-bold uppercase tracking-[0.08em] transition-colors hover:brightness-110 active:translate-y-px';

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
      className={`${BASE} ${toneState}${extra}`}
    >
      {children}
    </button>
  );
}

export type ProgressBarTone = 'accent' | 'arcane' | 'primary';
export type ProgressBarHeight = 'sm' | 'md';

export interface ProgressBarProps {
  /** Current value (clamped to [0, max] for the fill). */
  value: number;
  /** Maximum value. max <= 0 → 0% fill (no division by zero). */
  max: number;
  /**
   * Fill colour (orthogonal to height/track — NOT named after callers):
   * - 'accent' (default): bg-accent
   * - 'arcane': arcane→arcane-deep gradient (XP)
   * - 'primary': bg-primary
   */
  tone?: ProgressBarTone;
  /** Track height: 'sm' (h-1) or 'md' (h-1.5, default). */
  height?: ProgressBarHeight;
  /**
   * Track background override. Defaults to bg-paper-muted (on-light surfaces).
   * Pass e.g. "bg-white/10" for on-dark surfaces or "bg-accent/20" for a tinted track.
   */
  trackClassName?: string;
  /** Extra classes on the track element (layout concerns e.g. mt-2). */
  className?: string;
  /** Aria-label for the progressbar. */
  ariaLabel?: string;
}

const FILL_TONE: Record<ProgressBarTone, string> = {
  accent: 'bg-accent',
  arcane: 'bg-gradient-to-r from-arcane to-arcane-deep',
  primary: 'bg-primary',
};

const TRACK_HEIGHT: Record<ProgressBarHeight, string> = {
  sm: 'h-1',
  md: 'h-1.5',
};

/**
 * ProgressBar — atom for the recurring "thin track + width%-filled bar" pattern.
 *
 * Unifies the hand-rolled bars in sheet-hero (XP), vital-grid (HP), and the codex
 * discovery page. Owns the structure (overflow-hidden rounded track + width% fill)
 * and the pct math; callers pick tone (fill), height, and an optional track bg.
 *
 * NOT for: the encumbrance bar (status-coloured + threshold tick marks — a distinct
 * richer widget) or bottom-sheet drag handles (not progress).
 */
export function ProgressBar({
  value,
  max,
  tone = 'accent',
  height = 'md',
  trackClassName = 'bg-paper-muted',
  className,
  ariaLabel,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;

  const trackClass = [
    'w-full overflow-hidden rounded-full',
    TRACK_HEIGHT[height],
    trackClassName,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={trackClass}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${FILL_TONE[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

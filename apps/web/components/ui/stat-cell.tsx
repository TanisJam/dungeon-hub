import type { ReactNode } from 'react';

export type StatCellSize = 'default' | 'compact';
export type StatCellSurface = 'surface' | 'paper';
export type StatCellAccent = 'teal' | 'magenta' | 'peach';

interface StatCellProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  size?: StatCellSize;
  surface?: StatCellSurface;
  accent?: StatCellAccent;
  selected?: boolean;
  onClick?: () => void;
  footer?: ReactNode;
  /**
   * Corner affordance (the HP edit pencil). The cell owns the positioning so a
   * caller cannot place it against the page instead of the cell.
   *
   * It is drawn over the label's row, so a cell with an action needs a label
   * short enough to clear a 24px corner mark: at 375px the cell is 109px wide
   * and offers 85px of content. Reserving the width instead was tried and
   * rejected — it pushes short labels off-centre on desktop, where the cell is
   * four times wider and the clearance is free. See audit F7.
   *
   * Not for use with `onClick`: an interactive cell is itself a button, and a
   * button inside a button is invalid.
   */
  action?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

// Map accent → CSS class name (defined in globals.css)
const accentClass: Record<StatCellAccent, string> = {
  teal:    'ficha-vital-ac',
  magenta: 'ficha-vital-init',
  peach:   'ficha-vital-hp',
};

export function StatCell({
  label,
  value,
  sub,
  size = 'default',
  surface = 'surface',
  accent,
  selected = false,
  onClick,
  footer,
  action,
  className,
  ariaLabel,
}: StatCellProps) {
  const isNull = value === null || value === undefined;

  // ── Surface classes ────────────────────────────────────────────────────
  // peach owns its own bg + border via .ficha-vital-hp — do NOT add surface classes
  // teal/magenta layer a glow on top of the standard surface bg
  let surfaceClasses: string;
  if (accent === 'peach') {
    // ficha-vital-hp provides gradient bg + border itself
    surfaceClasses = '';
  } else if (surface === 'paper') {
    surfaceClasses = 'bg-paper-soft';
  } else {
    // surface (default): bg-surface + explicit border
    surfaceClasses = 'bg-surface border border-line';
  }

  // ── Border override for null value ────────────────────────────────────
  // When value is null: use dashed border (remove solid surface border if present)
  const nullBorderClasses = isNull ? 'border-dashed border-line-soft' : '';

  // ── Selected ring ─────────────────────────────────────────────────────
  const selectedClasses = selected
    ? 'shadow-[0_0_0_2px_var(--color-accent)] border-accent-deep'
    : '';

  // ── Interactive button classes ─────────────────────────────────────────
  const interactiveClasses = onClick
    ? 'transition-all select-none hover:border-accent active:scale-95 w-full'
    : '';

  // ── Accent glow class ─────────────────────────────────────────────────
  const accentGlowClass = accent ? accentClass[accent] : '';

  // ── Value size class ──────────────────────────────────────────────────
  const valueSizeClass = size === 'compact' ? 'text-lg' : 'text-2xl';

  // ── Compose container className ───────────────────────────────────────
  // `relative` scopes any absolutely-positioned slot content (footer, value) to the
  // cell. Without it such a child escapes to the initial containing block: the HP
  // edit pencil rendered at the page's top-right corner, underneath the sticky
  // topbar, where it was neither visible nor tappable. No visual effect on its own
  // — `position: relative` with no offsets and no z-index creates no stacking context.
  const containerClasses = [
    'relative flex flex-col items-center text-center rounded-md px-3 py-4',
    accentGlowClass,
    surfaceClasses,
    isNull ? nullBorderClasses : '',
    selectedClasses,
    interactiveClasses,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── Content ───────────────────────────────────────────────────────────
  const labelEl = (
    <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
      {label}
    </span>
  );

  const valueEl = isNull ? (
    <span className="text-ink-mute text-xs mt-0.5">—</span>
  ) : (
    <span
      data-stat-value
      className={`font-display font-bold text-ink leading-tight mt-0.5 ${valueSizeClass}`}
    >
      {value}
    </span>
  );

  const subEl = sub !== undefined && sub !== null ? (
    typeof sub === 'string' ? (
      <span data-stat-sub className="mt-1 text-[10px] text-ink-soft leading-tight">
        {sub}
      </span>
    ) : (
      <div data-stat-sub className="mt-1">
        {sub}
      </div>
    )
  ) : null;

  const footerEl = footer !== undefined && footer !== null ? (
    footer
  ) : null;

  const actionEl = action !== undefined && action !== null ? (
    <div data-stat-action className="absolute top-1 right-1">
      {action}
    </div>
  ) : null;

  const content = (
    <>
      {actionEl}
      {labelEl}
      {valueEl}
      {subEl}
      {footerEl}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={containerClasses}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={containerClasses}>
      {content}
    </div>
  );
}

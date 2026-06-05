import type { ReactNode } from 'react';

export type PillTone = 'primary' | 'accent' | 'secondary' | 'ink' | 'stone' | 'amber' | 'danger' | 'success' | 'neutral';
export type PillFill = 'soft' | 'solid' | 'outline' | 'tint';
export type PillSize = 'sm' | 'md';

interface PillProps {
  tone?: PillTone;
  fill?: PillFill;
  size?: PillSize;
  className?: string;
  children: ReactNode;
}

// ── Soft fill (default) — existing behavior, zero-regression ─────────────────
const softClasses: Record<PillTone, string> = {
  primary:   'bg-primary-soft text-primary-deep',
  accent:    'bg-accent-soft text-accent-deep',
  secondary: 'bg-secondary-soft text-secondary-deep',
  ink:       'bg-ink text-surface',
  stone:     'bg-paper-soft text-ink-soft',
  amber:     'bg-warning-soft text-warning-deep',
  danger:    'bg-danger-soft text-danger',
  success:   'bg-success-soft text-success',
  neutral:   'bg-paper-soft text-ink-soft',
};

// ── Solid fill — brand bg + on-color text ────────────────────────────────────
const solidClasses: Record<PillTone, string> = {
  primary:   'bg-primary text-surface',
  accent:    'bg-accent text-on-accent',
  secondary: 'bg-secondary text-on-secondary',
  ink:       'bg-ink text-surface',
  stone:     'bg-ink-soft text-surface',
  amber:     'bg-warning text-surface',
  danger:    'bg-danger text-white',
  success:   'bg-success text-white',
  neutral:   'bg-white text-ink',
};

// ── Outline fill — transparent bg, colored border + text ─────────────────────
const outlineClasses: Record<PillTone, string> = {
  primary:   'border border-primary/50 text-primary bg-transparent',
  accent:    'border border-accent/50 text-accent bg-transparent',
  secondary: 'border border-secondary/50 text-secondary bg-transparent',
  ink:       'border border-ink/50 text-ink bg-transparent',
  stone:     'border border-ink-soft/50 text-ink-soft bg-transparent',
  amber:     'border border-warning/50 text-warning bg-transparent',
  danger:    'border border-danger/50 text-danger bg-transparent',
  success:   'border border-success/50 text-success bg-transparent',
  neutral:   'border border-white/40 text-white/90 bg-transparent',
};

// ── Tint fill — translucent brand bg + brand border + brand text ─────────────
const tintClasses: Record<PillTone, string> = {
  primary:   'bg-primary/10 border border-primary/40 text-primary',
  accent:    'bg-accent/10 border border-accent/40 text-accent',
  secondary: 'bg-secondary/10 border border-secondary/40 text-secondary',
  ink:       'bg-ink/10 border border-ink/40 text-ink',
  stone:     'bg-ink-soft/10 border border-ink-soft/40 text-ink-soft',
  amber:     'bg-warning/10 border border-warning/40 text-warning',
  danger:    'bg-danger/10 border border-danger/40 text-danger',
  success:   'bg-success/10 border border-success/40 text-success',
  neutral:   'bg-white/10 border border-white/30 text-white/90',
};

const fillMap: Record<PillFill, Record<PillTone, string>> = {
  soft:    softClasses,
  solid:   solidClasses,
  outline: outlineClasses,
  tint:    tintClasses,
};

const sizeClasses: Record<PillSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
};

export function Pill({
  tone = 'stone',
  fill = 'soft',
  size = 'md',
  className,
  children,
}: PillProps) {
  const toneClass = fillMap[fill][tone];
  const sizeClass = sizeClasses[size];
  const extra = className ? ` ${className}` : '';

  return (
    <span
      data-tone={tone}
      data-fill={fill}
      className={`inline-flex items-center gap-1 rounded-pill font-medium ${toneClass} ${sizeClass}${extra}`}
    >
      {children}
    </span>
  );
}

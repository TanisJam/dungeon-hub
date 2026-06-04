import type { ReactNode } from 'react';

interface SectionHeadProps {
  num?: number | string;
  title: string;
  meta?: ReactNode;
  description?: ReactNode;
  /**
   * Visual density:
   * - 'sm' (default): original SectionHead look — items-baseline, pb-1,
   *   num pill px-2 py-0.5 text-xs.
   * - 'md': NumberedSectionHead density — wrapper mb-5, items-center,
   *   num pill h-6 min-w-6 px-1.5 text-[11px]. num is required in practice
   *   for wizard pages.
   *
   * Note: a future slice could converge sm and md to a single visual density
   * if Mauricio decides to standardise. Flag for that decision before acting.
   */
  size?: 'sm' | 'md';
}

export function SectionHead({ num, title, meta, description, size = 'sm' }: SectionHeadProps) {
  if (size === 'md') {
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          {num !== undefined && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-pill bg-accent-soft px-1.5 text-[11px] font-bold text-accent-deep leading-none tracking-wide">
              {num}
            </span>
          )}
          <span className="font-display font-semibold text-[17px] leading-tight tracking-tight text-ink">
            {title}
          </span>
          {meta && (
            <span className="ml-auto text-[11px] font-semibold text-ink-mute tracking-wide">
              {meta}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-2 text-sm text-ink-mute leading-snug">{description}</p>
        )}
      </div>
    );
  }

  // size === 'sm' (default) — original SectionHead look
  return (
    <div className="flex items-baseline gap-2.5 pb-1">
      {num !== undefined && (
        <span className="inline-flex items-center rounded-pill bg-accent-soft text-accent-deep text-xs font-bold px-2 py-0.5 leading-tight tracking-wide">
          {num}
        </span>
      )}
      <span className="font-display font-semibold text-[17px] leading-tight tracking-tight text-ink">
        {title}
      </span>
      {meta && (
        <span className="ml-auto text-[11px] font-semibold text-ink-mute tracking-wide">
          {meta}
        </span>
      )}
      {description && (
        <p className="mt-2 text-sm text-ink-mute leading-snug">{description}</p>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';

interface NumberedSectionHeadProps {
  num: string;
  title: string;
  meta?: ReactNode;
  description?: ReactNode;
}

/**
 * Numbered section header used across wizard steps.
 * Shows a small accent circle with a number, a title, and an optional right-aligned meta label.
 * Optionally renders a description paragraph below.
 */
export function NumberedSectionHead({
  num,
  title,
  meta,
  description,
}: NumberedSectionHeadProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-pill bg-accent-soft px-1.5 text-[11px] font-bold text-accent-deep leading-none tracking-wide">
          {num}
        </span>
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

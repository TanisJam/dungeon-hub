import type { ReactNode } from 'react';

interface SectionHeadProps {
  num?: number | string;
  title: string;
  meta?: ReactNode;
}

export function SectionHead({ num, title, meta }: SectionHeadProps) {
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
    </div>
  );
}

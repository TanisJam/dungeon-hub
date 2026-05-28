import type { ReactNode } from 'react';

export type PillTone = 'green' | 'pink' | 'coral' | 'ink' | 'stone' | 'amber';
export type PillSize = 'sm' | 'md';

interface PillProps {
  tone?: PillTone;
  size?: PillSize;
  children: ReactNode;
}

const toneClasses: Record<PillTone, string> = {
  green:  'bg-primary-soft text-primary-deep',
  pink:   'bg-accent-soft text-accent-deep',
  coral:  'bg-secondary-soft text-secondary-deep',
  ink:    'bg-ink text-surface',
  stone:  'bg-paper-soft text-ink-soft',
  amber:  'bg-warning-soft text-warning-deep',
};

const sizeClasses: Record<PillSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
};

export function Pill({ tone = 'stone', size = 'md', children }: PillProps) {
  return (
    <span
      data-tone={tone}
      className={`inline-flex items-center gap-1 rounded-pill font-medium ${toneClasses[tone]} ${sizeClasses[size]}`}
    >
      {children}
    </span>
  );
}

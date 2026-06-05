import type { ReactNode } from 'react';

interface BannerProps {
  tone: 'amber' | 'ink' | 'stone' | 'danger';
  children: ReactNode;
}

const toneClasses: Record<BannerProps['tone'], string> = {
  amber: 'bg-warning-soft text-warning-deep border-warning',
  ink: 'bg-ink text-surface',
  stone: 'bg-paper-soft text-ink-soft border-line',
  danger: 'bg-danger-soft text-danger border-danger',
};

export function Banner({ tone, children }: BannerProps) {
  return (
    <div
      className={`w-full rounded-md border px-4 py-2.5 text-sm font-medium text-center ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}

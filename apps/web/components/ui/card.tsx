import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'surface' | 'surface-soft' | 'ink';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  surface: 'bg-surface border border-line rounded-md shadow-stamp-md',
  'surface-soft': 'bg-surface-soft border border-line-soft rounded-md shadow-stamp-sm',
  ink: [
    'rounded-lg overflow-hidden',
    'shadow-[0_12px_32px_rgba(39,30,51,0.25)]',
    '[background:radial-gradient(120%_80%_at_0%_0%,rgba(232,148,111,0.20),transparent_50%),radial-gradient(80%_60%_at_100%_100%,rgba(111,134,201,0.20),transparent_50%),linear-gradient(180deg,#2A2240_0%,#1B1428_100%)]',
  ].join(' '),
};

export function Card({ variant = 'surface', children, className, ...rest }: CardProps) {
  return (
    <div className={`${variantClasses[variant]} ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}

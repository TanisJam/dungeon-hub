/**
 * ScrollNav — horizontal-scroll container primitive (C4 — scroll-pill-nav).
 *
 * Provides a consistent horizontal-scroll strip with scrollbar hidden
 * cross-browser. Used by SheetTabs and StatusFilterChips.
 *
 * Scrollbar hiding: [scrollbar-width:none] (Firefox) +
 * [&::-webkit-scrollbar]:hidden (Chromium/Safari) via Tailwind 4 arbitrary
 * variants — the standard approach in this codebase.
 *
 * Sub-nav is NOT adopted here: it is a segmented control (overflow-hidden,
 * no scroll) — structurally incompatible with ScrollNav.
 */

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

type As = 'div' | 'nav';

interface ScrollNavOwnProps {
  /** Render as <nav> (accessibility) or <div> (default). */
  as?: As;
  /** Tailwind gap class. Defaults to gap-1.5. */
  gap?: string;
  /** Additional classes merged onto root element. */
  className?: string;
  children: ReactNode;
  /** aria-label forwarded to root (useful when as="nav"). */
  'aria-label'?: string;
}

export type ScrollNavProps = ScrollNavOwnProps;

export function ScrollNav({
  as: Tag = 'div',
  gap = 'gap-1.5',
  className,
  children,
  'aria-label': ariaLabel,
}: ScrollNavProps) {
  const classes = [
    'flex',
    gap,
    'overflow-x-auto',
    '[scrollbar-width:none]',
    '[&::-webkit-scrollbar]:hidden',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} aria-label={ariaLabel} data-scroll-nav="">
      {children}
    </Tag>
  );
}

// SubNav — horizontal pill strip for Codex/Crónica sub-routes.
// REQ-FAC-04: 2 pills ≥44px height, fills 375px width (half-width each).
// Rendered inside <main> above entity list.
// Server Component — no 'use client' needed (uses Link only).

import Link from 'next/link';

interface SubNavItem {
  label: string;
  href: string;
}

interface SubNavProps {
  items: SubNavItem[];
  /** Current pathname — used to mark the active pill. */
  activePath: string;
}

/**
 * SubNav — horizontal pill strip for tab sub-navigation.
 * Each pill is a Next.js Link, ≥44px tall, half-width on a 375px viewport.
 * REQ-FAC-04, REQ-GATE-03 (mobile-first).
 */
export function SubNav({ items, activePath }: SubNavProps) {
  return (
    <nav
      aria-label="Navegación de sección"
      className="mb-4 flex overflow-hidden rounded-lg border border-line"
    >
      {items.map((item) => {
        const isActive = activePath === item.href || activePath.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'flex min-h-[44px] flex-1 items-center justify-center px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-ink text-surface'
                : 'bg-paper text-ink-soft hover:bg-paper-soft hover:text-ink',
            ].join(' ')}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

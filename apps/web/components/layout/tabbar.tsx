'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';

type TabBarProps = {
  /** Optional override for the Constructor tab destination (defaults to /characters/new) */
  constructorHref?: string;
};

export function TabBar({ constructorHref = '/characters/new' }: TabBarProps) {
  const pathname = usePathname();

  const fichaActive =
    pathname === '/dashboard' || /^\/characters\/[^/]+$/.test(pathname);
  const constructorActive =
    pathname === '/characters/new' || /\/wizard\//.test(pathname) || /\/wizard$/.test(pathname);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 grid grid-cols-2 bg-surface border-t border-line z-40"
      aria-label="Navegación principal"
    >
      <Link
        href="/dashboard"
        className={[
          'flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors',
          fichaActive ? 'bg-primary-soft text-primary-deep' : 'text-ink-mute hover:text-ink-soft',
        ].join(' ')}
        aria-current={fichaActive ? 'page' : undefined}
      >
        <Icon name="user" size={20} strokeWidth={fichaActive ? 2 : 1.75} />
        <span
          className={[
            'text-[11px] tracking-wide uppercase',
            fichaActive ? 'font-bold' : 'font-medium',
          ].join(' ')}
        >
          Ficha
        </span>
      </Link>

      <Link
        href={constructorHref}
        className={[
          'flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors',
          constructorActive
            ? 'bg-primary-soft text-primary-deep'
            : 'text-ink-mute hover:text-ink-soft',
        ].join(' ')}
        aria-current={constructorActive ? 'page' : undefined}
      >
        <Icon name="sparkle" size={20} strokeWidth={constructorActive ? 2 : 1.75} />
        <span
          className={[
            'text-[11px] tracking-wide uppercase',
            constructorActive ? 'font-bold' : 'font-medium',
          ].join(' ')}
        >
          Constructor
        </span>
      </Link>
    </nav>
  );
}

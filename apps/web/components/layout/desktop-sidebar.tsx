'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';

type Destination = { key: string; label: string; icon: IconName; href: string };

/**
 * Desktop-only sidebar navigation (md+ breakpoint) — desktop-shell.
 * Mirrors TabBar's world-scoped nav plus Personajes/Campañas (REQ-DSHELL-SIDEBAR-01).
 * Hidden below md; TabBar remains the mobile nav (md:hidden).
 */
const DESTINATIONS: Destination[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home', href: '/inicio' },
  { key: 'mapa', label: 'Mapa', icon: 'feather', href: '/mapa' },
  { key: 'biblioteca', label: 'Biblioteca', icon: 'book', href: '/compendium' },
  { key: 'mercado', label: 'Mercado', icon: 'bag', href: '/mercado' },
  { key: 'bitacora', label: 'Bitácora', icon: 'scroll', href: '/bitacora' },
  { key: 'personajes', label: 'Personajes', icon: 'user', href: '/personajes' },
  { key: 'campanas', label: 'Campañas', icon: 'crown', href: '/campanas' },
];

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación de escritorio"
      className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen gap-1 border-r border-line bg-paper/95 backdrop-blur-md px-3 py-4"
    >
      {DESTINATIONS.map((dest) => {
        const isActive = pathname === dest.href || pathname.startsWith(`${dest.href}/`);

        return (
          <Link
            key={dest.key}
            href={dest.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 ${
              isActive
                ? 'text-accent bg-accent-soft'
                : 'text-ink-mute hover:text-ink-soft hover:bg-surface'
            }`}
          >
            <Icon name={dest.icon} size={20} strokeWidth={isActive ? 2 : 1.75} />
            <span className="font-sans text-sm font-medium">{dest.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';

type Tab = { key: string; label: string; icon: IconName; href: string };

/**
 * World-scoped 5-tab navigation (Mercado W3 — REQ-NAV-01, REQ-NAV-02, REQ-MERC-NAV-01, ADR-2).
 * Mesa removed W1; Mercado added W3 (items-as-shop, fills the reserved slot).
 * Codex renamed Biblioteca; href /compendium (direct, no dispatcher).
 * Static tabs — not role-split. Role still affects content per-page.
 * @375px layout: 75px/column (grid-cols-5). Touch height ≥44px preserved (pt-2 pb-1 + icon 20px + label 9px).
 * Tab order: Inicio · Mapa · Biblioteca · Mercado · Bitácora (REQ-MERC-NAV-01).
 */
const WORLD_TABS: Tab[] = [
  { key: 'inicio',    label: 'Inicio',    icon: 'home',   href: '/inicio' },
  { key: 'mapa',      label: 'Mapa',      icon: 'feather', href: '/mapa' },
  { key: 'biblioteca', label: 'Biblioteca', icon: 'book',  href: '/compendium' },
  { key: 'mercado',   label: 'Mercado',   icon: 'bag',    href: '/mercado' },
  { key: 'cronica',   label: 'Bitácora',  icon: 'scroll', href: '/cronica' },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 px-1.5 pt-2 bg-paper/95 backdrop-blur-md border-t border-line"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)' }}
    >
      {WORLD_TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        // World nav uses accent color for active state (world-neutral, no dm/player split)
        const activeColor = 'text-accent';
        const underline = "before:bg-accent before:shadow-[0_0_8px_var(--color-accent)]";

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 pt-2 pb-1 px-0.5 transition-colors duration-300 ease-out ${
              isActive
                ? `${activeColor} before:content-[''] before:absolute before:top-0 before:left-[30%] before:right-[30%] before:h-[2px] before:rounded-b-full ${underline}`
                : 'text-ink-mute hover:text-ink-soft'
            }`}
          >
            <Icon name={tab.icon} size={20} strokeWidth={isActive ? 2 : 1.75} />
            <span className="font-sans text-[9px] font-bold uppercase tracking-[0.06em]">
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

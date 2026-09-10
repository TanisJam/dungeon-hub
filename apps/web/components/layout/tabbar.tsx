'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';
import type { CallerRole } from '@/lib/active-world';

type Tab = {
  key: string;
  label: string;
  /**
   * Short label used ONLY by this mobile bar when it renders at 6 columns
   * (GM + Mesa tab). At 375px/6-cols each tab has ~56.5px for its label —
   * "Biblioteca" (~68px at text-[9px] uppercase) overflows that budget, so
   * it swaps to "Códex" here. The section keeps the "Biblioteca" name
   * everywhere else (DesktopSidebar, page titles, etc).
   */
  shortLabel?: string;
  icon: IconName;
  href: string;
};

/**
 * World-scoped navigation — 5 tabs for everyone, a 6th "Mesa" tab for GMs
 * (REQ-NAV-01, REQ-NAV-02, REQ-MERC-NAV-01, ADR-2).
 * Codex renamed Biblioteca; href /compendium (direct, no dispatcher).
 * Gated on `callerRole`, NOT `effectiveView` — a GM toggling DM/Jugador
 * must keep seeing the same tab set (the tab set is per-user, not per-view).
 * @375px layout: 5 cols = 72.6px/column, 6 cols = 60.5px/column. Touch
 * height ≥44px preserved (pt-2 pb-1 + icon 20px + label 9px) regardless of
 * column count.
 * Tab order: Inicio · Mapa · Biblioteca · Mercado · Bitácora [· Mesa].
 */
const WORLD_TABS: Tab[] = [
  { key: 'inicio',    label: 'Inicio',    icon: 'home',   href: '/inicio' },
  { key: 'mapa',      label: 'Mapa',      icon: 'feather', href: '/mapa' },
  { key: 'biblioteca', label: 'Biblioteca', shortLabel: 'Códex', icon: 'book',  href: '/compendium' },
  { key: 'mercado',   label: 'Mercado',   icon: 'bag',    href: '/mercado' },
  { key: 'bitacora',  label: 'Bitácora',  icon: 'scroll', href: '/bitacora' },
];

const MESA_TAB: Tab = { key: 'mesa', label: 'Mesa', icon: 'dice', href: '/mesa' };

const GRID_COLS: Record<number, string> = {
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

interface TabBarProps {
  /**
   * Caller's role in the active world. When 'gm', the Mesa tab is added.
   * Undefined/null → 5 tabs, exactly as before (default-deny, ADR-C2).
   */
  callerRole?: CallerRole;
}

export function TabBar({ callerRole }: TabBarProps = {}) {
  const pathname = usePathname();
  const tabs = callerRole === 'gm' ? [...WORLD_TABS, MESA_TAB] : WORLD_TABS;
  const gridColsClass = GRID_COLS[tabs.length] ?? GRID_COLS[5];
  // Biblioteca's label is already at the width edge at 5 columns (fits) but
  // overflows at 6 (GM + Mesa) — only swap to the short form once Mesa adds
  // the 6th column.
  const isCompact = tabs.length > 5;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-40 px-1.5 pt-2 bg-paper/95 backdrop-blur-md border-t border-line md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)' }}
    >
      <div className={`mx-auto grid w-full max-w-sm ${gridColsClass}`}>
      {tabs.map((tab) => {
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
              {isCompact ? (tab.shortLabel ?? tab.label) : tab.label}
            </span>
          </Link>
        );
      })}
      </div>
    </nav>
  );
}

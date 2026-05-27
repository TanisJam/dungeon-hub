'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';
import { useRole, type Role } from '@/lib/use-role';

type Tab = { key: string; label: string; icon: IconName; href: string };

const TABS_BY_ROLE: Record<Role, Tab[]> = {
  player: [
    { key: 'inicio', label: 'Inicio', icon: 'home', href: '/inicio' },
    { key: 'personajes', label: 'Personajes', icon: 'user', href: '/personajes' },
    { key: 'compendium', label: 'Compendium', icon: 'book', href: '/compendium' },
    { key: 'campanas', label: 'Campañas', icon: 'compass', href: '/campanas' },
  ],
  dm: [
    { key: 'inicio', label: 'Inicio', icon: 'home', href: '/inicio' },
    { key: 'campanas', label: 'Campañas', icon: 'compass', href: '/campanas' },
    { key: 'encuentros', label: 'Encuentros', icon: 'sword', href: '/encuentros' },
    { key: 'compendium', label: 'Compendium', icon: 'book', href: '/compendium' },
  ],
};

export function TabBar() {
  const pathname = usePathname();
  const [role] = useRole();
  const tabs = TABS_BY_ROLE[role];

  return (
    <nav
      aria-label="Navegación principal"
      data-role={role}
      className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 px-1.5 pt-2 bg-paper/95 backdrop-blur-md border-t border-line"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)' }}
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const isDM = role === 'dm';
        const activeColor = isDM ? 'text-secondary' : 'text-accent';
        const underline = isDM
          ? "before:bg-secondary before:shadow-[0_0_8px_var(--color-secondary)]"
          : "before:bg-accent before:shadow-[0_0_8px_var(--color-accent)]";

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 pt-2 pb-1 px-1 transition-colors duration-300 ease-out ${
              isActive
                ? `${activeColor} before:content-[''] before:absolute before:top-0 before:left-[30%] before:right-[30%] before:h-[2px] before:rounded-b-full ${underline}`
                : 'text-ink-mute hover:text-ink-soft'
            }`}
          >
            <Icon name={tab.icon} size={20} strokeWidth={isActive ? 2 : 1.75} />
            <span className="font-sans text-[9px] font-bold uppercase tracking-[0.14em]">
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

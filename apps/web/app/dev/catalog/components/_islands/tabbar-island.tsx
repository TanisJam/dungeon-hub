'use client';

import { useState } from 'react';

/**
 * Dev-only demo wrapper for TabBar.
 * TabBar relies on usePathname (which always reads real routes) and useRole.
 * Rendering it directly in the catalog causes confusing active-state behavior
 * since the catalog lives at /dev/catalog/components.
 *
 * This island renders a representative static preview of the TabBar layout
 * (same visual structure) so the gallery can show it at 375px without
 * patching the real component's routing dependencies.
 */
export function TabBarIsland() {
  const [active, setActive] = useState('inicio');

  const tabs = [
    { key: 'inicio',      label: 'Inicio',     icon: '⌂' },
    { key: 'personajes',  label: 'Personajes',  icon: '◉' },
    { key: 'compendium',  label: 'Compendium',  icon: '⊞' },
    { key: 'campanas',    label: 'Campañas',    icon: '◎' },
  ];

  return (
    <nav
      aria-label="TabBar preview"
      className="w-full grid grid-cols-4 px-1.5 pt-2 pb-4 bg-paper/95 border-t border-line rounded-b-md"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`flex flex-col items-center gap-1 pt-2 pb-1 px-1 transition-colors ${
              isActive ? 'text-accent' : 'text-ink-mute'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="font-sans text-[9px] font-bold uppercase tracking-[0.14em]">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

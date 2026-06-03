import Link from 'next/link';

export type SheetTab = 'resumen' | 'habilidades' | 'hechizos' | 'recursos' | 'inventario' | 'notas';

interface SheetTabsProps {
  activeTab: SheetTab;
  characterId: string;
}

const TABS: { slug: SheetTab; label: string }[] = [
  { slug: 'resumen', label: 'Resumen' },
  { slug: 'habilidades', label: 'Habilidades' },
  { slug: 'hechizos', label: 'Hechizos' },
  { slug: 'recursos', label: 'Recursos' },
  { slug: 'inventario', label: 'Inventario' },
  { slug: 'notas', label: 'Notas' },
];

export function SheetTabs({ activeTab, characterId }: SheetTabsProps) {
  return (
    <nav className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none" aria-label="Pestañas de ficha">
      {TABS.map(({ slug, label }) => {
        const isActive = activeTab === slug;
        return (
          <div key={slug} className="flex-shrink-0 flex flex-col items-center gap-0.5">
            <Link
              href={`/characters/${characterId}?tab=${slug}`}
              className={[
                'rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
                isActive
                  ? 'ficha-tab-active'
                  : 'bg-surface border border-line text-ink-mute hover:text-ink hover:bg-paper-soft',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              {label}
            </Link>
            {/* Accent underline indicator */}
            <div
              className={[
                'h-0.5 w-4 rounded-full transition-opacity duration-200',
                isActive ? 'bg-accent opacity-100' : 'opacity-0',
              ].join(' ')}
            />
          </div>
        );
      })}
    </nav>
  );
}

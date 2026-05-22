import Link from 'next/link';

export type SheetTab = 'resumen' | 'habilidades' | 'hechizos' | 'inventario' | 'notas';

interface SheetTabsProps {
  activeTab: SheetTab;
  characterId: string;
}

const TABS: { slug: SheetTab; label: string }[] = [
  { slug: 'resumen', label: 'Resumen' },
  { slug: 'habilidades', label: 'Habilidades' },
  { slug: 'hechizos', label: 'Hechizos' },
  { slug: 'inventario', label: 'Inventario' },
  { slug: 'notas', label: 'Notas' },
];

export function SheetTabs({ activeTab, characterId }: SheetTabsProps) {
  return (
    <nav className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none" aria-label="Pestañas de ficha">
      {TABS.map(({ slug, label }) => {
        const isActive = activeTab === slug;
        return (
          <Link
            key={slug}
            href={`/characters/${characterId}?tab=${slug}`}
            className={[
              'flex-shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
              isActive
                ? 'bg-ink text-surface'
                : 'bg-surface border border-line text-ink-mute hover:text-ink hover:bg-paper-soft',
            ].join(' ')}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

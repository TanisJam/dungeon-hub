import Link from 'next/link';
import { ScrollNav } from '@/components/ui/scroll-nav';

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
  { slug: 'notas', label: 'Bitácora' },
];

export function SheetTabs({ activeTab, characterId }: SheetTabsProps) {
  return (
    <ScrollNav as="nav" className="py-1" aria-label="Pestañas de ficha">
      {TABS.map(({ slug, label }) => {
        const isActive = activeTab === slug;
        return (
          <div key={slug} className="flex-shrink-0 flex flex-col items-center gap-0.5">
            {/* The link is the TAP TARGET; the span is the pill you see — the
                split toggle-chip.tsx introduced. Putting min-h-[44px] on the
                pill itself would inflate a 12px-text capsule into a slab and
                change the tab bar's proportions; a transparent 44px link around
                it leaves the pill exactly as designed while the measured target
                clears the minimum. */}
            <Link
              href={`/characters/${characterId}?tab=${slug}`}
              className="inline-flex min-h-[44px] items-center justify-center"
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={[
                  'rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
                  isActive
                    ? 'ficha-tab-active'
                    : 'bg-surface border border-line text-ink-mute hover:text-ink hover:bg-paper-soft',
                ].join(' ')}
              >
                {label}
              </span>
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
    </ScrollNav>
  );
}

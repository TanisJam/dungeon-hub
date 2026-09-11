import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx.
   Six cards: the category count in app/compendium/_components/data.ts. */
const CATEGORY_CARDS = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6'] as const;

/**
 * Loading state for /compendium (audit F1, work unit 2).
 *
 * Shaped after app/compendium/page.tsx:96-105 → CompendiumScreen
 * (app/compendium/_components/compendium-screen.tsx:23-54): a search-trigger bar
 * (compendium-init-search, app/globals.css:591-609), the "Categorías" grid — 6
 * cards (app/compendium/_components/data.ts:8-15), 2 cols at 375px / 3 md / 4 lg
 * (app/globals.css:620-634) — then "Tu campaña" (CompendiumCuratedRow, one row)
 * and "Más consultado" sections.
 */
export default function CompendiumLoading() {
  return (
    <AppShell title="Biblioteca" subtitle="REGLAS Y OBJETOS">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Biblioteca"
        className="flex flex-col gap-4"
      >
        {/* Search trigger */}
        <Skeleton className="h-11 w-full" />

        {/* Categorías — 6 cards, 2/3/4 col grid */}
        <div>
          <Skeleton className="h-3.5 w-24" />
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
            {CATEGORY_CARDS.map((category) => (
              <div key={category} className="flex flex-col gap-1 rounded-lg border border-line p-3">
                <Skeleton className="h-9 w-9" />
                <Skeleton className="mt-1 h-3.5 w-2/3" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            ))}
          </div>
        </div>

        {/* Tu campaña — curated row */}
        <div>
          <Skeleton className="h-3.5 w-24" />
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-line p-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </div>

        {/* Más consultado */}
        <div>
          <Skeleton className="h-3.5 w-32" />
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-line p-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

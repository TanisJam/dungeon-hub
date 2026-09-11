import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const ITEM_ROWS = [
  'row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6', 'row-7', 'row-8',
] as const;

/**
 * Loading state for /mercado (audit F1, work unit 2).
 *
 * Shaped after the loaded path in app/mercado/page.tsx:90-116: AppShell (title +
 * subtitle only, no backHref/worldSwitcher — page.tsx never passes them) wrapping
 * CompendiumList (app/compendium/[category]/_components/compendium-list.tsx:148-175),
 * a sticky search input + item-type <select>, then a divided list of ItemRowView
 * rows — name + type on the left, price on the right
 * (app/compendium/[category]/_components/row-views.tsx:157-169), since Mercado
 * pins category="items" and always passes shopContext (so the price column renders).
 */
export default function MercadoLoading() {
  return (
    <AppShell title="Mercado" subtitle="COMPRAR ÍTEMS">
      <div role="status" aria-busy="true" aria-label="Cargando Mercado" className="flex flex-col">
        {/* Sticky search input + item-type select */}
        <div className="flex flex-col gap-2 border-b border-line pb-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>

        {/* ItemRowView rows */}
        <div className="divide-y divide-line">
          {ITEM_ROWS.map((row) => (
            <div key={row} className="flex min-h-[44px] items-center gap-3 py-2">
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-2.5 w-1/4" />
              </div>
              <Skeleton className="h-3.5 w-12" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

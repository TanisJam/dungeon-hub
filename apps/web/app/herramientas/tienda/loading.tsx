import { AppShell } from '@/components/layout/app-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { Skeleton } from '@/components/ui';
import { HERRAMIENTAS_SUBNAV_ITEMS } from '../_components/subnav-items';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const ITEM_ROWS = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'] as const;

/**
 * Loading state for /herramientas/tienda (audit F1, work unit 3) — overrides
 * the shared app/herramientas/loading.tsx. Tienda is a curation editor
 * (toggle + per-item checkboxes), not a search-and-detail-sheet list like
 * Facciones/NPCs/Quests, so the shared shape would be visibly wrong here —
 * same "don't force one shape on a leaf that reads differently" judgment the
 * brief asks for on Campañas.
 *
 * subtitle="TIENDA" and the active SubNav pill ARE statically known here
 * (unlike the shared file) because this loading.tsx only ever serves this
 * one route.
 *
 * Content shape, read from _components/shop-curation-editor.tsx:90-100+: a
 * min-h-[44px] "Curaduría de tienda activa" checkbox row, a search input
 * (query filter over the mundane catalog), then a list of per-item checkbox
 * rows.
 */
export default function TiendaLoading() {
  return (
    <AppShell title="Herramientas" subtitle="TIENDA">
      <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="/herramientas/tienda" />

      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Tienda"
        className="flex flex-col gap-4"
      >
        <div className="flex min-h-[44px] items-center gap-2">
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className="h-3.5 w-40" />
        </div>

        <Skeleton className="h-10 w-full" />

        <div className="flex flex-col gap-2">
          {ITEM_ROWS.map((row) => (
            <div key={row} className="flex min-h-[44px] items-center gap-2">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

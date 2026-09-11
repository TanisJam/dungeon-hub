import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx.
   Five chips: Activos / Pendientes / Retirados / Borradores / Todos, per
   components/personajes/status-filter-chips.tsx. */
const STATUS_CHIPS = [
  { id: 'activos', width: 'w-20' },
  { id: 'pendientes', width: 'w-24' },
  { id: 'retirados', width: 'w-20' },
  { id: 'borradores', width: 'w-24' },
  { id: 'todos', width: 'w-14' },
] as const;
const ROSTER_ROWS = ['row-1', 'row-2', 'row-3', 'row-4'] as const;

/**
 * Loading state for /personajes (audit F1, work unit 2).
 *
 * Shaped after app/personajes/page.tsx:56-84: StatusFilterChips (5 pills, scroll
 * row — components/personajes/status-filter-chips.tsx:9-15,22) above a roster of
 * PersonajeCard rows (components/personajes/personaje-card.tsx — the CharacterCard
 * atom, 72px portrait + name/lineage/pill lines), then the two CTA rows
 * (CreatePersonajeCTA / ImportPersonajeCTA).
 */
export default function PersonajesLoading() {
  return (
    <AppShell title="Personajes" subtitle="TU ROSTER">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Personajes"
        className="flex flex-col gap-4"
      >
        {/* StatusFilterChips — 5 pills: Activos/Pendientes/Retirados/Borradores/Todos */}
        <div className="flex gap-2 overflow-hidden">
          {STATUS_CHIPS.map((chip) => (
            <Skeleton key={chip.id} className={`h-7 shrink-0 ${chip.width}`} />
          ))}
        </div>

        {/* Roster — CharacterCard rows */}
        <div className="flex flex-col gap-2">
          {ROSTER_ROWS.map((row) => (
            <div key={row} className="flex overflow-hidden rounded-md border border-line">
              <Skeleton className="h-[72px] w-[72px] shrink-0" />
              <div className="flex flex-1 flex-col justify-center gap-1.5 px-3 py-2.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-2.5 w-1/3" />
                <div className="mt-1 flex gap-1.5">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CreatePersonajeCTA + ImportPersonajeCTA */}
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </AppShell>
  );
}

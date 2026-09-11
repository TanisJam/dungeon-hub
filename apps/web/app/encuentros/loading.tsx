import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const ENCOUNTER_CARDS = ['card-1', 'card-2', 'card-3'] as const;

/**
 * Loading state for /encuentros (audit F1, work unit 3).
 *
 * subtitle picks the DM label "TU MESA — DM" over the player label
 * "TUS COMBATES" (page.tsx:82) even though it's not a shared prefix like
 * inicio/campanas: Encuentros is a DM-only feature in practice (a player's
 * EncuentrosListView renders only a V3Empty pointer, encuentros-list-view.tsx
 * :19-30 — no cards, no skeleton-worthy shape at all), so the DM shape is
 * the only one this skeleton can usefully represent.
 *
 * Content shape, read from encuentros-list-view.tsx:32-64 (dm branch): a
 * stack of encounter cards (name, campaign name in italics, then a wrapped
 * pill row — Ronda N / combatientes / estado).
 *
 * Own boundary from app/encuentros/[id]/loading.tsx: an in-progress combat
 * screen (radial initiative dial + roster) reads nothing like this list.
 */
export default function EncuentrosLoading() {
  return (
    <AppShell title="Encuentros" subtitle="TU MESA — DM">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Encuentros"
        className="flex flex-col gap-3"
      >
        {ENCOUNTER_CARDS.map((card) => (
          <div key={card} className="flex flex-col gap-1.5 rounded-md border border-line p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

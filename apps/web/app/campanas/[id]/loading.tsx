import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const MEMBER_ROWS = ['member-1', 'member-2', 'member-3'] as const;
const SESSION_CARDS = ['session-1', 'session-2'] as const;

/**
 * Loading state for /campanas/[id] (audit F1, work unit 3) — dynamic route,
 * own boundary (a campaign detail is not a campaign list — see the note in
 * app/campanas/loading.tsx).
 *
 * The campaign name is unknown while loading, so title is a <Skeleton> bar,
 * same technique as app/characters/[id]/loading.tsx. subtitle="CAMPAÑA" and
 * backHref="/campanas" are statically known (app/campanas/[id]/page.tsx:65-69).
 *
 * Content shape, read from components/campanas/campana-detail-view.tsx:72-116:
 * an h1 name row (skeleton bar, tagline omitted — most campaigns don't set
 * one), a "Miembros" section (SectionHead + rows of
 * bg-surface-soft px-3 py-2 name/role-pill, campana-detail-view.tsx:84-97),
 * then SessionList (components/campanas/sessions/session-list.tsx →
 * SessionCard, session-card.tsx:50+ — title + status pill + short date).
 */
export default function CampanaDetailLoading() {
  return (
    <AppShell title={<Skeleton className="h-5 w-40" />} subtitle="CAMPAÑA" backHref="/campanas">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando campaña"
        className="flex flex-col gap-6"
      >
        <section>
          <Skeleton className="h-3.5 w-20" />
          <div className="mt-2 flex flex-col gap-1.5">
            {MEMBER_ROWS.map((row) => (
              <div
                key={row}
                className="flex items-center justify-between rounded-md bg-surface-soft px-3 py-2"
              >
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-5 w-14" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <Skeleton className="h-3.5 w-24" />
          <div className="mt-3 flex flex-col gap-2">
            {SESSION_CARDS.map((card) => (
              <div key={card} className="flex flex-col gap-1.5 rounded-md border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const PARTICIPANT_CHIPS = ['p-1', 'p-2', 'p-3'] as const;
const EVENT_ROWS = ['event-1', 'event-2', 'event-3'] as const;

/**
 * Loading state for /campanas/[id]/sessions/[sid] (audit F1, work unit 3) —
 * dynamic route, own boundary. This is not inherited from
 * app/campanas/[id]/loading.tsx: a single session (participants + an event
 * timeline) reads nothing like the campaign detail (roster + session list)
 * it is reached from.
 *
 * The session title is unknown while loading, so title is a <Skeleton> bar.
 * subtitle="SESIÓN" is statically known (page.tsx:124); backHref needs the
 * campaign id, which loading.tsx never receives (Next.js passes no params to
 * loading.js — confirmed against the framework docs) — omitted, same
 * decision as app/characters/[id]/level-up/loading.tsx.
 *
 * Content shape, read from components/campanas/sessions/session-detail-view.tsx:
 * a header (title + status pill, line 98-106, plus a meta row of date/level/
 * players chips, line 108-122), then the two-column-on-desktop body
 * (line 130-181): a "Participantes" section of chip-like cards (line 142-170)
 * and an "Eventos" timeline column (EventTimeline, line 174-179).
 */
export default function SessionDetailLoading() {
  return (
    <AppShell title={<Skeleton className="h-5 w-44" />} subtitle="SESIÓN">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando sesión"
        className="flex flex-col gap-6 pb-28"
      >
        <header className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-6 w-16 shrink-0" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="h-2.5 w-28" />
        </header>

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-6">
          <section className="md:w-56 md:shrink-0">
            <Skeleton className="h-3.5 w-28" />
            <div className="mt-2 flex flex-wrap gap-2">
              {PARTICIPANT_CHIPS.map((chip) => (
                <div key={chip} className="flex flex-col gap-1 rounded-md bg-surface-soft px-3 py-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-2.5 w-14" />
                </div>
              ))}
            </div>
          </section>

          <section className="flex-1">
            <Skeleton className="h-3.5 w-16" />
            <div className="mt-2 flex flex-col gap-2">
              {EVENT_ROWS.map((row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

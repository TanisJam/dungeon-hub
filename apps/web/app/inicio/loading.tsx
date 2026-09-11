import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const QUICK_ACTIONS = ['action-1', 'action-2', 'action-3', 'action-4'] as const;
const FEED_ENTRIES = ['entry-1', 'entry-2', 'entry-3'] as const;

/**
 * Loading state for /inicio (audit F1, work unit 2 — App Router `loading.tsx`
 * so the previous screen stops freezing for 1.6-3.2s while the segment resolves).
 *
 * Shaped after the player view in app/inicio/page.tsx:223-252 (PlayerView):
 * HeroNextSession, QuickActions (components/inicio/quick-actions.tsx:15-35,
 * grid-cols-4), ActiveCharacterCard (components/inicio/active-character-card.tsx)
 * and NovedadesFeed (components/inicio/novedades-feed.tsx). DMView (page.tsx:258-377)
 * renders different widgets (pending fichas, quest list) — the player shape is used
 * because it is the common case for most sessions and a DM landing on it sees only
 * a generic loading shimmer, not a shape that visibly contradicts what loads next.
 *
 * subtitle="TU GREMIO" matches both PlayerView and the shared prefix of DMView's
 * "TU GREMIO — DM" (app/inicio/page.tsx:224,337) — it is hidden below the `sm`
 * breakpoint (components/layout/topbar.tsx:104-108) so the only place the suffix
 * would ever show up is desktop, where the difference is a few characters.
 */
export default function InicioLoading() {
  return (
    <AppShell title="Inicio" subtitle="TU GREMIO">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Inicio"
        className="flex flex-col gap-4"
      >
        {/* HeroNextSession */}
        <div className="rounded-lg border border-line p-4">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-2 h-5 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <div className="mt-3.5 flex items-center gap-2.5 border-t border-line pt-3.5">
            <Skeleton className="h-8 w-10" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-2 w-8" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
          <Skeleton className="mt-3.5 h-11 w-full" />
        </div>

        {/* QuickActions — grid-cols-4, quick-actions.tsx:19 */}
        <div>
          <Skeleton className="h-3.5 w-16" />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <div
                key={action}
                className="flex flex-col items-center gap-1.5 rounded-md border border-line px-2 py-3.5"
              >
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-2 w-10" />
              </div>
            ))}
          </div>
        </div>

        {/* ActiveCharacterCard — CharacterCard atom, 72px portrait */}
        <div>
          <Skeleton className="h-3.5 w-36" />
          <div className="mt-2 flex overflow-hidden rounded-md border border-line">
            <Skeleton className="h-[72px] w-[72px] shrink-0" />
            <div className="flex flex-1 flex-col justify-center gap-1.5 px-3 py-2.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
              <div className="mt-1 flex gap-1.5">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-14" />
              </div>
            </div>
          </div>
        </div>

        {/* NovedadesFeed — 3 rows (novedades-feed.tsx:20 slices to 3) */}
        <div>
          <Skeleton className="h-3.5 w-40" />
          <div className="mt-2 flex flex-col gap-2">
            {FEED_ENTRIES.map((entry) => (
              <div key={entry} className="flex gap-3 rounded-sm border border-line-soft px-3.5 py-3">
                <Skeleton className="mt-1.5 h-2 w-2 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const ROSTER_ROWS = ['row-1', 'row-2', 'row-3', 'row-4'] as const;

/**
 * Loading state for /encuentros/[id] (audit F1, work unit 3) — dynamic
 * route, own boundary. NOT shared with app/encuentros/loading.tsx: a live
 * combat screen (initiative dial + turn banner + roster) is a materially
 * different shape from the encounter list it is reached from.
 *
 * The encounter name is unknown while loading, so title is a <Skeleton> bar.
 * subtitle="ENCUENTRO" and backHref="/encuentros" are statically known
 * (page.tsx:135).
 *
 * Content shape, read from page.tsx:137-236: a status-pill row (Ronda N /
 * Activo-Cerrado), RadialDial (components/encuentros/radial-dial.tsx —
 * simplified here to a square dial area with a centered turn-callout block,
 * rather than replicating its absolute-positioned token math), TurnBanner
 * (turn-banner.tsx:13-24 — a thin sticky bar), a refresh-button row, and
 * RosterList (roster-row.tsx:17-49 — initiative/name/hp/kind-pill per row).
 * GM-only islands (TurnControlsIsland) and own-combatant-only sections
 * (RageControls, PlayerActionPanel, ResourcePanel) are omitted — none of
 * them are guaranteed for the caller loading this page.
 */
export default function EncuentroDetailLoading() {
  return (
    <AppShell title={<Skeleton className="h-5 w-36" />} subtitle="ENCUENTRO" backHref="/encuentros">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando encuentro"
        className="mx-auto flex max-w-md flex-col gap-4 md:max-w-3xl"
      >
        <div className="flex items-baseline gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>

        {/* RadialDial — simplified to a square dial with a centered callout */}
        <div className="mx-auto flex aspect-square w-full max-w-[240px] flex-col items-center justify-center gap-1.5 rounded-pill border border-line">
          <Skeleton className="h-2 w-14" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-1 h-1.5 w-20" />
        </div>

        {/* TurnBanner */}
        <Skeleton className="h-9 w-full" />

        {/* Refresh affordance */}
        <div className="flex justify-end">
          <Skeleton className="h-8 w-24" />
        </div>

        {/* RosterList */}
        <div className="flex flex-col gap-1.5">
          {ROSTER_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2">
              <Skeleton className="h-3 w-6 shrink-0" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-10 shrink-0" />
              <Skeleton className="h-5 w-10 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

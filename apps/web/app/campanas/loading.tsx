import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const CAMPAIGN_CARDS = ['card-1', 'card-2'] as const;

/**
 * Loading state for /campanas (audit F1, work unit 3).
 *
 * subtitle="TUS CAMPAÑAS" is the shared prefix of the player subtitle and the
 * DM subtitle "TUS CAMPAÑAS — DM" (app/campanas/page.tsx:40) — same technique
 * as app/inicio/loading.tsx's subtitle comment.
 *
 * Content shape is the player view (CampanasView, role !== 'dm' branch,
 * components/campanas/campanas-view.tsx:47-78): a "Donde jugás" section of
 * V3CampCard rows (components/campanas/camp-card.tsx:19-48 — role pill
 * absolute top-right, title, then a wrapped chip row of 2-3 pills). The
 * player view is used as the common case, same reasoning as inicio's
 * loading.tsx; a DM landing here sees a generic card shimmer, not a
 * misleading shape (no DashedCTA, which only the DM branch renders).
 *
 * This is its own boundary, not shared with app/campanas/[id]/loading.tsx,
 * app/campanas/[id]/sessions/[sid]/loading.tsx or app/campanas/new/loading.tsx:
 * a campaign detail (roster + session list), a session detail (participants +
 * event timeline) and a creation form are all a materially different shape
 * from this list — the brief's own "a campaign detail is not a campaign
 * list" applies to all three, not just the detail page.
 */
export default function CampanasLoading() {
  return (
    <AppShell title="Campañas" subtitle="TUS CAMPAÑAS">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Campañas"
        className="flex flex-col gap-6"
      >
        <section>
          <Skeleton className="h-3.5 w-28" />
          <div className="mt-3 flex flex-col gap-3">
            {CAMPAIGN_CARDS.map((card) => (
              <div key={card} className="relative rounded-md border border-line p-4">
                <Skeleton className="absolute right-3 top-3 h-5 w-14" />
                <Skeleton className="h-5 w-2/3" />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

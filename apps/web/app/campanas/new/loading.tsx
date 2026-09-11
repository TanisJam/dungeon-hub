import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/**
 * Loading state for /campanas/new (audit F1, work unit 3) — own boundary,
 * NOT inherited from app/campanas/loading.tsx: a creation form is a
 * materially different shape from the campaign list.
 *
 * Shaped after app/campanas/new/page.tsx:19-41: title="Campañas",
 * subtitle="NUEVA CAMPAÑA" (the no-worldId variant — the only reachable
 * entry point today is the CTA on /campanas, which links here without a
 * worldId query param; the "NUEVA PARTIDA EN ESTE MUNDO" variant needs
 * ?worldId= and has no CTA in the app that sets it), and rightAction — the
 * "← Salir" exit link is a hardcoded <Link href="/campanas">, identical on
 * every render, so it is mirrored verbatim rather than omitted.
 *
 * Content: the hint paragraph (page.tsx:35) above NewCampaignForm
 * (app/campanas/new/_form.tsx:22-58 — one label+input field, an inline hint
 * under it, and a full-width submit button).
 */
export default function CampanasNewLoading() {
  const exitLink = (
    <Link
      href="/campanas"
      className="text-xs font-semibold text-ink-mute hover:text-ink transition-colors"
    >
      ← Salir
    </Link>
  );

  return (
    <AppShell title="Campañas" subtitle="NUEVA CAMPAÑA" rightAction={exitLink}>
      <div role="status" aria-busy="true" aria-label="Cargando Nueva campaña">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="mt-1.5 h-3 w-2/3" />

        <div className="mt-8 flex flex-col gap-5">
          <div>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-1.5 h-10 w-full" />
            <Skeleton className="mt-1 h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </AppShell>
  );
}

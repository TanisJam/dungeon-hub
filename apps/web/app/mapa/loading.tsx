import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/**
 * Loading state for /mapa (audit F1, work unit 2) — SPECIAL CASE.
 *
 * Mapa is a full-bleed Leaflet map, not a list (app/mapa/page.tsx:116-149,
 * components/world/map/world-map-leaflet.tsx). A list-shaped skeleton here would
 * misrepresent the page. Positioning instead mirrors the fixed box
 * MapClientWrapper's own ssr:false dynamic import already renders while Leaflet's
 * JS is loading client-side — `fixed inset-x-0 top-[120px] … bg-paper`, bottom
 * offset by the tab bar + safe area
 * (components/world/map/map-client-wrapper.tsx:32-46). Reusing that exact
 * rectangle means this RSC-boundary loading state and that later client-side one
 * occupy the same box, so there is no jump between them, only a filled-in pulse.
 *
 * AppShell gets only title + subtitle: worldSwitcher/roleDefault/callerRole all
 * need server data the page resolves via getActiveWorld (app/mapa/page.tsx:53-66)
 * and are omitted per the brief.
 */
export default function MapaLoading() {
  return (
    <AppShell title="Mapa" subtitle="DEL MUNDO">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Mapa"
        className="fixed inset-x-0 top-[120px] z-10 bg-paper"
        style={{ bottom: 'calc(73px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Skeleton className="h-full w-full" />
      </div>
    </AppShell>
  );
}

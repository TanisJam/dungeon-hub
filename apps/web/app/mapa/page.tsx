import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { env } from '@/lib/env';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { HexClientWrapper } from '@/components/world/map/hex-client-wrapper';
import { MapClientWrapper } from '@/components/world/map/map-client-wrapper';
import { MapToggle } from '@/components/world/map/map-toggle';
import { V3Empty } from '@/components/ui';
import type { HexRow, PoiRow } from './actions';
import { listAllPois } from './actions';

/**
 * Mapa — Server Component (Slice 4 + WM Slice 1).
 *
 * Resolves active world + view preference in parallel (REQ-MAP-01).
 * Computes effectiveView from callerRole (world authority) and dh:role cookie overlay.
 * SSR-fetches top-level hexes (?parent=top) for initial list — NO POI fetch (lazy, REQ-MAP-01).
 * Renders HexClientWrapper which handles lazy POI accordion + DM CRUD (Lista view).
 *
 * WM Slice 1: searchParams.view drives Lista|Mapa toggle (REQ-WM-02).
 *   Lista: renders existing HexClientWrapper (unchanged).
 *   Mapa:  renders MapClientWrapper (ssr:false Leaflet island — REQ-WM-03).
 *
 * Mapa has a single entity type (hexes/ubicaciones) so NO sub-nav is needed — ADR-4 comment.
 *
 * REQ-MAP-01, REQ-MAP-02, REQ-GATE-01, REQ-WM-02, REQ-WM-03.
 */
export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // Resolve searchParams first (Next.js 15 async searchParams)
  const { view } = await searchParams;
  const activeMapView = view === 'mapa' ? 'mapa' : 'lista';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // REQ-MAP-01: resolve active world + view preference in parallel
  const [aw, viewPref] = await Promise.all([getActiveWorld(token), getViewPreference()]);

  // Canonical effectiveView formula (REQ-WIS-08)
  const effectiveView =
    aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  const callerRole = aw?.callerRole ?? null;
  const worldSwitcher = token ? (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={callerRole}
    />
  ) : undefined;

  // REQ-MAP-01 Scenario: No active world — render empty state (no 500)
  if (!aw) {
    return (
      <AppShell
        title="Mapa"
        subtitle="DEL MUNDO"
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <V3Empty
          glyph="feather"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para ver el mapa."
        />
      </AppShell>
    );
  }

  // SSR initial top-level hex list — POIs are NOT fetched here (lazy, REQ-MAP-01).
  // Only needed for Lista view, but we fetch regardless so toggling is instant.
  let initialHexes: HexRow[] = [];
  try {
    const res = await api.get<{ data: HexRow[] }>(
      `/worlds/${aw.id}/hexes?parent=top&limit=50&offset=0`,
      token,
    );
    initialHexes = res.data ?? [];
  } catch {
    // If fetch fails, render with empty list — client can retry via search
  }

  // REQ-POI-MARKER-01: SSR fetch for POI marker layer — only when mapa view is active.
  // The API applies role-based cascade filtering (player: unexplored hex + unknown status removed).
  // Lista view: pois is [] — lazy accordion remains unchanged.
  let pois: PoiRow[] = [];
  if (activeMapView === 'mapa') {
    pois = await listAllPois(aw.id);
  }

  return (
    <AppShell
      title="Mapa"
      subtitle="DEL MUNDO"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      {/* REQ-WM-02: Lista|Mapa segmented toggle — thumb-reachable at 375px */}
      <MapToggle activeView={activeMapView} />

      {/* REQ-WM-02: Branch on view — Lista shows hex list, Mapa shows Leaflet island */}
      {activeMapView === 'mapa' ? (
        /*
         * REQ-WM-03: MapClientWrapper wraps the Leaflet island with ssr:false.
         * The island breaks out of AppShell max-w-sm via fixed positioning.
         * supabaseUrl is derived from NEXT_PUBLIC_SUPABASE_URL (no new env var — ADR-1).
         * REQ-POI-MARKER-02: pois + effectiveView forwarded for the marker layer.
         */
        <MapClientWrapper
          supabaseUrl={env.SUPABASE_URL}
          pois={pois}
          effectiveView={effectiveView}
        />
      ) : (
        <HexClientWrapper
          worldId={aw.id}
          effectiveView={effectiveView}
          initialHexes={initialHexes}
        />
      )}
    </AppShell>
  );
}

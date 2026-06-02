import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { HexClientWrapper } from '@/components/world/map/hex-client-wrapper';
import { V3Empty } from '@/components/ui';
import type { HexRow } from './actions';

/**
 * Mapa — Server Component (Slice 4, replaces V3Empty stub).
 *
 * Resolves active world + view preference in parallel (REQ-MAP-01).
 * Computes effectiveView from callerRole (world authority) and dh:role cookie overlay.
 * SSR-fetches top-level hexes (?parent=top) for initial list — NO POI fetch (lazy, REQ-MAP-01).
 * Renders HexClientWrapper which handles lazy POI accordion + DM CRUD.
 *
 * Mapa has a single entity type (hexes/ubicaciones) so NO sub-nav is needed — ADR-4 comment.
 *
 * REQ-MAP-01, REQ-MAP-02, REQ-GATE-01.
 */
export default async function MapaPage() {
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

  return (
    <AppShell
      title="Mapa"
      subtitle="DEL MUNDO"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <HexClientWrapper
        worldId={aw.id}
        effectiveView={effectiveView}
        initialHexes={initialHexes}
      />
    </AppShell>
  );
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { FactionClientWrapper } from '@/components/world/factions/faction-client-wrapper';
import { V3Empty } from '@/components/ui';
import type { FactionRow } from '../actions';

/**
 * Facciones — Server Component.
 *
 * Resolves active world + view preference in parallel (REQ-FAC-02).
 * Computes effectiveView from callerRole (world authority) and dh:role cookie overlay.
 * SSR-fetches initial faction list; renders SubNav + FactionClientWrapper.
 * REQ-FAC-01, REQ-FAC-02, REQ-FAC-04.
 */
export default async function FaccionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // REQ-FAC-02: resolve active world + view preference in parallel
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

  // REQ-FAC-02 Scenario: No active world — render empty state (no 500)
  if (!aw) {
    return (
      <AppShell
        title="Codex"
        subtitle="FACCIONES"
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <SubNav
          items={[
            { label: 'Facciones', href: '/codex/facciones' },
            { label: 'NPCs', href: '/codex/npcs' },
          ]}
          activePath="/codex/facciones"
        />
        <V3Empty
          glyph="book"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para ver las facciones."
        />
      </AppShell>
    );
  }

  // SSR initial faction list
  let initialFactions: FactionRow[] = [];
  try {
    const res = await api.get<{ data: FactionRow[] }>(
      `/worlds/${aw.id}/factions`,
      token,
    );
    initialFactions = res.data ?? [];
  } catch {
    // If fetch fails, render with empty list — client can retry via search
  }

  return (
    <AppShell
      title="Codex"
      subtitle="FACCIONES"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav
        items={[
          { label: 'Facciones', href: '/codex/facciones' },
          { label: 'NPCs', href: '/codex/npcs' },
        ]}
        activePath="/codex/facciones"
      />
      <FactionClientWrapper
        worldId={aw.id}
        effectiveView={effectiveView}
        initialFactions={initialFactions}
      />
    </AppShell>
  );
}

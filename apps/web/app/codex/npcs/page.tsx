import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { NpcClientWrapper } from '@/components/world/npcs/npc-client-wrapper';
import { V3Empty } from '@/components/ui';
import { CODEX_DM_SUBNAV_ITEMS } from '../_components/codex-subnav-items';
import type { NpcRow, FactionRow } from '../actions';

/**
 * NPCs — Server Component.
 *
 * Resolves active world + view preference in parallel (REQ-NPC-01, REQ-FAC-02 pattern).
 * SSR-fetches initial NPC list AND world factions (for N:M picker) in parallel.
 * REQ-NPC-01, REQ-NPC-02, REQ-GATE-01.
 */
export default async function NpcsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // REQ-FAC-02 pattern: resolve active world + view preference in parallel
  const [aw, viewPref] = await Promise.all([getActiveWorld(token), getViewPreference()]);

  // Canonical effectiveView formula
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

  // No active world — render empty state (no 500)
  if (!aw) {
    return (
      <AppShell
        title="Codex"
        subtitle="NPCs"
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <SubNav
          items={CODEX_DM_SUBNAV_ITEMS}
          activePath="/codex/npcs"
        />
        <V3Empty
          glyph="book"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para ver los NPCs."
        />
      </AppShell>
    );
  }

  // SSR initial NPC list + world factions (for N:M picker) in parallel
  let initialNpcs: NpcRow[] = [];
  let worldFactions: FactionRow[] = [];

  try {
    const [npcsRes, factionsRes] = await Promise.all([
      api.get<{ data: NpcRow[] }>(`/worlds/${aw.id}/npcs`, token),
      api.get<{ data: FactionRow[] }>(`/worlds/${aw.id}/factions`, token),
    ]);
    initialNpcs = npcsRes.data ?? [];
    worldFactions = factionsRes.data ?? [];
  } catch {
    // If fetch fails, render with empty list — client can retry via search
  }

  return (
    <AppShell
      title="Codex"
      subtitle="NPCs"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav
        items={[
          { label: 'Facciones', href: '/codex/facciones' },
          { label: 'NPCs', href: '/codex/npcs' },
          { label: 'Quests', href: '/codex/quests' },
        ]}
        activePath="/codex/npcs"
      />
      <NpcClientWrapper
        worldId={aw.id}
        effectiveView={effectiveView}
        initialNpcs={initialNpcs}
        worldFactions={worldFactions}
      />
    </AppShell>
  );
}

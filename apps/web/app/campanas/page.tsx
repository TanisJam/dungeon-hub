import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { CampanasView } from '@/components/campanas/campanas-view';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import type { CampaignSummary } from '@/components/campanas/types';

export default async function CampanasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  // Resolve campaigns and activeWorld in parallel (REQ-WIS-01 latency mitigation).
  // Slice 3: effectiveView derived from aw.callerRole (per-world authority). REQ-WIS-08.
  const [campaignsResult, aw, viewPref] = await Promise.all([
    api.get<{ data: CampaignSummary[] }>('/campaigns', token).catch(() => ({ data: [] as CampaignSummary[] })),
    getActiveWorld(token),
    getViewPreference(),
  ]);
  const campaigns = campaignsResult.data;

  // effectiveView rule (REQ-WIS-08/09):
  //   - non-GM (player or null callerRole) ALWAYS sees player view
  //   - GM defaults to DM view, but the dh:role view-preference overlay lets a GM
  //     "preview as player" (cookie === 'player'). Absent cookie → DM default.
  const callerRole = aw?.callerRole ?? null;
  const effectiveView =
    callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  const subtitle = effectiveView === 'dm' ? 'TUS CAMPAÑAS — DM' : 'TUS CAMPAÑAS';

  const worldSwitcher = (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={callerRole}
    />
  );

  return (
    <AppShell
      title="Campañas"
      subtitle={subtitle}
      roleDefault={effectiveView}
      callerRole={callerRole ?? undefined}
      worldSwitcher={worldSwitcher}
    >
      <CampanasView role={effectiveView} campaigns={campaigns} />
    </AppShell>
  );
}

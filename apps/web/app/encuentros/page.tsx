import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { EncuentrosListView, type EncuentroRow } from '@/components/encuentros/encuentros-list-view';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import type { EncounterDetail, EncounterSummary } from '@/components/encuentros/types';

type CampaignRow = {
  id: string;
  name: string;
  memberRole: 'gm' | 'player';
};

export default async function EncuentrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  // Resolve activeWorld (REQ-WIS-01 latency mitigation — single call, already parallel-ready).
  // Slice 3: effectiveView derived from aw.callerRole (per-world authority). REQ-WIS-08.
  const [aw, viewPref] = await Promise.all([getActiveWorld(token), getViewPreference()]);

  // effectiveView rule (REQ-WIS-08/09):
  //   - non-GM (player or null callerRole) ALWAYS sees player view (encounter list hidden)
  //   - GM defaults to DM view; the dh:role overlay lets a GM preview as player.
  const callerRole = aw?.callerRole ?? null;
  const effectiveView =
    callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  let rows: EncuentroRow[] = [];
  if (effectiveView === 'dm') {
    const campaignsResult = await api
      .get<{ data: CampaignRow[] }>('/campaigns', token)
      .catch(() => ({ data: [] as CampaignRow[] }));
    const dmCampaigns = campaignsResult.data.filter((c) => c.memberRole === 'gm');

    const perCampaign = await Promise.all(
      dmCampaigns.map(async (c) => {
        const list = await api
          .get<{ data: EncounterSummary[] }>(`/encounters?campaignId=${c.id}`, token)
          .catch(() => ({ data: [] as EncounterSummary[] }));
        // Fetch combatants count per encounter (parallel).
        const withCounts = await Promise.all(
          list.data.map(async (e) => {
            const detail = await api
              .get<EncounterDetail>(`/encounters/${e.id}`, token)
              .catch(() => null);
            return {
              encounter: e,
              campaignName: c.name,
              combatantsCount: detail?.combatants.length ?? 0,
            };
          }),
        );
        return withCounts;
      }),
    );
    rows = perCampaign.flat();
  }

  const worldSwitcher = (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={aw?.callerRole ?? null}
    />
  );

  return (
    <AppShell
      title="Encuentros"
      subtitle={effectiveView === 'dm' ? 'TU MESA — DM' : 'TUS COMBATES'}
      roleDefault={effectiveView}
      callerRole={callerRole ?? undefined}
      worldSwitcher={worldSwitcher}
    >
      <EncuentrosListView role={effectiveView} rows={rows} />
    </AppShell>
  );
}

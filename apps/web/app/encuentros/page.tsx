import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getRole } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { EncuentrosListView, type EncuentroRow } from '@/components/encuentros/encuentros-list-view';
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

  const role = await getRole();

  let rows: EncuentroRow[] = [];
  if (role === 'dm') {
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

  return (
    <AppShell title="Encuentros" subtitle={role === 'dm' ? 'TU MESA — DM' : 'TUS COMBATES'}>
      <EncuentrosListView role={role} rows={rows} />
    </AppShell>
  );
}

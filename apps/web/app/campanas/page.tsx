import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getRole } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { CampanasView } from '@/components/campanas/campanas-view';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { getActiveWorld } from '@/lib/active-world';
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

  // Resolve role, campaigns, and activeWorld in parallel (REQ-WIS-01 latency mitigation).
  // Slice 3 will replace getRole() with aw?.callerRole.
  const [role, campaignsResult, aw] = await Promise.all([
    getRole(),
    api.get<{ data: CampaignSummary[] }>('/campaigns', token).catch(() => ({ data: [] as CampaignSummary[] })),
    getActiveWorld(token),
  ]);
  const campaigns = campaignsResult.data;

  const subtitle = role === 'dm' ? 'TUS CAMPAÑAS — DM' : 'TUS CAMPAÑAS';

  const worldSwitcher = (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={aw?.callerRole ?? null}
    />
  );

  return (
    <AppShell title="Campañas" subtitle={subtitle} worldSwitcher={worldSwitcher}>
      <CampanasView role={role} campaigns={campaigns} />
    </AppShell>
  );
}

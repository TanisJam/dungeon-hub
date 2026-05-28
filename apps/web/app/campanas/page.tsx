import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getRole } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { CampanasView } from '@/components/campanas/campanas-view';
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

  const role = await getRole();
  const result = await api
    .get<{ data: CampaignSummary[] }>('/campaigns', token)
    .catch(() => ({ data: [] }));
  const campaigns = result.data;

  const subtitle = role === 'dm' ? 'TUS CAMPAÑAS — DM' : 'TUS CAMPAÑAS';

  return (
    <AppShell title="Campañas" subtitle={subtitle}>
      <CampanasView role={role} campaigns={campaigns} />
    </AppShell>
  );
}

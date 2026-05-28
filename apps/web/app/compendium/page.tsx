import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { CompendiumScreen } from './_components/compendium-screen';
import type { CategoryId } from './_components/types';

type CampaignRow = {
  id: string;
  name: string;
  memberRole: 'gm' | 'player';
};

type CountResult = { total: number } | null;

export default async function CompendiumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  // Resolve first active campaign (gm or player — compendium is non-DM)
  const campaignsResult = await api
    .get<{ data: CampaignRow[] }>('/campaigns', token)
    .catch(() => ({ data: [] as CampaignRow[] }));

  const activeCampaign = campaignsResult.data.find(
    (c) => c.memberRole === 'gm' || c.memberRole === 'player',
  );

  let counts: Record<CategoryId, number | '—' | '∞'>;

  if (activeCampaign) {
    const id = activeCampaign.id;
    // Parallel fetch of 5 category counts — per-card .catch(() => null) fallback (ER3)
    const [spellsRes, itemsRes, racesRes, classesRes, monstersRes] = await Promise.all([
      api.get<CountResult>(`/compendium/spells?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/items?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/races?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/classes?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/monsters?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
    ]);

    counts = {
      spells:   spellsRes?.total   ?? '—',
      items:    itemsRes?.total    ?? '—',
      races:    racesRes?.total    ?? '—',
      classes:  classesRes?.total  ?? '—',
      monsters: monstersRes?.total ?? '—',
      lore:     '∞',
    };
  } else {
    // No campaign: all counts degrade to '—', Lore stays '∞' (ER2)
    counts = {
      spells:   '—',
      items:    '—',
      races:    '—',
      classes:  '—',
      monsters: '—',
      lore:     '∞',
    };
  }

  return (
    <AppShell title="Compendium" subtitle="REGLAS Y OBJETOS">
      <CompendiumScreen counts={counts} />
    </AppShell>
  );
}

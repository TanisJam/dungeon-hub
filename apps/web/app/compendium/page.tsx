import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { AppShell } from '@/components/layout/app-shell';
import { CompendiumScreen } from './_components/compendium-screen';
import type { CategoryId } from './_components/types';

type CampaignRow = {
  id: string;
  name: string;
  worldId: string;
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

  // Resolve active world + campaigns in parallel (ADR-3, REQ-WIS-01 latency mitigation).
  // Compendium counts are scoped to the active world's campaigns. If no active world,
  // falls back to first campaign (previous behaviour). Counts degrade to '—' when none.
  const [campaignsResult, aw] = await Promise.all([
    api
      .get<{ data: CampaignRow[] }>('/campaigns', token)
      .catch(() => ({ data: [] as CampaignRow[] })),
    getActiveWorld(token),
  ]);

  // ADR-3: filter campaigns to those belonging to the active world when available.
  // Fallback: use first reachable campaign regardless of world (current behaviour).
  const activeCampaign = aw
    ? campaignsResult.data.find(
        (c) =>
          c.worldId === aw.id &&
          (c.memberRole === 'gm' || c.memberRole === 'player'),
      ) ??
      // Degrade: no campaign in active world → fall back to first campaign overall
      campaignsResult.data.find((c) => c.memberRole === 'gm' || c.memberRole === 'player')
    : campaignsResult.data.find(
        (c) => c.memberRole === 'gm' || c.memberRole === 'player',
      );

  let counts: Record<CategoryId, number | '—' | '∞'>;

  if (activeCampaign) {
    const id = activeCampaign.id;
    // Parallel fetch of 6 category counts — per-card .catch(() => null) fallback (ER3)
    const [spellsRes, itemsRes, racesRes, classesRes, monstersRes, backgroundsRes] = await Promise.all([
      api.get<CountResult>(`/compendium/spells?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/items?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/races?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/classes?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/monsters?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
      api.get<CountResult>(`/compendium/backgrounds?campaign=${id}&limit=1&offset=0`, token).catch(() => null),
    ]);

    counts = {
      spells:      spellsRes?.total      ?? '—',
      items:       itemsRes?.total       ?? '—',
      races:       racesRes?.total       ?? '—',
      classes:     classesRes?.total     ?? '—',
      monsters:    monstersRes?.total    ?? '—',
      backgrounds: backgroundsRes?.total ?? '—',
      lore:        '∞',
    };
  } else {
    // No campaign: all counts degrade to '—', Lore stays '∞' (ER2)
    counts = {
      spells:      '—',
      items:       '—',
      races:       '—',
      classes:     '—',
      monsters:    '—',
      backgrounds: '—',
      lore:        '∞',
    };
  }

  return (
    <AppShell title="Compendium" subtitle="REGLAS Y OBJETOS">
      <CompendiumScreen
        counts={counts}
        campaignName={activeCampaign?.name ?? null}
        campaignId={activeCampaign?.id ?? null}
        worldId={activeCampaign?.worldId ?? null}
      />
    </AppShell>
  );
}

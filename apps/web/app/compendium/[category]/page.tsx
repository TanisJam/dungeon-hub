import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { CATEGORY_CONFIG } from './_config/registry';
import { CompendiumList } from './_components/compendium-list';
import type { CompendiumCategory } from '@/app/compendium/_components/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CampaignRow = {
  id: string;
  name: string;
  worldId: string;
  memberRole: 'gm' | 'player';
};

type ListEnvelope = { data: unknown[]; total: number } | null;

// ---------------------------------------------------------------------------
// Page — ADR-1, ADR-2, REQ-CBROWSE-02
// ---------------------------------------------------------------------------

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ campaign?: string }>;
}

/**
 * CompendiumCategoryPage — URL-routed list page for a compendium category.
 * ADR-1: SSR first paint + URL-addressable list. Back nav = browser native.
 * ADR-2: validates category via CATEGORY_CONFIG; unknown → notFound() (404).
 * REQ-CBROWSE-02: initial server-side fetch for first 50 rows before hydration.
 * REQ-CBROWSE-05: always passes ?campaign= so API enforces rulesProfile.sources filter.
 */
export default async function CompendiumCategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { category } = await params;
  const { campaign: campaignIdParam } = await searchParams;

  // ADR-2: validate category against registry — unknown slug → 404
  if (!(category in CATEGORY_CONFIG)) {
    notFound();
  }

  const config = CATEGORY_CONFIG[category as CompendiumCategory];

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  // Resolve campaign — use URL param first, then fall back to first active campaign.
  // worldId is on the campaign row (confirmed from /campaigns use-case).
  const campaignsResult = await api
    .get<{ data: CampaignRow[] }>('/campaigns', token)
    .catch(() => ({ data: [] as CampaignRow[] }));

  const activeCampaign = campaignIdParam
    ? campaignsResult.data.find((c) => c.id === campaignIdParam)
    : campaignsResult.data.find((c) => c.memberRole === 'gm' || c.memberRole === 'player');

  // No campaign = empty state (REQ-CBROWSE-02: "handle missing scope gracefully")
  if (!activeCampaign) {
    return (
      <AppShell title={config.label} subtitle="COMPENDIUM">
        <div className="flex flex-col items-center justify-center py-16 text-sm text-ink-soft">
          <p>Seleccioná una campaña para ver este listado.</p>
        </div>
      </AppShell>
    );
  }

  const { id: campaignId, worldId } = activeCampaign;

  // SSR initial fetch — first 50 rows before hydration (REQ-CBROWSE-02)
  const initialData = await api
    .get<ListEnvelope>(
      `/compendium/${config.endpoint}?campaign=${campaignId}&limit=50&offset=0`,
      token,
    )
    .catch(() => null);

  const initialRows = initialData?.data ?? [];
  const total = initialData?.total ?? 0;

  return (
    <AppShell title={config.label} subtitle="COMPENDIUM">
      <CompendiumList
        category={category as CompendiumCategory}
        scope={{ campaign: campaignId }}
        worldId={worldId}
        accessToken={token}
        initialRows={initialRows}
        total={total}
      />
    </AppShell>
  );
}

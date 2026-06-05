import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { AppShell } from '@/components/layout/app-shell';
import { CampanaDetailView, type CampanaSessionRow } from '@/components/campanas/campana-detail-view';
import type { CampaignDetail } from '@/components/campanas/types';

type RouteParams = Promise<{ id: string }>;

export default async function CampanaDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  let detail: CampaignDetail;
  try {
    detail = await api.get<CampaignDetail>(`/campaigns/${id}`, token);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  // Parallelize sessions + roster + active world (ADR-A5: gate at call site).
  // REQ-DPPMB-LIST-08: include participants so callerRole active-char derivation works.
  // ADR-B4: roster fetched here (GET /characters?status=active); world-filtered in JoinSheet.
  const [sessionsResult, activeWorld, rosterResult] = await Promise.all([
    api
      .get<{ data: CampanaSessionRow[] }>(`/sessions?campaignId=${id}`, token)
      .catch(() => ({ data: [] as CampanaSessionRow[] })),
    getActiveWorld(token),
    api
      .get<{ data: Array<{ id: string; name: string; lineage: string; worldId: string }> }>(
        '/characters?status=active',
        token,
      )
      .catch(() => ({ data: [] as Array<{ id: string; name: string; lineage: string; worldId: string }> })),
  ]);

  const worldId = activeWorld?.id ?? detail.worldId;

  // Filter roster to this world (ADR-B4: client-side world filter).
  const callerCharacters = (rosterResult.data ?? [])
    .filter((c) => c.worldId === worldId)
    .map((c) => ({ id: c.id, name: c.name, lineage: c.lineage, worldId: c.worldId }));

  return (
    <AppShell
      title={detail.name}
      subtitle="CAMPAÑA"
      backHref="/campanas"
      callerRole={activeWorld?.callerRole ?? undefined}
    >
      <CampanaDetailView
        detail={detail}
        sessions={sessionsResult.data}
        callerUserId={user.id}
        worldId={worldId}
        callerCharacters={callerCharacters}
      />
    </AppShell>
  );
}

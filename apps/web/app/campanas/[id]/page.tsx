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

  // Parallelize sessions fetch + active world resolution (ADR-A5: gate at call site).
  const [sessionsResult, activeWorld] = await Promise.all([
    api
      .get<{ data: CampanaSessionRow[] }>(`/sessions?campaignId=${id}`, token)
      .catch(() => ({ data: [] as CampanaSessionRow[] })),
    getActiveWorld(token),
  ]);

  return (
    <AppShell
      title={detail.name}
      subtitle="CAMPAÑA"
      backHref="/campanas"
      callerRole={activeWorld?.callerRole ?? undefined}
    >
      <CampanaDetailView detail={detail} sessions={sessionsResult.data} />
    </AppShell>
  );
}

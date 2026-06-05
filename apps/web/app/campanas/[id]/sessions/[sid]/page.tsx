import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { AppShell } from '@/components/layout/app-shell';
import { SessionDetailView } from '@/components/campanas/sessions/session-detail-view';
import type { CampaignDetail } from '@/components/campanas/types';
import type { SessionDetail, SessionEvent } from '@/app/campanas/[id]/sessions/actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteParams = Promise<{ id: string; sid: string }>;

interface SessionEventsResponse {
  data: SessionEvent[];
}

// ---------------------------------------------------------------------------
// Access derivation (REQ-DPPMB-DETAIL-02)
// The API already gates on membership:
//  - 403 → access = 'none'  (notFound() called in catch)
//  - 404 → access = 'none'  (notFound() called in catch)
//  - callerRole === 'gm' OR gmUserId === userId → access = 'gm'
//  - participants array has caller (leftAt IS NULL) → access = 'participant'
//  - otherwise → 'campaign-member'
// ---------------------------------------------------------------------------

function deriveAccessLevel(
  session: SessionDetail,
  userId: string,
  callerRole: 'gm' | 'player' | null,
): 'gm' | 'participant' | 'campaign-member' {
  // World-GM or session-GM both get full access.
  if (callerRole === 'gm' || session.gmUserId === userId) return 'gm';

  const isParticipant = session.participants.some(
    (p) => p.userId === userId && p.leftAt === null,
  );
  if (isParticipant) return 'participant';

  return 'campaign-member';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SessionDetailPage({ params }: { params: RouteParams }) {
  const { id, sid } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  const token = authSession!.access_token;

  // Parallel fetch: campaign detail + session detail + session events + active world.
  // REQ-DPPMB-DETAIL-01: page fetches GET /sessions/:id AND GET /sessions/:id/events.
  let detail: CampaignDetail;
  let sessionDetail: SessionDetail;
  let events: SessionEvent[];

  try {
    [detail, sessionDetail, events] = await Promise.all([
      api.get<CampaignDetail>(`/campaigns/${id}`, token),
      api.get<SessionDetail>(`/sessions/${sid}`, token),
      api
        .get<SessionEventsResponse>(`/sessions/${sid}/events`, token)
        .then((r) => r.data ?? [])
        .catch(() => [] as SessionEvent[]),
    ]);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  // Validate the session belongs to this campaign (belt-and-suspenders).
  if (sessionDetail.campaignId !== id) notFound();

  // Resolve active world for callerRole — used for access derivation and AppShell.
  const activeWorld = await getActiveWorld(token);
  const callerWorldRole = activeWorld?.callerRole ?? null;

  // REQ-DPPMB-DETAIL-02: derive access level.
  const accessLevel = deriveAccessLevel(sessionDetail, user.id, callerWorldRole);

  // Resolve GM display name from campaign members list.
  const gmMember = detail.members.find((m) => m.userId === sessionDetail.gmUserId);
  const gmName = gmMember?.username ?? 'DM';

  return (
    <AppShell
      title={sessionDetail.title}
      subtitle="SESIÓN"
      // REQ-DPPMB-DETAIL-07: back link to campaign.
      backHref={`/campanas/${id}`}
      callerRole={accessLevel === 'gm' ? 'gm' : 'player'}
    >
      {/*
        B5 will pass <DmControls> here via dmControlsSlot.
        The slot accepts a ReactNode so the RSC boundary stays clean:
        the page renders the slot, B5's client component is imported and
        rendered server-side (or as a client island), passed down as a node.

        DmControls slot contract for B5:
          - Import DmControls from '@/components/campanas/sessions/dm-controls'
          - Render: <DmControls
              sessionId={sid}
              campaignId={id}
              status={sessionDetail.status}
              accessLevel={accessLevel}
            />
          - Pass it as dmControlsSlot to SessionDetailView.
          - DmControls is 'use client'; receives status as a serializable prop.
      */}
      <SessionDetailView
        detail={sessionDetail}
        events={events}
        accessLevel={accessLevel}
        campaignId={id}
        gmName={gmName}
        dmControlsSlot={undefined}
      />
    </AppShell>
  );
}

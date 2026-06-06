import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { SessionDetailView } from '@/components/campanas/sessions/session-detail-view';
import { DmControls } from '@/components/campanas/sessions/dm-controls';
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
  const [activeWorld, viewPref] = await Promise.all([
    getActiveWorld(token),
    getViewPreference(),
  ]);
  const callerWorldRole = activeWorld?.callerRole ?? null;

  // REQ-DPPMB-DETAIL-02: derive access level.
  let accessLevel = deriveAccessLevel(sessionDetail, user.id, callerWorldRole);

  // Preview-as-player: a GM (world-GM or this session's GM) who toggled dh:role=player
  // should see the session as a player would — hide DmControls. Downgrade the gm access
  // level to participant/campaign-member based on actual participation. The RoleSwitcher
  // stays available (AppShell gets the real role) so they can toggle back. API enforcement
  // is independent of this UI clamp.
  const previewAsPlayer =
    viewPref === 'player' && (callerWorldRole === 'gm' || sessionDetail.gmUserId === user.id);
  if (previewAsPlayer && accessLevel === 'gm') {
    const isParticipant = sessionDetail.participants.some(
      (p) => p.userId === user.id && p.leftAt === null,
    );
    accessLevel = isParticipant ? 'participant' : 'campaign-member';
  }

  // Resolve GM display name from campaign members list.
  const gmMember = detail.members.find((m) => m.userId === sessionDetail.gmUserId);
  const gmName = gmMember?.username ?? 'DM';

  // AppShell role drives the RoleSwitcher visibility — must reflect the REAL role so a
  // GM previewing as player can still toggle back to DM (don't use the clamped accessLevel).
  const realIsGm = callerWorldRole === 'gm' || sessionDetail.gmUserId === user.id;

  return (
    <AppShell
      title={sessionDetail.title}
      subtitle="SESIÓN"
      // REQ-DPPMB-DETAIL-07: back link to campaign.
      backHref={`/campanas/${id}`}
      callerRole={realIsGm ? 'gm' : 'player'}
    >
      {/* B5: DmControls wired into the dmControlsSlot (REQ-DPPMB-CTRL-01, contract from B4). */}
      <SessionDetailView
        detail={sessionDetail}
        events={events}
        accessLevel={accessLevel}
        campaignId={id}
        gmName={gmName}
        dmControlsSlot={
          <DmControls
            sessionId={sid}
            campaignId={id}
            status={sessionDetail.status}
            accessLevel={accessLevel}
            participants={sessionDetail.participants}
          />
        }
      />
    </AppShell>
  );
}

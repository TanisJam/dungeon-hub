'use server';

// Session Server Actions — campaign play-loop (Slice B).
// REQ-DPPMB-LIST-01, REQ-DPPMB-JOIN-05, REQ-DPPMB-LEAVE-01, REQ-DPPMB-CTRL-02,
// REQ-DPPMB-COMPLETE-03, REQ-DPPMB-DETAIL-05.
// ADR-B1: page-local actions in app/campanas/[id]/sessions/actions.ts (mirrors quests).
// ADR-B5: revalidatePath after every mutation.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Shared helpers (re-declared locally — actions files are page-local, ADR-B1)
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function handleApiError(err: unknown): ActionResult<never> {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string; error?: string; issues?: unknown[] } | null;
    // When the API returns a domain validation error (400 with an issues[] array),
    // serialize the issues so the calling component can map each code to a
    // human-readable message (join-sheet resolveErrorMessage / complete-form
    // resolveErrors both JSON.parse this). Without this they only saw "VALIDATION_FAILED".
    if (Array.isArray(body?.issues) && body.issues.length > 0) {
      return { ok: false, error: JSON.stringify(body.issues), status: err.status };
    }
    return {
      ok: false,
      error: body?.message ?? body?.error ?? `API ${err.status}`,
      status: err.status,
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : 'Error desconocido',
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionStatus = 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface SessionRow {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  dmNotes: string | null;
  status: SessionStatus;
  scheduledAt: string | null;
  levelMin: number | null;
  levelMax: number | null;
  maxPlayers: number | null;
  currentPlayers: number;
  locationHexId: string | null;
  gmUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnrichedParticipant {
  characterId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  name: string;
  lineage: string | null;
  level: number;
}

export interface SessionDetail extends SessionRow {
  participants: EnrichedParticipant[];
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  // API column is `event_type` → returned as `eventType` by the raw-row select
  // in listSessionEvents (use-cases/sessions/events.ts). NOT `type`.
  eventType: string;
  visibility: 'public' | 'dm-only';
  actorUserId: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

export interface CreateSessionBody {
  campaignId: string;
  title: string;
  description?: string;
  dmNotes?: string;
  scheduledAt?: string;
  levelMin?: number;
  levelMax?: number;
  maxPlayers?: number;
  locationHexId?: string;
}

export interface CompleteSessionBody {
  summary?: string;
  rewards?: {
    xpPerPlayer?: number;
    goldPerPlayer?: number;
    items?: Array<{
      characterId: string;
      slug: string;
      source: string;
      quantity?: number;
    }>;
  };
  worldChanges?: Array<{
    title: string;
    description?: string;
    dmNotes?: string;
    visibility?: 'public' | 'dm-only';
    tags?: string[];
  }>;
}

interface SessionListResponse {
  data: SessionRow[];
}

interface SessionEventsResponse {
  data: SessionEvent[];
}

// Revalidates the campaign detail page so the session list refreshes.
function revalidateCampaignDetail(campaignId: string) {
  revalidatePath(`/campanas/${campaignId}`);
}

// Revalidates both campaign detail and session detail.
function revalidateSessionPaths(campaignId: string, sessionId: string) {
  revalidatePath(`/campanas/${campaignId}`);
  revalidatePath(`/campanas/${campaignId}/sessions/${sessionId}`);
}

// ---------------------------------------------------------------------------
// listSessions — GET /sessions?campaignId= (REQ-DPPMB-LIST-01)
// ---------------------------------------------------------------------------

export async function listSessions(
  campaignId: string,
  status?: SessionStatus,
): Promise<ActionResult<SessionRow[]>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const params = new URLSearchParams({ campaignId });
    if (status) params.set('status', status);

    const res = await api.get<SessionListResponse>(
      `/sessions?${params.toString()}`,
      token,
    );
    return { ok: true, data: res.data ?? [] };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// getSession — GET /sessions/:id (REQ-DPPMB-DETAIL-01)
// ---------------------------------------------------------------------------

export async function getSession(
  id: string,
): Promise<ActionResult<SessionDetail>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.get<SessionDetail>(`/sessions/${id}`, token);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// createSession — POST /sessions (REQ-DPPMB-CREATE-01)
// ---------------------------------------------------------------------------

export async function createSession(
  body: CreateSessionBody,
): Promise<ActionResult<SessionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<SessionRow>('/sessions', body, token);
    revalidateCampaignDetail(body.campaignId);
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// joinSession — POST /sessions/:id/join (REQ-DPPMB-JOIN-05)
// ---------------------------------------------------------------------------

export async function joinSession(
  sessionId: string,
  characterId: string,
  campaignId: string,
): Promise<ActionResult<SessionDetail>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.post<SessionDetail>(
      `/sessions/${sessionId}/join`,
      { characterId },
      token,
    );
    revalidateSessionPaths(campaignId, sessionId);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// leaveSession — POST /sessions/:id/leave (REQ-DPPMB-LEAVE-01)
// ---------------------------------------------------------------------------

export async function leaveSession(
  sessionId: string,
  characterId: string,
  campaignId: string,
): Promise<ActionResult<SessionDetail>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.post<SessionDetail>(
      `/sessions/${sessionId}/leave`,
      { characterId },
      token,
    );
    revalidateSessionPaths(campaignId, sessionId);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// startSession — POST /sessions/:id/start (REQ-DPPMB-CTRL-02)
// ---------------------------------------------------------------------------

export async function startSession(
  sessionId: string,
  campaignId: string,
): Promise<ActionResult<SessionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.post<SessionRow>(`/sessions/${sessionId}/start`, undefined, token);
    revalidateSessionPaths(campaignId, sessionId);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// pauseSession — POST /sessions/:id/pause (REQ-DPPMB-CTRL-02)
// ---------------------------------------------------------------------------

export async function pauseSession(
  sessionId: string,
  campaignId: string,
): Promise<ActionResult<SessionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.post<SessionRow>(`/sessions/${sessionId}/pause`, undefined, token);
    revalidateSessionPaths(campaignId, sessionId);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// resumeSession — POST /sessions/:id/resume (REQ-DPPMB-CTRL-02)
// ---------------------------------------------------------------------------

export async function resumeSession(
  sessionId: string,
  campaignId: string,
): Promise<ActionResult<SessionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.post<SessionRow>(`/sessions/${sessionId}/resume`, undefined, token);
    revalidateSessionPaths(campaignId, sessionId);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// cancelSession — POST /sessions/:id/cancel (REQ-DPPMB-CTRL-02)
// ---------------------------------------------------------------------------

export async function cancelSession(
  sessionId: string,
  campaignId: string,
): Promise<ActionResult<SessionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.post<SessionRow>(`/sessions/${sessionId}/cancel`, undefined, token);
    revalidateSessionPaths(campaignId, sessionId);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// completeSession — POST /sessions/:id/complete (REQ-DPPMB-COMPLETE-03)
// ---------------------------------------------------------------------------

export async function completeSession(
  sessionId: string,
  campaignId: string,
  body: CompleteSessionBody,
): Promise<ActionResult<SessionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const res = await api.post<SessionRow>(`/sessions/${sessionId}/complete`, body, token);
    revalidateSessionPaths(campaignId, sessionId);
    return { ok: true, data: res };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// listSessionEvents — GET /sessions/:id/events (REQ-DPPMB-DETAIL-05)
// ---------------------------------------------------------------------------

export async function listSessionEvents(
  sessionId: string,
  opts?: {
    since?: string;
    limit?: number;
    offset?: number;
    type?: string;
  },
): Promise<ActionResult<SessionEvent[]>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const params = new URLSearchParams();
    if (opts?.since) params.set('since', opts.since);
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
    if (opts?.type) params.set('type', opts.type);

    const qs = params.toString();
    const res = await api.get<SessionEventsResponse>(
      `/sessions/${sessionId}/events${qs ? `?${qs}` : ''}`,
      token,
    );
    return { ok: true, data: res.data ?? [] };
  } catch (err) {
    return handleApiError(err);
  }
}

'use server';

// Quests Server Actions — world-scoped DM quest management (MVP gap #3.7).
// REQ-QUEST-WEB-ACTIONS-01, REQ-QUEST-WEB-ACTIONS-02: revalidatePath + Bearer JWT forwarding.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Shared helpers (re-declared locally — actions files are page-local)
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
    const body = err.body as { message?: string; error?: string } | null;
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

export type QuestStatus = 'available' | 'active' | 'completed' | 'abandoned';
export type QuestVisibility = 'public' | 'dm-only';

export interface QuestRow {
  id: string;
  worldId: string;
  title: string;
  description: string | null;
  dmNotes: string | null;
  status: QuestStatus;
  visibility: QuestVisibility;
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestBody {
  title: string;
  description?: string | null;
  dmNotes?: string | null;
  status?: QuestStatus;
  visibility?: QuestVisibility;
}

interface QuestListResponse {
  data: QuestRow[];
}

export interface QuestSearchResult {
  rows: QuestRow[];
  total: number;
}

// ---------------------------------------------------------------------------
// listQuests — called by shell debounced search via onSearch prop.
// REQ-QUEST-WEB-ACTIONS-01: supports ?status= query-string filter.
// ---------------------------------------------------------------------------

export async function listQuests(
  worldId: string,
  q?: string,
  offset = 0,
  status?: QuestStatus,
): Promise<QuestSearchResult> {
  const token = await getToken();
  if (!token) return { rows: [], total: 0 };

  try {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (q?.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);

    const res = await api.get<QuestListResponse>(
      `/worlds/${worldId}/quests?${params.toString()}`,
      token,
    );
    const rows = res.data ?? [];
    return { rows, total: rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getQuestDetail — fetch single quest (detail sheet).
// dm-only quests return 404 for players (API enforces).
// ---------------------------------------------------------------------------

export async function getQuestDetail(questId: string): Promise<QuestRow | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    return await api.get<QuestRow>(`/quests/${questId}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// createQuest — GM-only. REQ-QUEST-WEB-ACTIONS-01.
// ---------------------------------------------------------------------------

export async function createQuest(
  worldId: string,
  body: QuestBody,
): Promise<ActionResult<QuestRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<QuestRow>(
      `/worlds/${worldId}/quests`,
      body,
      token,
    );
    revalidatePath('/codex/quests');
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// updateQuest — GM-only. REQ-QUEST-WEB-ACTIONS-01.
// ---------------------------------------------------------------------------

export async function updateQuest(
  questId: string,
  body: Partial<QuestBody>,
): Promise<ActionResult<QuestRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<QuestRow>(`/quests/${questId}`, body, token);
    revalidatePath('/codex/quests');
    return { ok: true, data: updated };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// deleteQuest — GM-only. REQ-QUEST-WEB-ACTIONS-01.
// ---------------------------------------------------------------------------

export async function deleteQuest(questId: string): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(`/quests/${questId}`, token);
    revalidatePath('/codex/quests');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

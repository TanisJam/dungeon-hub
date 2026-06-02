'use server';

// Codex Server Actions — Facciones CRUD.
// REQ-FAC-03, REQ-GATE-02: propagate 400/403/404 to UI; no swallowed errors.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type FactionState = 'active' | 'dormant' | 'destroyed' | 'disbanded';

export interface FactionRow {
  id: string;
  worldId: string;
  name: string;
  state: FactionState;
  description: string | null;
  dmNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FactionBody {
  name: string;
  description?: string;
  dmNotes?: string;
  state?: FactionState;
}

interface ListResponse {
  data: FactionRow[];
}

export interface SearchResult {
  rows: FactionRow[];
  total: number;
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

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
// listFactions — called by the shell debounced search via onSearch prop
// ---------------------------------------------------------------------------

export async function listFactions(
  worldId: string,
  q?: string,
  offset = 0,
): Promise<SearchResult> {
  const token = await getToken();
  if (!token) return { rows: [], total: 0 };

  try {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (q?.trim()) params.set('q', q.trim());

    const res = await api.get<ListResponse>(
      `/worlds/${worldId}/factions?${params.toString()}`,
      token,
    );
    const rows = res.data ?? [];
    return { rows, total: rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getFactionDetail — fetch single faction (detail sheet)
// ---------------------------------------------------------------------------

export async function getFactionDetail(factionId: string): Promise<FactionRow | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    return await api.get<FactionRow>(`/factions/${factionId}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// createFaction — DM-only. REQ-FAC-03.
// ---------------------------------------------------------------------------

export async function createFaction(
  worldId: string,
  body: FactionBody,
): Promise<ActionResult<FactionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<FactionRow>(
      `/worlds/${worldId}/factions`,
      body,
      token,
    );
    revalidatePath('/codex/facciones');
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// updateFaction — DM-only. REQ-FAC-03.
// ---------------------------------------------------------------------------

export async function updateFaction(
  factionId: string,
  body: Partial<FactionBody>,
): Promise<ActionResult<FactionRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<FactionRow>(`/factions/${factionId}`, body, token);
    revalidatePath('/codex/facciones');
    return { ok: true, data: updated };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// deleteFaction — DM-only. REQ-FAC-03.
// ---------------------------------------------------------------------------

export async function deleteFaction(factionId: string): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(`/factions/${factionId}`, token);
    revalidatePath('/codex/facciones');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

// ===========================================================================
// NPCs — REQ-NPC-01, REQ-NPC-02, REQ-GATE-02
// ===========================================================================

export type NpcStatus = 'alive' | 'dead' | 'missing' | 'unknown';

export interface NpcFaction {
  id: string;
  worldId: string;
  name: string;
  state: FactionState;
  description: string | null;
}

export interface NpcRow {
  id: string;
  worldId: string;
  name: string;
  race: string | null;
  description: string | null;
  dmNotes?: string | null;
  hexId: string | null;
  status: NpcStatus;
  worldX: number | null;
  worldY: number | null;
  factions: NpcFaction[];
  createdAt: string;
  updatedAt: string;
}

export interface NpcBody {
  name: string;
  race?: string;
  description?: string;
  dmNotes?: string;
  hexId?: string;
  status?: NpcStatus;
}

interface NpcListResponse {
  data: NpcRow[];
}

export interface NpcSearchResult {
  rows: NpcRow[];
  total: number;
}

// ---------------------------------------------------------------------------
// listNpcs — called by shell debounced search via onSearch prop
// ---------------------------------------------------------------------------

export async function listNpcs(
  worldId: string,
  q?: string,
  offset = 0,
): Promise<NpcSearchResult> {
  const token = await getToken();
  if (!token) return { rows: [], total: 0 };

  try {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (q?.trim()) params.set('q', q.trim());

    const res = await api.get<NpcListResponse>(
      `/worlds/${worldId}/npcs?${params.toString()}`,
      token,
    );
    const rows = res.data ?? [];
    return { rows, total: rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getNpcDetail — fetch single NPC (detail sheet)
// ---------------------------------------------------------------------------

export async function getNpcDetail(npcId: string): Promise<NpcRow | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    return await api.get<NpcRow>(`/npcs/${npcId}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// createNpc — DM-only. REQ-NPC-01.
// ---------------------------------------------------------------------------

export async function createNpc(
  worldId: string,
  body: NpcBody,
): Promise<ActionResult<NpcRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<NpcRow>(`/worlds/${worldId}/npcs`, body, token);
    revalidatePath('/codex/npcs');
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// updateNpc — DM-only. REQ-NPC-01.
// ---------------------------------------------------------------------------

export async function updateNpc(
  npcId: string,
  body: Partial<NpcBody>,
): Promise<ActionResult<NpcRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<NpcRow>(`/npcs/${npcId}`, body, token);
    revalidatePath('/codex/npcs');
    return { ok: true, data: updated };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// deleteNpc — DM-only. REQ-NPC-01.
// ---------------------------------------------------------------------------

export async function deleteNpc(npcId: string): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(`/npcs/${npcId}`, token);
    revalidatePath('/codex/npcs');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// attachNpcFaction — DM-only N:M attach. REQ-NPC-02.
// POST /worlds/:worldId/npcs/:npcId/factions/:factionId
// ---------------------------------------------------------------------------

export async function attachNpcFaction(
  worldId: string,
  npcId: string,
  factionId: string,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.post(
      `/worlds/${worldId}/npcs/${npcId}/factions/${factionId}`,
      {},
      token,
    );
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// detachNpcFaction — DM-only N:M detach. REQ-NPC-02.
// DELETE /worlds/:worldId/npcs/:npcId/factions/:factionId
// ---------------------------------------------------------------------------

export async function detachNpcFaction(
  worldId: string,
  npcId: string,
  factionId: string,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(
      `/worlds/${worldId}/npcs/${npcId}/factions/${factionId}`,
      token,
    );
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

// ===========================================================================
// getActiveWorldForCodex — convenience wrapper for page-level use
// ===========================================================================

export { getActiveWorld };

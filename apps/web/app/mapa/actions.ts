'use server';

// Mapa Server Actions — Hexes (ubicaciones) + POIs CRUD.
// REQ-MAP-01, REQ-GATE-02: propagate 400/403/404 to UI; no swallowed errors.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Shared helpers
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

// ===========================================================================
// Hexes (Ubicaciones) — REQ-MAP-01
// ===========================================================================

export type HexStatus = 'unexplored' | 'rumored' | 'explored' | 'cleared';

export interface HexRow {
  id: string;
  worldId: string;
  parentHexId: string | null;
  scale: string | null;
  q: number;
  r: number;
  worldX: number | null;
  worldY: number | null;
  name: string | null;
  terrain: string | null;
  status: HexStatus;
  dmNotes: string | null;
  playerNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HexBody {
  q: number;
  r: number;
  name?: string;
  terrain?: string;
  status?: HexStatus;
  parentHexId?: string | null;
  scale?: string;
  dmNotes?: string;
  playerNotes?: string;
}

interface HexListResponse {
  data: HexRow[];
}

export interface HexSearchResult {
  rows: HexRow[];
  total: number;
}

// ---------------------------------------------------------------------------
// listHexes — called by shell debounced search via onSearch prop.
// REQ-MAP-01: ?parent=top for initial load.
// ---------------------------------------------------------------------------

export async function listHexes(
  worldId: string,
  q?: string,
  offset = 0,
): Promise<HexSearchResult> {
  const token = await getToken();
  if (!token) return { rows: [], total: 0 };

  try {
    const params = new URLSearchParams({ parent: 'top', limit: '50', offset: String(offset) });
    if (q?.trim()) params.set('q', q.trim());

    const res = await api.get<HexListResponse>(
      `/worlds/${worldId}/hexes?${params.toString()}`,
      token,
    );
    const rows = res.data ?? [];
    return { rows, total: rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getHexDetail — fetch single hex (detail sheet).
// ---------------------------------------------------------------------------

export async function getHexDetail(hexId: string): Promise<HexRow | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    return await api.get<HexRow>(`/hexes/${hexId}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// createHex — DM-only. REQ-MAP-01. q/r required.
// ---------------------------------------------------------------------------

export async function createHex(
  worldId: string,
  body: HexBody,
): Promise<ActionResult<HexRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<HexRow>(
      `/worlds/${worldId}/hexes`,
      body,
      token,
    );
    revalidatePath('/mapa');
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// updateHex — DM-only. REQ-MAP-01.
// ---------------------------------------------------------------------------

export async function updateHex(
  hexId: string,
  body: Partial<HexBody>,
): Promise<ActionResult<HexRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<HexRow>(`/hexes/${hexId}`, body, token);
    revalidatePath('/mapa');
    return { ok: true, data: updated };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// deleteHex — DM-only. REQ-MAP-01.
// ---------------------------------------------------------------------------

export async function deleteHex(hexId: string): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(`/hexes/${hexId}`, token);
    revalidatePath('/mapa');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

// ===========================================================================
// POIs — nested under hex, lazy loaded on accordion expand.
// REQ-MAP-01: listPois is NOT called at page load — only on expand.
// ===========================================================================

export type PoiStatus = 'unknown' | 'discovered' | 'cleared';

export interface PoiRow {
  id: string;
  hexId: string;
  name: string;
  description: string | null;
  dmNotes: string | null;
  status: PoiStatus;
  worldX: number | null;
  worldY: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PoiBody {
  name: string;
  description?: string;
  dmNotes?: string;
  status?: PoiStatus;
}

interface PoiListResponse {
  data: PoiRow[];
}

// ---------------------------------------------------------------------------
// listPois — lazy, called ONLY when user expands a hex accordion.
// REQ-MAP-01 Scenario: POI accordion does not N+1 on load.
// CRITICAL: this MUST NOT be called at page load.
// ---------------------------------------------------------------------------

export async function listPois(hexId: string): Promise<PoiRow[]> {
  const token = await getToken();
  if (!token) return [];

  try {
    const res = await api.get<PoiListResponse>(`/hexes/${hexId}/pois`, token);
    return res.data ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// listAllPois — SSR, called ONLY when activeMapView === 'mapa'.
// REQ-POI-MARKER-01: fetches all world-scope POIs for the marker layer.
// The API applies role-based cascade filtering (unexplored hex + unknown status).
// ---------------------------------------------------------------------------

export async function listAllPois(worldId: string): Promise<PoiRow[]> {
  const token = await getToken();
  if (!token) return [];

  try {
    const res = await api.get<PoiListResponse>(`/worlds/${worldId}/pois?parent=all`, token);
    return res.data ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// createPoi — DM-only.
// ---------------------------------------------------------------------------

export async function createPoi(
  hexId: string,
  body: PoiBody,
): Promise<ActionResult<PoiRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<PoiRow>(`/hexes/${hexId}/pois`, body, token);
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// updatePoi — DM-only.
// ---------------------------------------------------------------------------

export async function updatePoi(
  poiId: string,
  body: Partial<PoiBody>,
): Promise<ActionResult<PoiRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<PoiRow>(`/pois/${poiId}`, body, token);
    return { ok: true, data: updated };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// deletePoi — DM-only.
// ---------------------------------------------------------------------------

export async function deletePoi(poiId: string): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(`/pois/${poiId}`, token);
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

'use server';

// Bitácora Server Actions — Eventos (world_events) + Notas (journal_entries) CRUD.
// + Unified guild-bitacora feed aggregation (bitacora-gremio W4).
// REQ-CRO-02, REQ-CRO-03, REQ-GATE-02: propagate 400/403/404 to UI; no swallowed errors.
// REQ-GREM-FD-01: listGuildBitacoraFeed action (barrido-final REQ-RENAME-03, REQ-FEED-01).

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
// World Events (Eventos) — REQ-CRO-02
// ===========================================================================

export type EventVisibility = 'public' | 'dm-only';

export interface EventRow {
  id: string;
  worldId: string;
  title: string;
  description: string | null;
  dmNotes?: string | null;
  occurredAt: string;
  sourceSessionId: string | null;
  visibility: EventVisibility;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventBody {
  title: string;
  description?: string;
  dmNotes?: string;
  occurredAt: string;
  sourceSessionId?: string;
  visibility?: EventVisibility;
  tags?: string[];
}

interface EventListResponse {
  data: EventRow[];
}

export interface EventSearchResult {
  rows: EventRow[];
  total: number;
}

// ---------------------------------------------------------------------------
// listEvents — called by shell debounced search via onSearch prop.
// REQ-CRO-02: supports ?tag= query-string filter.
// ---------------------------------------------------------------------------

export async function listEvents(
  worldId: string,
  q?: string,
  offset = 0,
  tag?: string,
): Promise<EventSearchResult> {
  const token = await getToken();
  if (!token) return { rows: [], total: 0 };

  try {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (q?.trim()) params.set('q', q.trim());
    if (tag?.trim()) params.set('tag', tag.trim());

    const res = await api.get<EventListResponse>(
      `/worlds/${worldId}/world-events?${params.toString()}`,
      token,
    );
    const rows = res.data ?? [];
    return { rows, total: rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getEventDetail — fetch single event (detail sheet).
// dm-only events return 404 for players (API enforces).
// ---------------------------------------------------------------------------

export async function getEventDetail(eventId: string): Promise<EventRow | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    return await api.get<EventRow>(`/world-events/${eventId}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// createEvent — DM-only. REQ-CRO-02.
// ---------------------------------------------------------------------------

export async function createEvent(
  worldId: string,
  body: EventBody,
): Promise<ActionResult<EventRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<EventRow>(
      `/worlds/${worldId}/world-events`,
      body,
      token,
    );
    revalidatePath('/bitacora/eventos');
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// updateEvent — DM-only. REQ-CRO-02.
// ---------------------------------------------------------------------------

export async function updateEvent(
  eventId: string,
  body: Partial<EventBody>,
): Promise<ActionResult<EventRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<EventRow>(`/world-events/${eventId}`, body, token);
    revalidatePath('/bitacora/eventos');
    return { ok: true, data: updated };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// deleteEvent — DM-only. REQ-CRO-02.
// ---------------------------------------------------------------------------

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(`/world-events/${eventId}`, token);
    revalidatePath('/bitacora/eventos');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

// ===========================================================================
// Journal Entries (Notas) — REQ-CRO-03
// ===========================================================================

export type JournalVisibility = 'public' | 'dm-only';

export interface JournalRow {
  id: string;
  worldId: string;
  title: string;
  body: string | null;
  visibility: JournalVisibility;
  tags: string[];
  authorUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalBody {
  title: string;
  body?: string;
  visibility?: JournalVisibility;
  tags?: string[];
}

interface JournalListResponse {
  data: JournalRow[];
}

export interface JournalSearchResult {
  rows: JournalRow[];
  total: number;
}

// ---------------------------------------------------------------------------
// listJournalEntries — called by shell debounced search via onSearch prop.
// REQ-CRO-03: supports ?tag= query-string filter.
// ---------------------------------------------------------------------------

export async function listJournalEntries(
  worldId: string,
  q?: string,
  offset = 0,
  tag?: string,
): Promise<JournalSearchResult> {
  const token = await getToken();
  if (!token) return { rows: [], total: 0 };

  try {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (q?.trim()) params.set('q', q.trim());
    if (tag?.trim()) params.set('tag', tag.trim());

    const res = await api.get<JournalListResponse>(
      `/worlds/${worldId}/journal-entries?${params.toString()}`,
      token,
    );
    const rows = res.data ?? [];
    return { rows, total: rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getJournalDetail — fetch single journal entry (detail sheet).
// dm-only entries return 404 for players (API enforces).
// ---------------------------------------------------------------------------

export async function getJournalDetail(entryId: string): Promise<JournalRow | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    return await api.get<JournalRow>(`/journal-entries/${entryId}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// createJournalEntry — DM-only. REQ-CRO-03.
// ---------------------------------------------------------------------------

export async function createJournalEntry(
  worldId: string,
  body: JournalBody,
): Promise<ActionResult<JournalRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const created = await api.post<JournalRow>(
      `/worlds/${worldId}/journal-entries`,
      body,
      token,
    );
    revalidatePath('/bitacora/notas');
    return { ok: true, data: created };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// updateJournalEntry — DM-only. REQ-CRO-03.
// ---------------------------------------------------------------------------

export async function updateJournalEntry(
  entryId: string,
  body: Partial<JournalBody>,
): Promise<ActionResult<JournalRow>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<JournalRow>(`/journal-entries/${entryId}`, body, token);
    revalidatePath('/bitacora/notas');
    return { ok: true, data: updated };
  } catch (err) {
    return handleApiError(err);
  }
}

// ---------------------------------------------------------------------------
// deleteJournalEntry — DM-only. REQ-CRO-03.
// ---------------------------------------------------------------------------

export async function deleteJournalEntry(entryId: string): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    await api.delete(`/journal-entries/${entryId}`, token);
    revalidatePath('/bitacora/notas');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleApiError(err);
  }
}

// ===========================================================================
// Unified guild bitacora feed (bitacora-gremio W4) — REQ-GREM-FD-01
// Renamed from CronicaFeed → GuildBitacoraFeed (barrido-final REQ-RENAME-03).
// ===========================================================================

export type FeedSource = 'gremio' | 'dm' | 'evento';

/** Normalized feed item returned by GET /worlds/:worldId/cronica-feed */
export interface FeedItem {
  id: string;
  source: FeedSource;
  title: string | null;
  body: string | null;
  tags: string[];
  sortAt: string; // ISO string — normalized recency key (ADR-5)
  sealedStatus?: 'confirmed' | 'debunked' | null;
  visibility: string;
  refEntityKind?: string | null;
  refEntityId?: string | null;
  authorUserId?: string | null;
  /**
   * Back-link to the source bitácora page when this contribution was created
   * via the personal-share path. null for non-share contributions.
   * Used by feed-card to show "Bitácora" badge (ADR-7, REQ-SHARE-07).
   * bitacora-personal-share SDD spec #2035.
   */
  sourceBitacoraPageId?: string | null;
}

/** REQ-FEED-01: pageCount = rows on current page (NOT aggregate total). */
export interface GuildBitacoraFeedResult {
  rows: FeedItem[];
  pageCount: number;
  nextOffset: number | null;
}

// ---------------------------------------------------------------------------
// listGuildBitacoraFeed — unified guild bitácora feed (REQ-GREM-FD-01)
// NOTE: API endpoint URL /worlds/:id/cronica-feed is intentionally UNCHANGED.
// ---------------------------------------------------------------------------

export async function listGuildBitacoraFeed(
  worldId: string,
  opts: { tag?: string; source?: FeedSource; offset?: number; limit?: number },
): Promise<GuildBitacoraFeedResult> {
  const token = await getToken();
  if (!token) return { rows: [], pageCount: 0, nextOffset: null };

  try {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) });
    if (opts.tag?.trim()) params.set('tag', opts.tag.trim());
    if (opts.source) params.set('source', opts.source);

    // NOTE: API endpoint URL is intentionally /cronica-feed (not renamed — barrido-final spec)
    const res = await api.get<GuildBitacoraFeedResult>(
      `/worlds/${worldId}/cronica-feed?${params.toString()}`,
      token,
    );
    return res;
  } catch {
    return { rows: [], pageCount: 0, nextOffset: null };
  }
}

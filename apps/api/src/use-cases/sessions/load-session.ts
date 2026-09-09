import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  campaignMembers,
  campaigns,
  characters,
  sessionParticipants,
  sessions,
  worldMembers,
} from '../../infra/db/schema.js';

export type SessionStatus = 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface LoadedSession {
  id: string;
  campaignId: string;
  gmUserId: string;
  title: string;
  description: string | null;
  dmNotes: string | null;
  status: SessionStatus;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  levelMin: number | null;
  levelMax: number | null;
  maxPlayers: number | null;
  locationHexId: string | null;
  summary: string | null;
  rewards: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadSession(id: string): Promise<LoadedSession | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return (rows[0] as LoadedSession | undefined) ?? null;
}

/**
 * Resolves the worldId that owns a campaign.
 * Returns null if the campaign no longer exists.
 */
export async function loadCampaignWorldId(campaignId: string): Promise<string | null> {
  const rows = await db
    .select({ worldId: campaigns.worldId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  return rows[0]?.worldId ?? null;
}

/**
 * Resolves the worldId for a session by loading its campaign.
 * Returns null if the campaign no longer exists.
 */
export async function loadSessionWorldId(session: LoadedSession): Promise<string | null> {
  return loadCampaignWorldId(session.campaignId);
}

export type SessionAccess = 'gm' | 'participant' | 'campaign-member' | 'none';

/**
 * Devuelve el nivel de acceso del user sobre la sesión:
 * - 'gm':              el GM que creó la sesión, o cualquier world GM del world de la campaña.
 * - 'participant':     un jugador que joineó un char (read + leave; write limitado).
 * - 'campaign-member': miembro de la campaña pero no participante (read public-only).
 * - 'none':            sin acceso → 403.
 *
 * Post-C3: 'gm' is returned for any worldMember with role='gm' of the world
 * that owns the session's campaign. This allows multi-DM sessions.
 */
export async function getSessionAccess(
  session: LoadedSession,
  userId: string,
): Promise<SessionAccess> {
  // Check if session creator
  if (session.gmUserId === userId) return 'gm';

  // Check world-level GM membership
  const campaignRow = await db
    .select({ worldId: campaigns.worldId })
    .from(campaigns)
    .where(eq(campaigns.id, session.campaignId))
    .limit(1);
  const worldId = campaignRow[0]?.worldId;
  if (worldId) {
    const gmRow = await db
      .select({ role: worldMembers.role })
      .from(worldMembers)
      .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)))
      .limit(1);
    if (gmRow.length > 0 && gmRow[0]!.role === 'gm') return 'gm';
  }

  // ¿Es participant activo?
  const partRows = await db
    .select({ characterId: sessionParticipants.characterId })
    .from(sessionParticipants)
    .where(
      and(
        eq(sessionParticipants.sessionId, session.id),
        eq(sessionParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (partRows.length > 0) return 'participant';

  // ¿Miembro de la campaña?
  const memberRows = await db
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, session.campaignId),
        eq(campaignMembers.userId, userId),
      ),
    )
    .limit(1);
  if (memberRows.length > 0) return 'campaign-member';

  return 'none';
}

/**
 * Sanitiza una sesión para una respuesta HTTP según el rol del caller.
 * - GM ve TODO (incluyendo dm_notes).
 * - El resto NUNCA ve dm_notes.
 */
export function sanitizeSessionForRole(
  session: LoadedSession,
  access: SessionAccess,
): Omit<LoadedSession, 'dmNotes'> & { dmNotes?: string | null } {
  if (access === 'gm') return session;
  const { dmNotes: _omit, ...rest } = session;
  return rest;
}

/**
 * Devuelve los character IDs del user que YA están en una sesión live
 * (status active/paused, no left). Hard-constraint: un char solo puede
 * estar en una sesión live a la vez.
 *
 * `excludeSessionId` evita falsos positivos si el caller ya sabe que el char
 * está en la sesión que está editando (p.ej. validar antes de join en una
 * sesión que el char ya integra → debería pasar).
 */
export async function findCharacterActiveSession(
  characterId: string,
  excludeSessionId?: string,
): Promise<{ sessionId: string; status: SessionStatus } | null> {
  const conditions = [
    eq(sessionParticipants.characterId, characterId),
    isNull(sessionParticipants.leftAt),
    inArray(sessions.status, ['active', 'paused'] as SessionStatus[]),
  ];
  if (excludeSessionId) {
    conditions.push(ne(sessionParticipants.sessionId, excludeSessionId));
  }

  const rows = await db
    .select({ sessionId: sessions.id, status: sessions.status })
    .from(sessionParticipants)
    .innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId))
    .where(and(...conditions))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { sessionId: row.sessionId, status: row.status as SessionStatus };
}

export type LoadCharacterForSessionResult =
  | { ok: true; character: { id: string; userId: string } }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_OWNER' | 'WRONG_WORLD'; characterWorldId?: string };

/**
 * Helper para validar que un character existe Y pertenece al user que lo
 * quiere joinear/leavear, EN el world de la sesión.
 *
 * Post-C2: characters no longer have campaign_id; they belong to a world.
 * The session's worldId is resolved via its campaign (campaign.worldId).
 *
 * C4: Returns a discriminated result so the route can emit the correct issue
 * code — CHARACTER_NOT_IN_WORLD vs CHARACTER_NOT_ELIGIBLE.
 */
export async function loadCharacterForSession(
  characterId: string,
  userId: string,
  sessionWorldId: string,
): Promise<LoadCharacterForSessionResult> {
  const rows = await db
    .select({ id: characters.id, userId: characters.userId, worldId: characters.worldId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);
  const c = rows[0];
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  if (c.userId !== userId) return { ok: false, reason: 'NOT_OWNER' };
  if (c.worldId !== sessionWorldId) {
    return { ok: false, reason: 'WRONG_WORLD', characterWorldId: c.worldId };
  }
  return { ok: true, character: { id: c.id, userId: c.userId } };
}

export async function listSessionParticipants(sessionId: string): Promise<
  Array<{
    characterId: string;
    userId: string;
    joinedAt: Date;
    leftAt: Date | null;
  }>
> {
  const rows = await db
    .select({
      characterId: sessionParticipants.characterId,
      userId: sessionParticipants.userId,
      joinedAt: sessionParticipants.joinedAt,
      leftAt: sessionParticipants.leftAt,
    })
    .from(sessionParticipants)
    .where(eq(sessionParticipants.sessionId, sessionId));
  return rows;
}

// ---------------------------------------------------------------------------
// B0 Enrichment helpers (REQ-DPPMB-DETAIL-04, REQ-DPPMB-LIST-01)
// ---------------------------------------------------------------------------

export interface EnrichedParticipant {
  characterId: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
  /** Character display name. */
  name: string;
  /**
   * Raw lineage string extracted from character.data->>'lineage' or
   * data->>'race'. Null when the character has no race/lineage set yet.
   */
  lineage: string | null;
  /** Sum of class levels from character.data.classes[]. 0 when no class. */
  level: number;
}

interface RawCharacterClass {
  classSlug?: string;
  level?: number;
}

function projectClassesLevel(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const raw = (data as { classes?: unknown }).classes;
  if (!Array.isArray(raw)) return 0;
  let total = 0;
  for (const entry of raw as RawCharacterClass[]) {
    if (!entry || typeof entry !== 'object') continue;
    const lvl = typeof entry.level === 'number' && Number.isFinite(entry.level) ? entry.level : 0;
    total += lvl;
  }
  return total;
}

/**
 * Enriches a session's participant list with character name, lineage, and
 * level via a single LEFT JOIN on `characters`. Mirrors the `projectClasses`
 * pattern from `list-world-characters.ts`.
 *
 * REQ-DPPMB-DETAIL-04: name + lineage + level for all participants,
 * including cross-user characters.
 */
export async function enrichParticipants(
  sessionId: string,
): Promise<EnrichedParticipant[]> {
  const rows = await db
    .select({
      characterId: sessionParticipants.characterId,
      userId: sessionParticipants.userId,
      joinedAt: sessionParticipants.joinedAt,
      leftAt: sessionParticipants.leftAt,
      characterName: characters.name,
      characterData: characters.data,
    })
    .from(sessionParticipants)
    .leftJoin(characters, eq(characters.id, sessionParticipants.characterId))
    .where(eq(sessionParticipants.sessionId, sessionId));

  return rows.map((r) => {
    const data = r.characterData as unknown;
    // Extract lineage: try data.lineage (string) then data.race (string).
    // When race is stored as {slug,source} object, text extraction yields null.
    let lineage: string | null = null;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d['lineage'] === 'string') lineage = d['lineage'];
      else if (typeof d['race'] === 'string') lineage = d['race'];
    }

    return {
      characterId: r.characterId,
      userId: r.userId,
      joinedAt: r.joinedAt,
      leftAt: r.leftAt,
      name: r.characterName ?? r.characterId,
      lineage,
      level: projectClassesLevel(data),
    };
  });
}

/**
 * Participant ref shape used in the session list response.
 * Intentionally lightweight — the detail endpoint (GET /sessions/:id) returns
 * enriched participants (name, lineage, level) via enrichParticipants().
 */
export interface SessionParticipantRef {
  characterId: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

/**
 * Attaches a `participants` array (all rows, including those who left) to each
 * session row via a SINGLE query (no N+1).
 *
 * REQ-DPPMB-LIST-08: campaign-detail page needs the caller's participant set so
 * session cards can render the correct "En sesión" / "Unirme" affordance.
 * B6 cross-batch fix: the list endpoint was missing this, causing activeParticipantCharIds
 * to always be [] on page load.
 */
export async function attachParticipants<T extends { id: string }>(
  rows: T[],
): Promise<(T & { participants: SessionParticipantRef[] })[]> {
  if (rows.length === 0) return rows.map((r) => ({ ...r, participants: [] }));

  const sessionIds = rows.map((r) => r.id);

  const allParticipants = await db
    .select({
      sessionId: sessionParticipants.sessionId,
      characterId: sessionParticipants.characterId,
      userId: sessionParticipants.userId,
      joinedAt: sessionParticipants.joinedAt,
      leftAt: sessionParticipants.leftAt,
    })
    .from(sessionParticipants)
    .where(inArray(sessionParticipants.sessionId, sessionIds));

  // Group by sessionId.
  const participantMap = new Map<string, SessionParticipantRef[]>();
  for (const p of allParticipants) {
    const list = participantMap.get(p.sessionId) ?? [];
    list.push({
      characterId: p.characterId,
      userId: p.userId,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
    });
    participantMap.set(p.sessionId, list);
  }

  return rows.map((r) => ({
    ...r,
    participants: participantMap.get(r.id) ?? [],
  }));
}

/**
 * Attaches a `currentPlayers` count (participants with leftAt IS NULL) to
 * each session row via a SINGLE grouped-join query (no N+1).
 *
 * REQ-DPPMB-LIST-01: session list includes current active player count.
 */
export async function attachCurrentPlayers<T extends { id: string }>(
  rows: T[],
): Promise<(T & { currentPlayers: number })[]> {
  if (rows.length === 0) return [];

  const sessionIds = rows.map((r) => r.id);

  const counts = await db
    .select({
      sessionId: sessionParticipants.sessionId,
      currentPlayers: count(sessionParticipants.characterId),
    })
    .from(sessionParticipants)
    .where(
      and(
        inArray(sessionParticipants.sessionId, sessionIds),
        isNull(sessionParticipants.leftAt),
      ),
    )
    .groupBy(sessionParticipants.sessionId);

  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.currentPlayers)]));

  return rows.map((r) => ({
    ...r,
    currentPlayers: countMap.get(r.id) ?? 0,
  }));
}

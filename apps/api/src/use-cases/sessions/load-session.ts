import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  campaignMembers,
  characters,
  sessionParticipants,
  sessions,
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

export type SessionAccess = 'gm' | 'participant' | 'campaign-member' | 'none';

/**
 * Devuelve el nivel de acceso del user sobre la sesión:
 * - 'gm':              el GM que creó la sesión (full read/write).
 * - 'participant':     un jugador que joineó un char (read + leave; write limitado).
 * - 'campaign-member': miembro de la campaña pero no participante (read public-only).
 * - 'none':            sin acceso → 403.
 *
 * Para sesiones, "gm" es el `gm_user_id` de la sesión, NO el GM de la campaña
 * (aunque típicamente coinciden — el GM crea sus propias sesiones).
 */
export async function getSessionAccess(
  session: LoadedSession,
  userId: string,
): Promise<SessionAccess> {
  if (session.gmUserId === userId) return 'gm';

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

/**
 * Helper para validar que un character existe Y pertenece al user que lo
 * quiere joinear/leavear, EN la campaña de la sesión.
 */
export async function loadCharacterForSession(
  characterId: string,
  userId: string,
  campaignId: string,
): Promise<{ id: string; userId: string } | null> {
  const rows = await db
    .select({ id: characters.id, userId: characters.userId, campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);
  const c = rows[0];
  if (!c) return null;
  if (c.userId !== userId) return null;
  if (c.campaignId !== campaignId) return null;
  return { id: c.id, userId: c.userId };
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

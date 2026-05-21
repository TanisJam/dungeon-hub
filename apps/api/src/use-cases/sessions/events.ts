import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { sessionEvents } from '../../infra/db/schema.js';
import type { SessionAccess, SessionStatus } from './load-session.js';

export type EventVisibility = 'public' | 'dm-only';

export interface SessionEventRow {
  id: string;
  sessionId: string;
  occurredAt: Date;
  actorUserId: string | null;
  eventType: string;
  payload: unknown;
  visibility: EventVisibility;
  createdAt: Date;
}

export interface RecordEventInput {
  sessionId: string;
  /** null = system event (auto). */
  actorUserId: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
  visibility?: EventVisibility;
  /** Default now(). Útil para logear post-facto. */
  occurredAt?: Date;
}

export async function recordSessionEvent(input: RecordEventInput): Promise<SessionEventRow> {
  const [row] = await db
    .insert(sessionEvents)
    .values({
      sessionId: input.sessionId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      payload: input.payload ?? {},
      visibility: input.visibility ?? 'public',
      ...(input.occurredAt && { occurredAt: input.occurredAt }),
    })
    .returning();
  return row as SessionEventRow;
}

export interface ListEventsOptions {
  sessionId: string;
  /** Filtrar por tipo exacto. */
  type?: string;
  /** Solo events posteriores a este timestamp. */
  since?: Date;
  limit?: number;
  offset?: number;
}

export async function listSessionEvents(
  options: ListEventsOptions,
): Promise<SessionEventRow[]> {
  const limit = Math.min(options.limit ?? 100, 500);
  const offset = options.offset ?? 0;

  const conditions = [eq(sessionEvents.sessionId, options.sessionId)];
  if (options.type) conditions.push(eq(sessionEvents.eventType, options.type));
  if (options.since) conditions.push(gt(sessionEvents.occurredAt, options.since));

  const rows = await db
    .select()
    .from(sessionEvents)
    .where(and(...conditions))
    .orderBy(asc(sessionEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  return rows as SessionEventRow[];
}

/** Filtra dm-only events si el caller no es GM. */
export function filterEventsByAccess(
  events: SessionEventRow[],
  access: SessionAccess,
): SessionEventRow[] {
  if (access === 'gm') return events;
  return events.filter((e) => e.visibility === 'public');
}

/**
 * Determina si el caller puede APPEND un event en la sesión, según rol y status.
 *
 * - GM: siempre (mientras no sea terminal).
 * - Participant: solo si la sesión está active o paused.
 * - Otros: no.
 *
 * Sesiones completed/cancelled: nadie puede appendar (events son historia,
 * y el cierre congela el log).
 */
export function canAppendEvent(args: {
  access: SessionAccess;
  status: SessionStatus;
  desiredVisibility: EventVisibility;
}): { ok: true } | { ok: false; reason: 'SESSION_TERMINAL' | 'FORBIDDEN_ROLE' | 'DM_ONLY_REQUIRES_GM' } {
  if (args.status === 'completed' || args.status === 'cancelled') {
    return { ok: false, reason: 'SESSION_TERMINAL' };
  }

  if (args.access === 'gm') {
    return { ok: true };
  }
  if (args.access === 'participant') {
    if (args.status !== 'active' && args.status !== 'paused') {
      return { ok: false, reason: 'FORBIDDEN_ROLE' };
    }
    if (args.desiredVisibility === 'dm-only') {
      return { ok: false, reason: 'DM_ONLY_REQUIRES_GM' };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'FORBIDDEN_ROLE' };
}

/**
 * Auto-log helper para mutaciones de character.
 *
 * Detecta si el character está en una sesión `active` (NOT paused — pause
 * significa "no estamos jugando ahora", así que los cambios no se loguean).
 * Si lo está, registra un event automáticamente. Si no, no-op.
 *
 * Best-effort: errores internos se silencian (logueamos via console pero
 * no propagamos). La mutación ya pasó — perder el event auto-generado es
 * preferible a fallar la response.
 *
 * Esta es la pieza clave del "automagic" — todos los endpoints de character
 * que mutan estado durante una sesión live llaman a este helper después de
 * que la mutación se persistió.
 */
export async function recordSessionEventForCharacter(args: {
  characterId: string;
  actorUserId: string;
  eventType: string;
  payload: Record<string, unknown>;
  visibility?: EventVisibility;
}): Promise<void> {
  try {
    const { findCharacterActiveSession } = await import('./load-session.js');
    const bound = await findCharacterActiveSession(args.characterId);
    if (!bound || bound.status !== 'active') return;
    await recordSessionEvent({
      sessionId: bound.sessionId,
      actorUserId: args.actorUserId,
      eventType: args.eventType,
      payload: args.payload,
      ...(args.visibility && { visibility: args.visibility }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[session-events] auto-log failed:', err);
  }
}

/**
 * Encuentra LA sesión active del GM en una campaña dada. Para auto-logging
 * de mutaciones del mundo (hex/POI status changes durante la partida).
 *
 * Reglas:
 *   - 0 sesiones active del GM en la campaña → null (no log).
 *   - 1 sesión active → esa es. (caso común)
 *   - N > 1 sesiones active → ambiguo. Si `preferredSessionId` viene y
 *     coincide con una de ellas, esa. Si no, null (mejor no loggear que
 *     loggear mal).
 *
 * Solo sesiones con status='active' cuentan — paused = "no estamos jugando".
 */
export async function findActiveSessionForGmInCampaign(args: {
  gmUserId: string;
  campaignId: string;
  preferredSessionId?: string;
}): Promise<string | null> {
  const { sessions } = await import('../../infra/db/schema.js');
  const { db } = await import('../../infra/db/client.js');
  const { and, eq } = await import('drizzle-orm');

  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.campaignId, args.campaignId),
        eq(sessions.gmUserId, args.gmUserId),
        eq(sessions.status, 'active'),
      ),
    );

  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!.id;
  if (args.preferredSessionId) {
    const match = rows.find((r) => r.id === args.preferredSessionId);
    if (match) return match.id;
  }
  return null; // ambiguo y sin preferencia → no loggear (silent)
}

/**
 * Auto-log para eventos del mundo (hex/POI). Detecta sesión active del GM
 * en la campaña, registra event si la encuentra. No-op silencioso si no
 * hay (caso "el DM está editando contenido fuera de una partida").
 *
 * Como `recordSessionEventForCharacter`, falla silenciosa via try/catch
 * para no romper la response del PATCH/POST que ya fue persistida.
 */
export async function recordSessionEventForWorld(args: {
  gmUserId: string;
  campaignId: string;
  /** Opcional: si el GM tiene >1 sesión active, este desambigua. */
  preferredSessionId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  visibility?: EventVisibility;
}): Promise<void> {
  try {
    const sessionId = await findActiveSessionForGmInCampaign({
      gmUserId: args.gmUserId,
      campaignId: args.campaignId,
      ...(args.preferredSessionId && { preferredSessionId: args.preferredSessionId }),
    });
    if (!sessionId) return;
    await recordSessionEvent({
      sessionId,
      actorUserId: args.gmUserId,
      eventType: args.eventType,
      payload: args.payload,
      ...(args.visibility && { visibility: args.visibility }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[session-events] world auto-log failed:', err);
  }
}

/**
 * Cuenta events de una sesión. Útil para frontend / debugging.
 */
export async function countSessionEvents(sessionId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId));
  return rows[0]?.count ?? 0;
}

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  campaignMembers,
  characters,
  sessionEvents,
  sessionParticipants,
  sessions,
  worldEvents,
} from '../../infra/db/schema.js';
import {
  addItemToInventory,
  type InventoryItem,
} from '@dungeon-hub/domain/character/inventory';
import { loadItemData, loadItemDataMany } from '../../use-cases/characters/load-item-data.js';
import {
  findCharacterActiveSession,
  getSessionAccess,
  listSessionParticipants,
  loadCharacterForSession,
  loadSession,
  sanitizeSessionForRole,
  type SessionStatus,
} from '../../use-cases/sessions/load-session.js';
import { applyTransition, type StateAction } from '../../use-cases/sessions/state-machine.js';
import {
  canAppendEvent,
  filterEventsByAccess,
  listSessionEvents,
  recordSessionEvent,
} from '../../use-cases/sessions/events.js';

const ParamsWithId = z.object({ id: z.string().uuid() });

const CreateSessionBody = z.object({
  campaignId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  dmNotes: z.string().max(20000).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  levelMin: z.number().int().min(1).max(20).nullable().optional(),
  levelMax: z.number().int().min(1).max(20).nullable().optional(),
  maxPlayers: z.number().int().min(1).max(20).nullable().optional(),
  locationHexId: z.string().min(1).max(120).nullable().optional(),
});

const UpdateSessionBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    levelMin: z.number().int().min(1).max(20).nullable().optional(),
    levelMax: z.number().int().min(1).max(20).nullable().optional(),
    maxPlayers: z.number().int().min(1).max(20).nullable().optional(),
    locationHexId: z.string().min(1).max(120).nullable().optional(),
    summary: z.string().max(20000).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

const JoinLeaveBody = z.object({
  characterId: z.string().uuid(),
});

const AppendEventBody = z.object({
  eventType: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()).optional(),
  visibility: z.enum(['public', 'dm-only']).optional(),
  occurredAt: z.string().datetime().optional(),
});

const ListEventsQuery = z.object({
  type: z.string().min(1).max(60).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const CompleteSessionBody = z.object({
  summary: z.string().max(20000).optional(),
  rewards: z
    .object({
      xpPerPlayer: z.number().int().min(0).optional(),
      goldPerPlayer: z.number().int().min(0).optional(),
      items: z
        .array(
          z.object({
            characterId: z.string().uuid(),
            slug: z.string().min(1),
            source: z.string().min(1),
            quantity: z.number().int().min(1).max(999).optional(),
          }),
        )
        .max(100)
        .optional(),
    })
    .optional(),
  /**
   * Cambios persistentes del mundo gatillados por esta sesión. Cada entry
   * crea un world_event con sourceSessionId = esta sesión.
   */
  worldChanges: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(20000).nullable().optional(),
        dmNotes: z.string().max(20000).nullable().optional(),
        visibility: z.enum(['public', 'dm-only']).optional(),
        tags: z.array(z.string().min(1).max(40)).max(20).optional(),
      }),
    )
    .max(50)
    .optional(),
});

const ListQuery = z.object({
  campaignId: z.string().uuid(),
  status: z.enum(['scheduled', 'active', 'paused', 'completed', 'cancelled']).optional(),
});

export const sessionsRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /sessions ------------------------------------------------------
  // Solo un GM de la campaña (campaign_members.role='gm') puede crear sesiones.
  app.post('/sessions', { preHandler: app.authenticate }, async (request, reply) => {
    const body = CreateSessionBody.parse(request.body);
    const userId = request.user!.sub;

    const member = await db
      .select({ role: campaignMembers.role })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, body.campaignId),
          eq(campaignMembers.userId, userId),
        ),
      )
      .limit(1);
    if (member.length === 0) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'No sos miembro de la campaña' });
    }
    if (member[0]!.role !== 'gm') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo un GM puede crear sesiones' });
    }

    if (
      body.levelMin != null &&
      body.levelMax != null &&
      body.levelMin > body.levelMax
    ) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'LEVEL_RANGE_INVALID', min: body.levelMin, max: body.levelMax }],
      });
    }

    const [created] = await db
      .insert(sessions)
      .values({
        campaignId: body.campaignId,
        gmUserId: userId,
        title: body.title,
        description: body.description ?? null,
        dmNotes: body.dmNotes ?? null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        levelMin: body.levelMin ?? null,
        levelMax: body.levelMax ?? null,
        maxPlayers: body.maxPlayers ?? null,
        locationHexId: body.locationHexId ?? null,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ---- GET /sessions?campaignId=... ---------------------------------------
  // Lista sesiones de UNA campaña. El user tiene que ser miembro.
  app.get('/sessions', { preHandler: app.authenticate }, async (request, reply) => {
    const query = ListQuery.parse(request.query);
    const userId = request.user!.sub;

    const member = await db
      .select({ role: campaignMembers.role })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, query.campaignId),
          eq(campaignMembers.userId, userId),
        ),
      )
      .limit(1);
    if (member.length === 0) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'No sos miembro de la campaña' });
    }
    const role = member[0]!.role;

    const conditions = [eq(sessions.campaignId, query.campaignId)];
    if (query.status) conditions.push(eq(sessions.status, query.status));

    const rows = await db
      .select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(asc(sessions.scheduledAt));

    // Visibility: solo el GM de cada sesión ve dmNotes. El campaign GM también
    // ve dmNotes de TODAS las sesiones de su campaña (admin del mundo).
    const cleaned = rows.map((s) => {
      if (s.gmUserId === userId || role === 'gm') return s;
      const { dmNotes: _omit, ...rest } = s;
      return rest;
    });

    return { data: cleaned };
  });

  // ---- GET /sessions/:id ---------------------------------------------------
  app.get('/sessions/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getSessionAccess(session, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    const participants = await listSessionParticipants(id);
    return { ...sanitizeSessionForRole(session, access), participants };
  });

  // ---- PATCH /sessions/:id -------------------------------------------------
  // Solo el GM de la sesión puede editar metadata.
  app.patch('/sessions/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = UpdateSessionBody.parse(request.body);
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (session.gmUserId !== userId) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el GM puede editar' });
    }

    // Editar una sesión completed o cancelled queda permitido solo para summary y dmNotes.
    if (session.status === 'completed' || session.status === 'cancelled') {
      const allowed = ['summary', 'dmNotes'] as const;
      const tries = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined);
      const forbidden = tries.filter((k) => !allowed.includes(k as (typeof allowed)[number]));
      if (forbidden.length > 0) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [
            {
              code: 'SESSION_TERMINAL',
              status: session.status,
              forbiddenFields: forbidden,
            },
          ],
        });
      }
    }

    const updates: Partial<typeof sessions.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.dmNotes !== undefined) updates.dmNotes = body.dmNotes;
    if (body.scheduledAt !== undefined) {
      updates.scheduledAt = body.scheduledAt === null ? null : new Date(body.scheduledAt);
    }
    if (body.levelMin !== undefined) updates.levelMin = body.levelMin;
    if (body.levelMax !== undefined) updates.levelMax = body.levelMax;
    if (body.maxPlayers !== undefined) updates.maxPlayers = body.maxPlayers;
    if (body.locationHexId !== undefined) updates.locationHexId = body.locationHexId;
    if (body.summary !== undefined) updates.summary = body.summary;

    const [updated] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .returning();

    return updated;
  });

  // ---- POST /sessions/:id/{start,pause,resume,cancel} ----------------------
  // Solo el GM ejecuta transiciones. Complete vive en slice futuro (rewards).
  async function handleTransition(
    request: Parameters<Parameters<typeof app.post>[2]>[0],
    reply: Parameters<Parameters<typeof app.post>[2]>[1],
    action: StateAction,
  ) {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (session.gmUserId !== userId) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el GM ejecuta transiciones' });
    }

    const result = applyTransition(session.status, action);
    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: [result.issue] });
    }

    const now = new Date();
    const updates: Partial<typeof sessions.$inferInsert> = {
      status: result.next,
      updatedAt: now,
    };
    if (action === 'start' && session.startedAt == null) {
      updates.startedAt = now;
    }
    if (action === 'cancel') {
      updates.endedAt = now;
    }

    const [updated] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .returning();

    return updated;
  }

  app.post('/sessions/:id/start', { preHandler: app.authenticate }, (req, rep) =>
    handleTransition(req, rep, 'start'),
  );
  app.post('/sessions/:id/pause', { preHandler: app.authenticate }, (req, rep) =>
    handleTransition(req, rep, 'pause'),
  );
  app.post('/sessions/:id/resume', { preHandler: app.authenticate }, (req, rep) =>
    handleTransition(req, rep, 'resume'),
  );
  app.post('/sessions/:id/cancel', { preHandler: app.authenticate }, (req, rep) =>
    handleTransition(req, rep, 'cancel'),
  );

  // ---- POST /sessions/:id/join --------------------------------------------
  // Un user joinea su character a la sesión. Hard rule: el char no puede estar
  // en otra sesión live (active/paused). No se puede joinear a sesiones
  // completed/cancelled.
  app.post('/sessions/:id/join', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = JoinLeaveBody.parse(request.body);
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (session.status === 'completed' || session.status === 'cancelled') {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SESSION_TERMINAL', status: session.status }],
      });
    }

    const character = await loadCharacterForSession(body.characterId, userId, session.campaignId);
    if (!character) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [
          {
            code: 'CHARACTER_NOT_ELIGIBLE',
            characterId: body.characterId,
            reason:
              'El character no existe, no te pertenece, o no es de esta campaña',
          },
        ],
      });
    }

    // Char ya en esta sesión y no la dejó → idempotente: devolvemos OK.
    const existing = await db
      .select({ leftAt: sessionParticipants.leftAt })
      .from(sessionParticipants)
      .where(
        and(
          eq(sessionParticipants.sessionId, id),
          eq(sessionParticipants.characterId, body.characterId),
        ),
      )
      .limit(1);
    if (existing.length > 0 && existing[0]!.leftAt == null) {
      const participants = await listSessionParticipants(id);
      return { session, participants };
    }

    // Hard rule: el char no puede estar en otra sesión live.
    const overlap = await findCharacterActiveSession(body.characterId, id);
    if (overlap) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [
          {
            code: 'CHARACTER_ALREADY_IN_LIVE_SESSION',
            characterId: body.characterId,
            otherSessionId: overlap.sessionId,
          },
        ],
      });
    }

    // Max players: contar participantes activos (left_at IS NULL).
    if (session.maxPlayers != null) {
      const current = await listSessionParticipants(id);
      const active = current.filter((p) => p.leftAt == null).length;
      if (active >= session.maxPlayers) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [
            { code: 'SESSION_FULL', maxPlayers: session.maxPlayers, current: active },
          ],
        });
      }
    }

    // Si el char ya tiene una fila con left_at != null, le hacemos "rejoin"
    // limpiando left_at y actualizando joined_at.
    if (existing.length > 0) {
      await db
        .update(sessionParticipants)
        .set({ leftAt: null, joinedAt: new Date() })
        .where(
          and(
            eq(sessionParticipants.sessionId, id),
            eq(sessionParticipants.characterId, body.characterId),
          ),
        );
    } else {
      await db.insert(sessionParticipants).values({
        sessionId: id,
        characterId: body.characterId,
        userId,
      });
    }

    const participants = await listSessionParticipants(id);
    return { session, participants };
  });

  // ---- POST /sessions/:id/leave -------------------------------------------
  // Setea left_at en el participant (no borra la fila — mantiene historial).
  app.post('/sessions/:id/leave', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = JoinLeaveBody.parse(request.body);
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });

    const existing = await db
      .select({ leftAt: sessionParticipants.leftAt, userId: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(
        and(
          eq(sessionParticipants.sessionId, id),
          eq(sessionParticipants.characterId, body.characterId),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      return reply.code(404).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'PARTICIPANT_NOT_FOUND', characterId: body.characterId }],
      });
    }
    if (existing[0]!.userId !== userId && session.gmUserId !== userId) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Solo el dueño del char o el GM pueden hacer leave',
      });
    }
    if (existing[0]!.leftAt != null) {
      // Idempotente.
      const participants = await listSessionParticipants(id);
      return { session, participants };
    }

    await db
      .update(sessionParticipants)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(sessionParticipants.sessionId, id),
          eq(sessionParticipants.characterId, body.characterId),
        ),
      );

    const participants = await listSessionParticipants(id);
    return { session, participants };
  });

  // ---- POST /sessions/:id/events ------------------------------------------
  // Append-only log. GM puede appendar siempre (mientras la sesión no sea
  // terminal). Participants solo cuando la sesión está active/paused, y
  // solo eventos 'public' (no pueden crear dm-only).
  app.post('/sessions/:id/events', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = AppendEventBody.parse(request.body);
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getSessionAccess(session, userId);
    if (access === 'none' || access === 'campaign-member') {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Solo GM o participants pueden registrar events',
      });
    }

    const visibility = body.visibility ?? 'public';
    const gate = canAppendEvent({
      access,
      status: session.status as SessionStatus,
      desiredVisibility: visibility,
    });
    if (!gate.ok) {
      const status = gate.reason === 'SESSION_TERMINAL' ? 400 : 403;
      return reply.code(status).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: gate.reason, sessionStatus: session.status }],
      });
    }

    const event = await recordSessionEvent({
      sessionId: id,
      actorUserId: userId,
      eventType: body.eventType,
      payload: body.payload,
      visibility,
      ...(body.occurredAt && { occurredAt: new Date(body.occurredAt) }),
    });

    return reply.code(201).send(event);
  });

  // ---- GET /sessions/:id/events -------------------------------------------
  // Lista events en orden cronológico ascendente. Filtra dm-only si el
  // caller no es GM.
  app.get('/sessions/:id/events', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const query = ListEventsQuery.parse(request.query);
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getSessionAccess(session, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    const events = await listSessionEvents({
      sessionId: id,
      ...(query.type && { type: query.type }),
      ...(query.since && { since: new Date(query.since) }),
      ...(query.limit && { limit: query.limit }),
      ...(query.offset && { offset: query.offset }),
    });

    const filtered = filterEventsByAccess(events, access);
    return { data: filtered };
  });

  // ---- POST /sessions/:id/complete ---------------------------------------
  // Cierra la sesión y distribuye rewards. Solo el GM.
  //
  // Body:
  //   summary?: string  — si se omite, se genera uno simple por counts de events.
  //   rewards?: {
  //     xpPerPlayer?: number       (cada participant activo recibe esa XP)
  //     goldPerPlayer?: number     (cada participant activo recibe ese gold en gp)
  //     items?: [{ characterId, slug, source, quantity? }]  (items específicos a chars)
  //   }
  //
  // Para cada XP/gold/item distribuido se genera un session_event automático
  // (xp_award, gold_grant, item_grant) con actorUserId = GM. Esto se hace
  // ANTES de cambiar el status — todo dentro de una transacción.
  //
  // Solo sesiones active o paused pueden completarse.
  app.post('/sessions/:id/complete', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = CompleteSessionBody.parse(request.body ?? {});
    const userId = request.user!.sub;

    const session = await loadSession(id);
    if (!session) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (session.gmUserId !== userId) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el GM puede completar' });
    }

    const transition = applyTransition(session.status as SessionStatus, 'complete');
    if (!transition.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: [transition.issue] });
    }

    // Participants activos (left_at IS NULL).
    const participantsAll = await listSessionParticipants(id);
    const activeParticipants = participantsAll.filter((p) => p.leftAt == null);

    const rewards = body.rewards ?? {};
    const xpPerPlayer = rewards.xpPerPlayer ?? 0;
    const goldPerPlayer = rewards.goldPerPlayer ?? 0;
    const itemRewards = rewards.items ?? [];

    // Validar que todos los items referencian chars que son participants activos.
    const activeCharIds = new Set(activeParticipants.map((p) => p.characterId));
    const invalidItem = itemRewards.find((it) => !activeCharIds.has(it.characterId));
    if (invalidItem) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [
          {
            code: 'ITEM_REWARD_INVALID_RECIPIENT',
            characterId: invalidItem.characterId,
            reason: 'No es participant activo de esta sesión',
          },
        ],
      });
    }

    // Pre-cargar todos los itemData de rewards.items (más el inventario actual
    // de cada char para que addItemToInventory tenga `weights`).
    const itemRefs = itemRewards.map((it) => ({ slug: it.slug, source: it.source }));
    const itemLites = await loadItemDataMany(itemRefs);
    const itemLiteByKey = new Map(itemLites.map((l) => [`${l.slug}|${l.source}`, l]));
    const missingItem = itemRewards.find(
      (it) => !itemLiteByKey.has(`${it.slug}|${it.source}`),
    );
    if (missingItem) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [
          {
            code: 'ITEM_NOT_FOUND',
            item: { slug: missingItem.slug, source: missingItem.source },
          },
        ],
      });
    }

    // Loop por participants: aplicar XP + gold + items. Distribución es atómica
    // por character (un solo db.update por char con el siguiente estado).
    await db.transaction(async (tx) => {
      const now = new Date();
      const eventInserts: Array<typeof sessionEvents.$inferInsert> = [];

      for (const p of activeParticipants) {
        const charRows = await tx
          .select()
          .from(characters)
          .where(eq(characters.id, p.characterId))
          .limit(1);
        const char = charRows[0];
        if (!char) continue; // borrado mientras tanto, skip

        const charData = (char.data as Record<string, unknown> | null) ?? {};
        const currency = (charData['currency'] as Record<string, number> | undefined) ?? {
          cp: 0, sp: 0, ep: 0, gp: 0, pp: 0,
        };

        const nextXp = char.xp + xpPerPlayer;
        const nextCurrency = { ...currency, gp: (currency.gp ?? 0) + goldPerPlayer };

        // Items de este char.
        const myItems = itemRewards.filter((it) => it.characterId === p.characterId);
        let nextInventory = (char.inventory as InventoryItem[] | null) ?? [];
        const grantedInstanceIds: Array<{
          itemSlug: string;
          itemSource: string;
          quantity: number;
          instanceId: string;
        }> = [];

        if (myItems.length > 0) {
          // Cargar weights del inventario actual del char + items reward para
          // que addItemToInventory tenga el lookup completo.
          const allRefs = [
            ...nextInventory.map((it) => ({ slug: it.itemSlug, source: it.itemSource })),
            ...myItems.map((it) => ({ slug: it.slug, source: it.source })),
          ];
          const allLites = await loadItemDataMany(allRefs);

          for (const item of myItems) {
            const lite = itemLiteByKey.get(`${item.slug}|${item.source}`)!;
            const quantity = item.quantity ?? 1;
            const result = addItemToInventory({
              inventory: nextInventory,
              itemData: lite,
              input: { quantity, state: 'carried', attuned: false },
              weights: allLites,
              // Minimal ctx — rewards no se equipan automáticamente, no nos
              // interesan warnings de proficiency/encumbrance acá.
              ctx: { strScore: 10, armorProficiencies: [], weaponProficiencies: [] },
            });
            if (!result.ok) {
              throw new Error(
                `Reward item add failed for char ${p.characterId}: ${JSON.stringify(result.issues)}`,
              );
            }
            nextInventory = result.inventory;
            grantedInstanceIds.push({
              itemSlug: lite.slug,
              itemSource: lite.source,
              quantity,
              instanceId: result.addedInstanceId!,
            });
          }
        }

        // Persist char con todos los cambios juntos.
        await tx
          .update(characters)
          .set({
            xp: nextXp,
            data: { ...charData, currency: nextCurrency },
            inventory: nextInventory,
            updatedAt: now,
          })
          .where(eq(characters.id, p.characterId));

        // Eventos de rewards. Visibility 'public' — todos los participants ven.
        if (xpPerPlayer > 0) {
          eventInserts.push({
            sessionId: id,
            occurredAt: now,
            actorUserId: userId,
            eventType: 'xp_award',
            payload: { characterId: p.characterId, before: char.xp, award: xpPerPlayer, after: nextXp },
            visibility: 'public',
          });
        }
        if (goldPerPlayer > 0) {
          eventInserts.push({
            sessionId: id,
            occurredAt: now,
            actorUserId: userId,
            eventType: 'gold_grant',
            payload: {
              characterId: p.characterId,
              amount: goldPerPlayer,
              before: currency.gp ?? 0,
              after: nextCurrency.gp,
            },
            visibility: 'public',
          });
        }
        for (const g of grantedInstanceIds) {
          eventInserts.push({
            sessionId: id,
            occurredAt: now,
            actorUserId: userId,
            eventType: 'item_grant',
            payload: { characterId: p.characterId, ...g },
            visibility: 'public',
          });
        }
      }

      if (eventInserts.length > 0) {
        await tx.insert(sessionEvents).values(eventInserts);
      }

      // World events: auto-crear desde body.worldChanges, con sourceSessionId
      // apuntando a esta sesión. Esto es la "historia oficial" del mundo
      // (distinto de session_events, que son ruido fino in-game).
      if (body.worldChanges && body.worldChanges.length > 0) {
        await tx.insert(worldEvents).values(
          body.worldChanges.map((wc) => ({
            campaignId: session.campaignId,
            title: wc.title,
            description: wc.description ?? null,
            dmNotes: wc.dmNotes ?? null,
            occurredAt: now,
            sourceSessionId: id,
            ...(wc.visibility && { visibility: wc.visibility }),
            ...(wc.tags && { tags: wc.tags }),
          })),
        );
      }

      // Auto-summary si no vino en el body.
      let finalSummary = body.summary ?? null;
      if (finalSummary == null) {
        const allEvents = await tx
          .select({ eventType: sessionEvents.eventType })
          .from(sessionEvents)
          .where(eq(sessionEvents.sessionId, id));
        const counts: Record<string, number> = {};
        for (const e of allEvents) counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
        const parts = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => `${count}× ${type}`);
        finalSummary =
          parts.length > 0
            ? `Sesión completada. Eventos: ${parts.join(', ')}.`
            : 'Sesión completada sin events registrados.';
      }

      await tx
        .update(sessions)
        .set({
          status: 'completed',
          endedAt: now,
          summary: finalSummary,
          rewards: {
            xpPerPlayer: xpPerPlayer || null,
            goldPerPlayer: goldPerPlayer || null,
            items: itemRewards,
          },
          updatedAt: now,
        })
        .where(eq(sessions.id, id));
    });

    const updated = await loadSession(id);
    return updated;
  });
};

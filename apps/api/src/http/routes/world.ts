import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { factions, npcs, worldEvents } from '../../infra/db/schema.js';
import { getMapAccess, loadHex } from '../../use-cases/map/load-hex.js';
import {
  listFactionsInCampaign,
  loadFaction,
  sanitizeFactionForRole,
} from '../../use-cases/world/load-faction.js';
import {
  listNpcsInCampaign,
  loadNpc,
  sanitizeNpcForRole,
} from '../../use-cases/world/load-npc.js';
import {
  filterWorldEventsByAccess,
  listWorldEvents,
  loadWorldEvent,
  sanitizeWorldEventForRole,
} from '../../use-cases/world/load-world-event.js';

const CampaignParam = z.object({ campaignId: z.string().uuid() });
const FactionParam = z.object({ factionId: z.string().uuid() });
const NpcParam = z.object({ npcId: z.string().uuid() });
const WorldEventParam = z.object({ eventId: z.string().uuid() });

const CreateWorldEventBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20000).nullable().optional(),
  dmNotes: z.string().max(20000).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  sourceSessionId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['public', 'dm-only']).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

const UpdateWorldEventBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(20000).nullable().optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
    occurredAt: z.string().datetime().optional(),
    sourceSessionId: z.string().uuid().nullable().optional(),
    visibility: z.enum(['public', 'dm-only']).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

const ListWorldEventsQuery = z.object({
  tag: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const FACTION_STATES = ['active', 'dormant', 'destroyed', 'disbanded'] as const;
const NPC_STATUSES = ['alive', 'dead', 'missing', 'unknown'] as const;

const CreateFactionBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(20000).nullable().optional(),
  dmNotes: z.string().max(20000).nullable().optional(),
  state: z.enum(FACTION_STATES).optional(),
  reputation: z.number().int().optional(),
});

const UpdateFactionBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(20000).nullable().optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
    state: z.enum(FACTION_STATES).optional(),
    reputation: z.number().int().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

const CreateNpcBody = z.object({
  name: z.string().min(1).max(200),
  race: z.string().min(1).max(60).nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  dmNotes: z.string().max(20000).nullable().optional(),
  factionId: z.string().uuid().nullable().optional(),
  hexId: z.string().uuid().nullable().optional(),
  status: z.enum(NPC_STATUSES).optional(),
  worldX: z.number().nullable().optional(),
  worldY: z.number().nullable().optional(),
});

const UpdateNpcBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    race: z.string().min(1).max(60).nullable().optional(),
    description: z.string().max(20000).nullable().optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
    factionId: z.string().uuid().nullable().optional(),
    hexId: z.string().uuid().nullable().optional(),
    status: z.enum(NPC_STATUSES).optional(),
    worldX: z.number().nullable().optional(),
    worldY: z.number().nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

export const worldRoute: FastifyPluginAsync = async (app) => {
  // =========================================================================
  // FACTIONS
  // =========================================================================

  // POST /campaigns/:campaignId/factions
  app.post(
    '/campaigns/:campaignId/factions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const body = CreateFactionBody.parse(request.body);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (access !== 'gm') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Solo un GM puede crear factions' });
      }

      const [created] = await db
        .insert(factions)
        .values({
          campaignId,
          name: body.name,
          description: body.description ?? null,
          dmNotes: body.dmNotes ?? null,
          ...(body.state && { state: body.state }),
          ...(body.reputation !== undefined && { reputation: body.reputation }),
        })
        .returning();

      return reply.code(201).send(created);
    },
  );

  // GET /campaigns/:campaignId/factions
  app.get(
    '/campaigns/:campaignId/factions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      const list = await listFactionsInCampaign(campaignId);
      return { data: list.map((f) => sanitizeFactionForRole(f, access)) };
    },
  );

  // GET /factions/:factionId
  app.get('/factions/:factionId', { preHandler: app.authenticate }, async (request, reply) => {
    const { factionId } = FactionParam.parse(request.params);
    const userId = request.user!.sub;

    const faction = await loadFaction(factionId);
    if (!faction) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(faction.campaignId, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    return sanitizeFactionForRole(faction, access);
  });

  // PATCH /factions/:factionId
  app.patch(
    '/factions/:factionId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { factionId } = FactionParam.parse(request.params);
      const body = UpdateFactionBody.parse(request.body);
      const userId = request.user!.sub;

      const faction = await loadFaction(factionId);
      if (!faction) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(faction.campaignId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const updates: Partial<typeof factions.$inferInsert> = { updatedAt: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.dmNotes !== undefined) updates.dmNotes = body.dmNotes;
      if (body.state !== undefined) updates.state = body.state;
      if (body.reputation !== undefined) updates.reputation = body.reputation;

      const [updated] = await db
        .update(factions)
        .set(updates)
        .where(eq(factions.id, factionId))
        .returning();
      return updated;
    },
  );

  // DELETE /factions/:factionId
  app.delete(
    '/factions/:factionId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { factionId } = FactionParam.parse(request.params);
      const userId = request.user!.sub;

      const faction = await loadFaction(factionId);
      if (!faction) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(faction.campaignId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      await db.delete(factions).where(eq(factions.id, factionId));
      return reply.code(204).send();
    },
  );

  // =========================================================================
  // NPCs
  // =========================================================================

  // POST /campaigns/:campaignId/npcs
  app.post(
    '/campaigns/:campaignId/npcs',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const body = CreateNpcBody.parse(request.body);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (access !== 'gm') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo un GM puede crear NPCs' });
      }

      // Validar factionId si se pasa.
      if (body.factionId) {
        const f = await loadFaction(body.factionId);
        if (!f || f.campaignId !== campaignId) {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'FACTION_NOT_FOUND', factionId: body.factionId }],
          });
        }
      }
      if (body.hexId) {
        const h = await loadHex(body.hexId);
        if (!h || h.campaignId !== campaignId) {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'HEX_NOT_FOUND', hexId: body.hexId }],
          });
        }
      }

      const [created] = await db
        .insert(npcs)
        .values({
          campaignId,
          name: body.name,
          race: body.race ?? null,
          description: body.description ?? null,
          dmNotes: body.dmNotes ?? null,
          factionId: body.factionId ?? null,
          hexId: body.hexId ?? null,
          ...(body.status && { status: body.status }),
          worldX: body.worldX ?? null,
          worldY: body.worldY ?? null,
        })
        .returning();
      return reply.code(201).send(created);
    },
  );

  // GET /campaigns/:campaignId/npcs
  app.get(
    '/campaigns/:campaignId/npcs',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      const list = await listNpcsInCampaign(campaignId);
      return { data: list.map((n) => sanitizeNpcForRole(n, access)) };
    },
  );

  // GET /npcs/:npcId
  app.get('/npcs/:npcId', { preHandler: app.authenticate }, async (request, reply) => {
    const { npcId } = NpcParam.parse(request.params);
    const userId = request.user!.sub;

    const npc = await loadNpc(npcId);
    if (!npc) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(npc.campaignId, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    return sanitizeNpcForRole(npc, access);
  });

  // PATCH /npcs/:npcId
  app.patch('/npcs/:npcId', { preHandler: app.authenticate }, async (request, reply) => {
    const { npcId } = NpcParam.parse(request.params);
    const body = UpdateNpcBody.parse(request.body);
    const userId = request.user!.sub;

    const npc = await loadNpc(npcId);
    if (!npc) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(npc.campaignId, userId);
    if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    // Validar nuevos FKs si se pasan.
    if (body.factionId !== undefined && body.factionId !== null) {
      const f = await loadFaction(body.factionId);
      if (!f || f.campaignId !== npc.campaignId) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'FACTION_NOT_FOUND', factionId: body.factionId }],
        });
      }
    }
    if (body.hexId !== undefined && body.hexId !== null) {
      const h = await loadHex(body.hexId);
      if (!h || h.campaignId !== npc.campaignId) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'HEX_NOT_FOUND', hexId: body.hexId }],
        });
      }
    }

    const updates: Partial<typeof npcs.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.race !== undefined) updates.race = body.race;
    if (body.description !== undefined) updates.description = body.description;
    if (body.dmNotes !== undefined) updates.dmNotes = body.dmNotes;
    if (body.factionId !== undefined) updates.factionId = body.factionId;
    if (body.hexId !== undefined) updates.hexId = body.hexId;
    if (body.status !== undefined) updates.status = body.status;
    if (body.worldX !== undefined) updates.worldX = body.worldX;
    if (body.worldY !== undefined) updates.worldY = body.worldY;

    const [updated] = await db.update(npcs).set(updates).where(eq(npcs.id, npcId)).returning();
    return updated;
  });

  // DELETE /npcs/:npcId
  app.delete('/npcs/:npcId', { preHandler: app.authenticate }, async (request, reply) => {
    const { npcId } = NpcParam.parse(request.params);
    const userId = request.user!.sub;

    const npc = await loadNpc(npcId);
    if (!npc) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(npc.campaignId, userId);
    if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    await db.delete(npcs).where(eq(npcs.id, npcId));
    return reply.code(204).send();
  });

  // =========================================================================
  // WORLD EVENTS — timeline persistente del mundo (vs session_events que son
  // per-sesión y efímeros).
  // =========================================================================

  // POST /campaigns/:campaignId/world-events
  app.post(
    '/campaigns/:campaignId/world-events',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const body = CreateWorldEventBody.parse(request.body);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (access !== 'gm') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Solo un GM puede crear world events' });
      }

      const [created] = await db
        .insert(worldEvents)
        .values({
          campaignId,
          title: body.title,
          description: body.description ?? null,
          dmNotes: body.dmNotes ?? null,
          ...(body.occurredAt && { occurredAt: new Date(body.occurredAt) }),
          sourceSessionId: body.sourceSessionId ?? null,
          ...(body.visibility && { visibility: body.visibility }),
          ...(body.tags && { tags: body.tags }),
        })
        .returning();

      return reply.code(201).send(created);
    },
  );

  // GET /campaigns/:campaignId/world-events
  app.get(
    '/campaigns/:campaignId/world-events',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const query = ListWorldEventsQuery.parse(request.query);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      const list = await listWorldEvents({
        campaignId,
        ...(query.tag && { tag: query.tag }),
        ...(query.limit && { limit: query.limit }),
        ...(query.offset && { offset: query.offset }),
      });

      return { data: filterWorldEventsByAccess(list, access) };
    },
  );

  // GET /world-events/:eventId
  app.get(
    '/world-events/:eventId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { eventId } = WorldEventParam.parse(request.params);
      const userId = request.user!.sub;

      const event = await loadWorldEvent(eventId);
      if (!event) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(event.campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      if (access !== 'gm' && event.visibility === 'dm-only') {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }

      return sanitizeWorldEventForRole(event, access);
    },
  );

  // PATCH /world-events/:eventId
  app.patch(
    '/world-events/:eventId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { eventId } = WorldEventParam.parse(request.params);
      const body = UpdateWorldEventBody.parse(request.body);
      const userId = request.user!.sub;

      const event = await loadWorldEvent(eventId);
      if (!event) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(event.campaignId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const updates: Partial<typeof worldEvents.$inferInsert> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.dmNotes !== undefined) updates.dmNotes = body.dmNotes;
      if (body.occurredAt !== undefined) updates.occurredAt = new Date(body.occurredAt);
      if (body.sourceSessionId !== undefined) updates.sourceSessionId = body.sourceSessionId;
      if (body.visibility !== undefined) updates.visibility = body.visibility;
      if (body.tags !== undefined) updates.tags = body.tags;

      const [updated] = await db
        .update(worldEvents)
        .set(updates)
        .where(eq(worldEvents.id, eventId))
        .returning();
      return updated;
    },
  );

  // DELETE /world-events/:eventId
  app.delete(
    '/world-events/:eventId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { eventId } = WorldEventParam.parse(request.params);
      const userId = request.user!.sub;

      const event = await loadWorldEvent(eventId);
      if (!event) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(event.campaignId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      await db.delete(worldEvents).where(eq(worldEvents.id, eventId));
      return reply.code(204).send();
    },
  );
};

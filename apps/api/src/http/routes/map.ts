import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { hexes, pois } from '../../infra/db/schema.js';
import {
  getMapAccess,
  isHexVisibleToPlayer,
  listHexesInCampaign,
  loadHex,
  sanitizeHexForRole,
  wouldCreateCycle,
  type LoadedHex,
} from '../../use-cases/map/load-hex.js';
import {
  filterPoisByAccess,
  listPoisForHex,
  loadPoi,
  sanitizePoiForRole,
} from '../../use-cases/map/load-poi.js';
import { recordSessionEventForWorld } from '../../use-cases/sessions/events.js';

type HexStatus = 'unexplored' | 'rumored' | 'explored' | 'cleared';
type PoiStatus = 'unknown' | 'discovered' | 'cleared';

/**
 * Mapea una transición de hex status a un event type semántico.
 * Forward transitions canónicas tienen nombres específicos para que el
 * frontend pueda renderizar iconos diferenciados.
 */
function hexTransitionEvent(from: HexStatus, to: HexStatus): string | null {
  if (from === to) return null;
  if (from === 'unexplored' && (to === 'rumored' || to === 'explored' || to === 'cleared')) {
    return 'hex_revealed';
  }
  if (from === 'rumored' && (to === 'explored' || to === 'cleared')) {
    return 'hex_explored';
  }
  if (from === 'explored' && to === 'cleared') return 'hex_cleared';
  return 'hex_status_changed';
}

function poiTransitionEvent(from: PoiStatus, to: PoiStatus): string | null {
  if (from === to) return null;
  if (from === 'unknown' && (to === 'discovered' || to === 'cleared')) {
    return 'poi_discovered';
  }
  if (from === 'discovered' && to === 'cleared') return 'poi_cleared';
  return 'poi_status_changed';
}

const SessionQuery = z.object({ sessionId: z.string().uuid().optional() });

const CampaignParam = z.object({ campaignId: z.string().uuid() });
const HexParam = z.object({ hexId: z.string().uuid() });

const HEX_STATUSES = ['unexplored', 'rumored', 'explored', 'cleared'] as const;

const CreateHexBody = z.object({
  parentHexId: z.string().uuid().nullable().optional(),
  scale: z.string().min(1).max(40).nullable().optional(),
  q: z.number().int(),
  r: z.number().int(),
  worldX: z.number().nullable().optional(),
  worldY: z.number().nullable().optional(),
  name: z.string().min(1).max(200).nullable().optional(),
  terrain: z.string().min(1).max(60).nullable().optional(),
  status: z.enum(HEX_STATUSES).optional(),
  dmNotes: z.string().max(20000).nullable().optional(),
  playerNotes: z.string().max(20000).nullable().optional(),
});

const UpdateHexBody = z
  .object({
    parentHexId: z.string().uuid().nullable().optional(),
    scale: z.string().min(1).max(40).nullable().optional(),
    q: z.number().int().optional(),
    r: z.number().int().optional(),
    worldX: z.number().nullable().optional(),
    worldY: z.number().nullable().optional(),
    name: z.string().min(1).max(200).nullable().optional(),
    terrain: z.string().min(1).max(60).nullable().optional(),
    status: z.enum(HEX_STATUSES).optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
    playerNotes: z.string().max(20000).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

const ListHexesQuery = z.object({
  /** 'top' = solo top-level (parentHexId IS NULL). 'all' = todos.
   *  uuid = solo hijos de ese hex. */
  parent: z.union([z.literal('top'), z.literal('all'), z.string().uuid()]).optional(),
});

const POI_STATUSES = ['unknown', 'discovered', 'cleared'] as const;
const PoiParam = z.object({ poiId: z.string().uuid() });

const CreatePoiBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(20000).nullable().optional(),
  dmNotes: z.string().max(20000).nullable().optional(),
  status: z.enum(POI_STATUSES).optional(),
  worldX: z.number().nullable().optional(),
  worldY: z.number().nullable().optional(),
});

const UpdatePoiBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(20000).nullable().optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
    status: z.enum(POI_STATUSES).optional(),
    worldX: z.number().nullable().optional(),
    worldY: z.number().nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

export const mapRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /campaigns/:campaignId/hexes ----------------------------------
  // Crea un hex. Solo GM de la campaña.
  app.post(
    '/campaigns/:campaignId/hexes',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const body = CreateHexBody.parse(request.body);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (access !== 'gm') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Solo un GM puede crear hexes' });
      }

      // Si especifica parentHexId, debe existir Y ser de la misma campaña.
      if (body.parentHexId) {
        const parent = await loadHex(body.parentHexId);
        if (!parent || parent.campaignId !== campaignId) {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'PARENT_NOT_FOUND', parentHexId: body.parentHexId }],
          });
        }
      }

      // Pre-check: existe ya un hex con (campaignId, parentHexId, q, r)?
      // El custom SQL unique index lo enforcea también, pero pre-check da un
      // 400 limpio en lugar de un 500 de DB.
      const dupConditions = [eq(hexes.campaignId, campaignId), eq(hexes.q, body.q), eq(hexes.r, body.r)];
      if (body.parentHexId == null) {
        dupConditions.push(isNull(hexes.parentHexId));
      } else {
        dupConditions.push(eq(hexes.parentHexId, body.parentHexId));
      }
      const existing = await db
        .select({ id: hexes.id })
        .from(hexes)
        .where(and(...dupConditions))
        .limit(1);
      if (existing.length > 0) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [
            {
              code: 'HEX_COORDS_TAKEN',
              q: body.q,
              r: body.r,
              parentHexId: body.parentHexId ?? null,
            },
          ],
        });
      }

      const [created] = await db
        .insert(hexes)
        .values({
          campaignId,
          parentHexId: body.parentHexId ?? null,
          scale: body.scale ?? null,
          q: body.q,
          r: body.r,
          worldX: body.worldX ?? null,
          worldY: body.worldY ?? null,
          name: body.name ?? null,
          terrain: body.terrain ?? null,
          ...(body.status && { status: body.status }),
          dmNotes: body.dmNotes ?? null,
          playerNotes: body.playerNotes ?? null,
        })
        .returning();

      // Auto-log: hex creado con status non-default (DM "dropping content"
      // visible durante una sesión). Si arranca unexplored, es prep, no event.
      if (created && created.status !== 'unexplored') {
        const query = SessionQuery.parse(request.query);
        await recordSessionEventForWorld({
          gmUserId: userId,
          campaignId,
          ...(query.sessionId && { preferredSessionId: query.sessionId }),
          eventType: 'hex_created',
          payload: {
            hexId: created.id,
            name: created.name,
            terrain: created.terrain,
            status: created.status,
            q: created.q,
            r: created.r,
          },
        });
      }

      return reply.code(201).send(created);
    },
  );

  // ---- GET /campaigns/:campaignId/hexes -----------------------------------
  // Lista hexes de una campaña. Filtra por visibility según rol.
  //   ?parent=top  → solo top-level (default si nada se pasa).
  //   ?parent=all  → todos (aplanado).
  //   ?parent=<uuid> → hijos directos de ese hex.
  app.get(
    '/campaigns/:campaignId/hexes',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const query = ListHexesQuery.parse(request.query);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      const parentSpec = query.parent ?? 'top';
      let raw: LoadedHex[];
      if (parentSpec === 'all') {
        raw = await listHexesInCampaign({ campaignId });
      } else if (parentSpec === 'top') {
        raw = await listHexesInCampaign({ campaignId, parentHexId: null });
      } else {
        raw = await listHexesInCampaign({ campaignId, parentHexId: parentSpec });
      }

      // Para players: filtrar invisible (cascade) + sanitizar dmNotes.
      if (access === 'gm') {
        return { data: raw };
      }

      // Para filtrar cascade necesitamos todos los hexes de la campaña para
      // walker el árbol. Si ya pedimos 'all', lo tenemos; si no, hacemos un
      // fetch extra (OK para nuestros volúmenes).
      const allForCascade =
        parentSpec === 'all' ? raw : await listHexesInCampaign({ campaignId });
      const byId = new Map(allForCascade.map((h) => [h.id, h]));
      const visible: LoadedHex[] = [];
      for (const h of raw) {
        if (await isHexVisibleToPlayer(h, byId)) visible.push(h);
      }
      return { data: visible.map((h) => sanitizeHexForRole(h, access)) };
    },
  );

  // ---- GET /hexes/:hexId --------------------------------------------------
  app.get('/hexes/:hexId', { preHandler: app.authenticate }, async (request, reply) => {
    const { hexId } = HexParam.parse(request.params);
    const userId = request.user!.sub;

    const hex = await loadHex(hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    if (access !== 'gm') {
      const visible = await isHexVisibleToPlayer(hex);
      if (!visible) return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    return sanitizeHexForRole(hex, access);
  });

  // ---- GET /hexes/:hexId/children -----------------------------------------
  app.get(
    '/hexes/:hexId/children',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { hexId } = HexParam.parse(request.params);
      const userId = request.user!.sub;

      const parent = await loadHex(hexId);
      if (!parent) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(parent.campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      // Si el parent NO es visible para el player, los hijos tampoco lo son.
      if (access !== 'gm') {
        const visible = await isHexVisibleToPlayer(parent);
        if (!visible) return reply.code(404).send({ error: 'NOT_FOUND' });
      }

      const children = await listHexesInCampaign({
        campaignId: parent.campaignId,
        parentHexId: hexId,
      });

      if (access === 'gm') return { data: children };

      const allForCascade = await listHexesInCampaign({ campaignId: parent.campaignId });
      const byId = new Map(allForCascade.map((h) => [h.id, h]));
      const visible: LoadedHex[] = [];
      for (const c of children) {
        if (await isHexVisibleToPlayer(c, byId)) visible.push(c);
      }
      return { data: visible.map((h) => sanitizeHexForRole(h, access)) };
    },
  );

  // ---- PATCH /hexes/:hexId ------------------------------------------------
  // Solo GM puede editar.
  app.patch('/hexes/:hexId', { preHandler: app.authenticate }, async (request, reply) => {
    const { hexId } = HexParam.parse(request.params);
    const body = UpdateHexBody.parse(request.body);
    const userId = request.user!.sub;

    const hex = await loadHex(hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    // Cycle check: si cambia parentHexId a algo distinto de NULL.
    if (body.parentHexId !== undefined && body.parentHexId !== null && body.parentHexId !== hex.parentHexId) {
      // Validar que el nuevo parent existe Y es de la misma campaña.
      const newParent = await loadHex(body.parentHexId);
      if (!newParent || newParent.campaignId !== hex.campaignId) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'PARENT_NOT_FOUND', parentHexId: body.parentHexId }],
        });
      }
      const cycle = await wouldCreateCycle({
        campaignId: hex.campaignId,
        hexId,
        newParentId: body.parentHexId,
      });
      if (cycle) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [
            {
              code: 'HEX_CYCLE',
              hexId,
              attemptedParentId: body.parentHexId,
            },
          ],
        });
      }
    }

    // Si cambian (q, r) o parentHexId, chequear unique antes (para 400 limpio).
    const willChangeCoords =
      body.q !== undefined || body.r !== undefined || body.parentHexId !== undefined;
    if (willChangeCoords) {
      const newQ = body.q ?? hex.q;
      const newR = body.r ?? hex.r;
      const newParentId = body.parentHexId !== undefined ? body.parentHexId : hex.parentHexId;
      const dupConditions = [
        eq(hexes.campaignId, hex.campaignId),
        eq(hexes.q, newQ),
        eq(hexes.r, newR),
      ];
      if (newParentId == null) dupConditions.push(isNull(hexes.parentHexId));
      else dupConditions.push(eq(hexes.parentHexId, newParentId));
      const existing = await db
        .select({ id: hexes.id })
        .from(hexes)
        .where(and(...dupConditions))
        .limit(1);
      if (existing.length > 0 && existing[0]!.id !== hexId) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [
            {
              code: 'HEX_COORDS_TAKEN',
              q: newQ,
              r: newR,
              parentHexId: newParentId ?? null,
            },
          ],
        });
      }
    }

    const updates: Partial<typeof hexes.$inferInsert> = { updatedAt: new Date() };
    if (body.parentHexId !== undefined) updates.parentHexId = body.parentHexId;
    if (body.scale !== undefined) updates.scale = body.scale;
    if (body.q !== undefined) updates.q = body.q;
    if (body.r !== undefined) updates.r = body.r;
    if (body.worldX !== undefined) updates.worldX = body.worldX;
    if (body.worldY !== undefined) updates.worldY = body.worldY;
    if (body.name !== undefined) updates.name = body.name;
    if (body.terrain !== undefined) updates.terrain = body.terrain;
    if (body.status !== undefined) updates.status = body.status;
    if (body.dmNotes !== undefined) updates.dmNotes = body.dmNotes;
    if (body.playerNotes !== undefined) updates.playerNotes = body.playerNotes;

    const [updated] = await db
      .update(hexes)
      .set(updates)
      .where(eq(hexes.id, hexId))
      .returning();

    // Auto-log si cambió el status.
    if (updated && body.status !== undefined && body.status !== hex.status) {
      const eventType = hexTransitionEvent(hex.status, body.status);
      if (eventType) {
        const query = SessionQuery.parse(request.query);
        await recordSessionEventForWorld({
          gmUserId: userId,
          campaignId: hex.campaignId,
          ...(query.sessionId && { preferredSessionId: query.sessionId }),
          eventType,
          payload: {
            hexId,
            name: updated.name,
            from: hex.status,
            to: body.status,
          },
        });
      }
    }

    return updated;
  });

  // ---- DELETE /hexes/:hexId -----------------------------------------------
  // FK cascade borra hijos automáticamente.
  app.delete('/hexes/:hexId', { preHandler: app.authenticate }, async (request, reply) => {
    const { hexId } = HexParam.parse(request.params);
    const userId = request.user!.sub;

    const hex = await loadHex(hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    await db.delete(hexes).where(eq(hexes.id, hexId));
    return reply.code(204).send();
  });

  // =========================================================================
  // POIs — anidados bajo hex.
  // Visibility:
  //   - DM ve todos los POIs (incluyendo unknown + dmNotes).
  //   - Player solo ve POIs status != 'unknown', sin dmNotes, Y solo si el
  //     hex parent es visible para él (cascade).
  // =========================================================================

  // ---- POST /hexes/:hexId/pois -------------------------------------------
  app.post('/hexes/:hexId/pois', { preHandler: app.authenticate }, async (request, reply) => {
    const { hexId } = HexParam.parse(request.params);
    const body = CreatePoiBody.parse(request.body);
    const userId = request.user!.sub;

    const hex = await loadHex(hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    const [created] = await db
      .insert(pois)
      .values({
        hexId,
        name: body.name,
        description: body.description ?? null,
        dmNotes: body.dmNotes ?? null,
        ...(body.status && { status: body.status }),
        worldX: body.worldX ?? null,
        worldY: body.worldY ?? null,
      })
      .returning();

    // Auto-log: POI creado con status non-default. unknown = prep, no event.
    if (created && created.status !== 'unknown') {
      const query = SessionQuery.parse(request.query);
      await recordSessionEventForWorld({
        gmUserId: userId,
        campaignId: hex.campaignId,
        ...(query.sessionId && { preferredSessionId: query.sessionId }),
        eventType: 'poi_created',
        payload: {
          poiId: created.id,
          hexId,
          name: created.name,
          status: created.status,
        },
      });
    }

    return reply.code(201).send(created);
  });

  // ---- GET /hexes/:hexId/pois --------------------------------------------
  app.get('/hexes/:hexId/pois', { preHandler: app.authenticate }, async (request, reply) => {
    const { hexId } = HexParam.parse(request.params);
    const userId = request.user!.sub;

    const hex = await loadHex(hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    // Cascade: si el hex no es visible al player, los POIs tampoco.
    if (access !== 'gm') {
      const visible = await isHexVisibleToPlayer(hex);
      if (!visible) return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const list = await listPoisForHex(hexId);
    return { data: filterPoisByAccess(list, access) };
  });

  // ---- GET /pois/:poiId ---------------------------------------------------
  app.get('/pois/:poiId', { preHandler: app.authenticate }, async (request, reply) => {
    const { poiId } = PoiParam.parse(request.params);
    const userId = request.user!.sub;

    const poi = await loadPoi(poiId);
    if (!poi) return reply.code(404).send({ error: 'NOT_FOUND' });

    const hex = await loadHex(poi.hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    if (access !== 'gm') {
      // Cascade del hex.
      const hexVisible = await isHexVisibleToPlayer(hex);
      if (!hexVisible) return reply.code(404).send({ error: 'NOT_FOUND' });
      // POI unknown invisible al player.
      if (poi.status === 'unknown') return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    return sanitizePoiForRole(poi, access);
  });

  // ---- PATCH /pois/:poiId -------------------------------------------------
  app.patch('/pois/:poiId', { preHandler: app.authenticate }, async (request, reply) => {
    const { poiId } = PoiParam.parse(request.params);
    const body = UpdatePoiBody.parse(request.body);
    const userId = request.user!.sub;

    const poi = await loadPoi(poiId);
    if (!poi) return reply.code(404).send({ error: 'NOT_FOUND' });

    const hex = await loadHex(poi.hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    const updates: Partial<typeof pois.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.dmNotes !== undefined) updates.dmNotes = body.dmNotes;
    if (body.status !== undefined) updates.status = body.status;
    if (body.worldX !== undefined) updates.worldX = body.worldX;
    if (body.worldY !== undefined) updates.worldY = body.worldY;

    const [updated] = await db.update(pois).set(updates).where(eq(pois.id, poiId)).returning();

    // Auto-log si cambió el status.
    if (updated && body.status !== undefined && body.status !== poi.status) {
      const eventType = poiTransitionEvent(poi.status, body.status);
      if (eventType) {
        const query = SessionQuery.parse(request.query);
        await recordSessionEventForWorld({
          gmUserId: userId,
          campaignId: hex.campaignId,
          ...(query.sessionId && { preferredSessionId: query.sessionId }),
          eventType,
          payload: {
            poiId,
            hexId: hex.id,
            name: updated.name,
            from: poi.status,
            to: body.status,
          },
        });
      }
    }

    return updated;
  });

  // ---- DELETE /pois/:poiId ------------------------------------------------
  app.delete('/pois/:poiId', { preHandler: app.authenticate }, async (request, reply) => {
    const { poiId } = PoiParam.parse(request.params);
    const userId = request.user!.sub;

    const poi = await loadPoi(poiId);
    if (!poi) return reply.code(404).send({ error: 'NOT_FOUND' });

    const hex = await loadHex(poi.hexId);
    if (!hex) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getMapAccess(hex.campaignId, userId);
    if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    await db.delete(pois).where(eq(pois.id, poiId));
    return reply.code(204).send();
  });
};

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { validateStats } from '@dungeon-hub/domain/character/stats';
import { validateRaceSelection } from '@dungeon-hub/domain/character/race';
import { db } from '../../infra/db/client.js';
import { characters } from '../../infra/db/schema.js';
import {
  assertCampaignMembership,
  getCharacterAccess,
  loadCharacter,
} from '../../use-cases/characters/load-character.js';
import { loadCampaign } from '../../use-cases/campaigns/load-campaign.js';
import { loadRaceAndSubrace } from '../../use-cases/characters/load-race-data.js';

const CharacterStatus = z.enum(['draft', 'active', 'retired', 'dead']);

const CreateBody = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(120),
  /** data libre por ahora — el constraint engine de Fase 1.4 le va a dar shape. */
  data: z.record(z.string(), z.unknown()).default({}),
});

const UpdateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  status: CharacterStatus.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  xp: z.number().int().min(0).optional(),
});

const ParamsWithId = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  campaign: z.string().uuid().optional(),
});

const SetStatsBody = z.object({
  method: z.enum(['standard-array', 'point-buy', 'roll']),
  scores: z.object({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  }),
});

const AbilityKeyEnum = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const SetRaceBody = z.object({
  race: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  subrace: z
    .object({ slug: z.string().min(1), source: z.string().min(1) })
    .nullable()
    .optional(),
  appliedAsis: z
    .array(
      z.object({
        ability: AbilityKeyEnum,
        bonus: z.number().int(),
        source: z.enum(['race', 'subrace']),
      }),
    )
    .optional(),
});

export const charactersRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /characters ----------------------------------------------------
  app.post('/characters', { preHandler: app.authenticate }, async (request, reply) => {
    const body = CreateBody.parse(request.body);
    const userId = request.user!.sub;

    // El user tiene que ser miembro de la campaña.
    const campaign = await assertCampaignMembership(body.campaignId, userId);
    if (!campaign) {
      return reply
        .code(403)
        .send({ error: 'NOT_CAMPAIGN_MEMBER', campaignId: body.campaignId });
    }

    const [created] = await db
      .insert(characters)
      .values({
        userId,
        campaignId: body.campaignId,
        name: body.name,
        data: body.data,
        // status default 'draft', inventory default '[]', xp default 0 (schema)
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ---- GET /characters -----------------------------------------------------
  // Lista los personajes del user actual. Opcional ?campaign=:id para filtrar.
  app.get('/characters', { preHandler: app.authenticate }, async (request) => {
    const userId = request.user!.sub;
    const { campaign } = ListQuery.parse(request.query);

    const whereExpr = campaign
      ? and(eq(characters.userId, userId), eq(characters.campaignId, campaign))
      : eq(characters.userId, userId);

    const rows = await db
      .select({
        id: characters.id,
        campaignId: characters.campaignId,
        name: characters.name,
        status: characters.status,
        xp: characters.xp,
        createdAt: characters.createdAt,
        updatedAt: characters.updatedAt,
      })
      .from(characters)
      .where(whereExpr)
      .orderBy(characters.createdAt);

    return { data: rows };
  });

  // ---- GET /characters/:id -------------------------------------------------
  app.get('/characters/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    return character;
  });

  // ---- GET /characters/:id/sheet ------------------------------------------
  // Por ahora es un echo de la data — el calculator de stats viene en Fase 1.5.
  app.get('/characters/:id/sheet', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    // TODO Fase 1.5: stats calculados (AC, HP, Spell DC, etc.)
    return {
      character,
      calculated: null,
      note: 'Stats calculados no implementados aún — disponibles en Fase 1.5.',
    };
  });

  // ---- PATCH /characters/:id ----------------------------------------------
  // Solo el owner puede editar (campaign members tienen read-only).
  app.patch('/characters/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = UpdateBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const updates: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.status !== undefined) updates.status = body.status;
    if (body.data !== undefined) updates.data = body.data;
    if (body.xp !== undefined) updates.xp = body.xp;

    const [updated] = await db
      .update(characters)
      .set(updates)
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- DELETE /characters/:id ----------------------------------------------
  app.delete('/characters/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede borrar' });
    }

    await db.delete(characters).where(eq(characters.id, id));
    return reply.code(204).send();
  });

  // ---- PUT /characters/:id/stats ------------------------------------------
  // Primer paso del builder: setear baseStats (pre-racial).
  // Valida contra el método elegido + lo permitido por el Rules Profile de la campaña.
  app.put('/characters/:id/stats', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetStatsBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadCampaign(character.campaignId);
    if (!campaign) {
      return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });
    }

    const result = validateStats(body.scores, body.method, campaign.rulesProfile.statGeneration);
    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const data = (character.data as Record<string, unknown> | null) ?? {};
    const [updated] = await db
      .update(characters)
      .set({
        data: { ...data, baseStats: body.scores, statMethod: body.method },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- PUT /characters/:id/race -------------------------------------------
  // Setea race + subrace + ASIs raciales. Reglas:
  //   - Sources habilitadas en el Rules Profile.
  //   - Subrace tiene que pertenecer a la race.
  //   - Tasha's CYO toggle: redistribuye el bag a stats arbitrarios distintos.
  //   - Razas MPMM (ability: null): user provee +2/+1 a stats distintos.
  app.put('/characters/:id/race', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetRaceBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadCampaign(character.campaignId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const { race, subrace } = await loadRaceAndSubrace({
      raceSlug: body.race.slug,
      raceSource: body.race.source,
      subraceSlug: body.subrace?.slug ?? null,
      subraceSource: body.subrace?.source ?? null,
    });

    if (!race) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'RACE_NOT_FOUND', race: body.race }],
      });
    }
    if (body.subrace && !subrace) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SUBRACE_NOT_FOUND', subrace: body.subrace }],
      });
    }

    const result = validateRaceSelection({
      raceData: race,
      subraceData: subrace,
      rulesProfile: campaign.rulesProfile,
      appliedAsis: body.appliedAsis,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const data = (character.data as Record<string, unknown> | null) ?? {};
    const [updated] = await db
      .update(characters)
      .set({
        data: {
          ...data,
          race: body.race,
          subrace: body.subrace ?? null,
          asisApplied: result.appliedAsis,
          usedTashasCustomOrigin: result.usedTashasCustomOrigin,
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });
};

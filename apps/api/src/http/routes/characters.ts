import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { validateStats } from '@dungeon-hub/domain/character/stats';
import { validateRaceSelection } from '@dungeon-hub/domain/character/race';
import { validateClassSelection } from '@dungeon-hub/domain/character/class';
import { validateBackgroundSelection } from '@dungeon-hub/domain/character/background';
import { validateMulticlassAddition, computeEffectiveScores } from '@dungeon-hub/domain/character/multiclass';
import { classGrantsSpellcasting, validateFeatSelection } from '@dungeon-hub/domain/character/feat';
import type { AppliedAsi } from '@dungeon-hub/domain/character/race';
import type { AbilityScores } from '@dungeon-hub/domain/character/stats';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import type { AppliedFeat } from '@dungeon-hub/domain/character/feat';
import { db } from '../../infra/db/client.js';
import { characters } from '../../infra/db/schema.js';
import {
  assertCampaignMembership,
  getCharacterAccess,
  loadCharacter,
} from '../../use-cases/characters/load-character.js';
import { loadCampaign } from '../../use-cases/campaigns/load-campaign.js';
import { loadRaceAndSubrace } from '../../use-cases/characters/load-race-data.js';
import { loadClassAndSubclass } from '../../use-cases/characters/load-class-data.js';
import { loadBackgroundData } from '../../use-cases/characters/load-background-data.js';
import { loadFeatData } from '../../use-cases/characters/load-feat-data.js';

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

const AddFeatBody = z.object({
  feat: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  asiChoice: z
    .array(z.object({ ability: z.string().min(1), bonus: z.number().int() }))
    .optional(),
});

const AddMulticlassBody = z.object({
  class: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  subclass: z
    .object({ slug: z.string().min(1), source: z.string().min(1) })
    .nullable()
    .optional(),
  skillChoices: z.array(z.string().min(1)).optional(),
});

const SetBackgroundBody = z.object({
  background: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  skillChoices: z.array(z.string().min(1)).optional(),
  languageChoices: z.array(z.string().min(1)).optional(),
  toolChoices: z.record(z.string(), z.array(z.string().min(1))).optional(),
});

const SetClassBody = z.object({
  class: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  level: z.number().int().min(1).max(20),
  subclass: z
    .object({ slug: z.string().min(1), source: z.string().min(1) })
    .nullable()
    .optional(),
  skillChoices: z.array(z.string().min(1)).optional(),
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

  // ---- PUT /characters/:id/class ------------------------------------------
  // Setea la clase principal + level + subclass (si está desbloqueada) + skill choices.
  // En este slice: una sola clase. Multiclass entra en 1.4e.
  app.put('/characters/:id/class', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetClassBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadCampaign(character.campaignId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const { classData, subclassData } = await loadClassAndSubclass({
      classSlug: body.class.slug,
      classSource: body.class.source,
      subclassSlug: body.subclass?.slug ?? null,
      subclassSource: body.subclass?.source ?? null,
    });

    if (!classData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'CLASS_NOT_FOUND', class: body.class }],
      });
    }
    if (body.subclass && !subclassData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SUBCLASS_NOT_FOUND', subclass: body.subclass }],
      });
    }

    const result = validateClassSelection({
      classData,
      subclassData,
      level: body.level,
      skillChoices: body.skillChoices,
      rulesProfile: campaign.rulesProfile,
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
          // Reemplaza la lista entera de clases con la nueva selección (single class por ahora).
          // Multiclass agregará/editará entradas de este array.
          classes: [result.appliedClass],
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- PUT /characters/:id/background -------------------------------------
  // Aplica un background: skills + languages + tools.
  // Starting equipment se hace en un slice aparte (selector a/b).
  app.put('/characters/:id/background', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetBackgroundBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadCampaign(character.campaignId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const backgroundData = await loadBackgroundData({
      slug: body.background.slug,
      source: body.background.source,
    });
    if (!backgroundData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'BACKGROUND_NOT_FOUND', background: body.background }],
      });
    }

    const result = validateBackgroundSelection({
      backgroundData,
      rulesProfile: campaign.rulesProfile,
      skillChoices: body.skillChoices,
      languageChoices: body.languageChoices,
      toolChoices: body.toolChoices,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const data = (character.data as Record<string, unknown> | null) ?? {};
    const [updated] = await db
      .update(characters)
      .set({
        data: { ...data, background: result.appliedBackground },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- POST /characters/:id/classes ---------------------------------------
  // Agrega una nueva clase como multiclass (level 1). Prereqs PHB p.163 + profs
  // reducidas PHB p.164. Para subir nivel de clase existente: Fase 1.8.
  app.post('/characters/:id/classes', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = AddMulticlassBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadCampaign(character.campaignId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const { classData, subclassData } = await loadClassAndSubclass({
      classSlug: body.class.slug,
      classSource: body.class.source,
      subclassSlug: body.subclass?.slug ?? null,
      subclassSource: body.subclass?.source ?? null,
    });

    if (!classData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'CLASS_NOT_FOUND', class: body.class }],
      });
    }
    if (body.subclass && !subclassData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SUBCLASS_NOT_FOUND', subclass: body.subclass }],
      });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const existingClasses = (charData.classes as AppliedClass[] | undefined) ?? [];

    const result = validateMulticlassAddition({
      rulesProfile: campaign.rulesProfile,
      baseStats: (charData.baseStats as AbilityScores | undefined) ?? null,
      asisApplied: (charData.asisApplied as AppliedAsi[] | undefined) ?? [],
      existingClasses: existingClasses.map((c) => ({ slug: c.slug, source: c.source })),
      newClassData: classData,
      newSubclassData: subclassData,
      skillChoices: body.skillChoices,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const updatedClasses = [...existingClasses, result.appliedClass];

    const [updated] = await db
      .update(characters)
      .set({
        data: { ...charData, classes: updatedClasses },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return reply.code(201).send(updated);
  });

  // ---- POST /characters/:id/feats -----------------------------------------
  // Agrega un feat al personaje. Valida prereqs (ability/proficiency/race/
  // spellcasting), aplica el ASI del feat (fijo o elegido).
  app.post('/characters/:id/feats', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = AddFeatBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadCampaign(character.campaignId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const featData = await loadFeatData({ slug: body.feat.slug, source: body.feat.source });
    if (!featData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'FEAT_NOT_FOUND', feat: body.feat }],
      });
    }

    // Construir el context del personaje a partir de character.data
    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const baseStats = charData.baseStats as AbilityScores | undefined;
    if (!baseStats) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'NO_BASE_STATS', hint: 'Setea baseStats antes de tomar feats.' }],
      });
    }

    const racialAsis = (charData.asisApplied as AppliedAsi[] | undefined) ?? [];
    const existingFeats = (charData.feats as AppliedFeat[] | undefined) ?? [];
    // Sumamos también las ASIs ya aplicadas por feats anteriores para los effective scores
    const featAsis = existingFeats.flatMap((f) =>
      f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'race' as const })),
    );
    const effectiveScores = computeEffectiveScores(baseStats, [...racialAsis, ...featAsis]);

    const classes = (charData.classes as AppliedClass[] | undefined) ?? [];
    const armorProficiencies = classes.flatMap((c) => c.armorProficiencies);
    const weaponProficiencies = classes.flatMap((c) => c.weaponProficiencies);
    const hasSpellcasting = classes.some((c) => classGrantsSpellcasting(c.slug));

    const raceField = charData.race as { slug: string; source: string } | null | undefined;

    const result = validateFeatSelection({
      featData,
      rulesProfile: campaign.rulesProfile,
      ctx: {
        effectiveScores,
        race: raceField ? { slug: raceField.slug } : null,
        armorProficiencies,
        weaponProficiencies,
        hasSpellcasting,
        existingFeats: existingFeats.map((f) => ({ slug: f.slug, source: f.source })),
      },
      asiChoice: body.asiChoice,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const updatedFeats = [...existingFeats, result.appliedFeat];

    const [updated] = await db
      .update(characters)
      .set({
        data: { ...charData, feats: updatedFeats },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return reply.code(201).send(updated);
  });
};

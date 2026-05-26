import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { DEFAULT_RULES_PROFILE, RulesProfileSchema } from '@dungeon-hub/domain/rules-profile';
import { db } from '../../infra/db/client.js';
import { campaigns, campaignMembers, users, worlds, worldMembers } from '../../infra/db/schema.js';
import { loadCampaign } from '../../use-cases/campaigns/load-campaign.js';
import { assertWorldGm } from '../../use-cases/auth/assert-world-gm.js';

const CreateCampaignBody = z.object({
  name: z.string().min(1).max(120),
  /** Si se omite, se usa DEFAULT_RULES_PROFILE. */
  rulesProfile: RulesProfileSchema.optional(),
});

const UpdateCampaignBody = z.object({
  name: z.string().min(1).max(120).optional(),
  /**
   * Post-C2: rulesProfile is stored on the world, not the campaign.
   * Accepting it here for backward compat — updates the associated world.
   */
  rulesProfile: RulesProfileSchema.optional(),
});

const ParamsWithId = z.object({ id: z.string().uuid() });

export const campaignsRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /campaigns -----------------------------------------------------
  // Crea un world + campaign atómicamente. El creator se convierte en GM del world.
  // El rulesProfile se almacena en el world (no en la campaña post-C2).
  app.post('/campaigns', { preHandler: app.authenticate }, async (request, reply) => {
    const body = CreateCampaignBody.parse(request.body);
    const userId = request.user!.sub;

    // Verificar que el user existe en public.users (trigger debería haberlo creado)
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRows.length === 0) {
      return reply.code(409).send({
        error: 'USER_NOT_PROVISIONED',
        message:
          'No se encontró tu user en public.users. El trigger de auth.users → public.users no se ejecutó. Aplicá apps/api/drizzle/custom/0001-auth-mirror-trigger.sql.',
      });
    }

    const profile = body.rulesProfile ?? DEFAULT_RULES_PROFILE;

    // Slug derivado del nombre + UUID suffix para unicidad
    const slugBase = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = slugBase + '-' + randomUUID().slice(0, 8);

    // Create world first (rules_profile lives on world post-C2)
    const [createdWorld] = await db
      .insert(worlds)
      .values({
        name: body.name + ' (World)',
        slug,
        ownerUserId: userId,
        rulesProfile: profile,
      })
      .returning();

    if (!createdWorld) {
      return reply.code(500).send({ error: 'CREATE_FAILED' });
    }

    // Create campaign under the world
    const [created] = await db
      .insert(campaigns)
      .values({
        name: body.name,
        gmUserId: userId,
        worldId: createdWorld.id,
      })
      .returning();

    if (!created) {
      return reply.code(500).send({ error: 'CREATE_FAILED' });
    }

    // GM se une al world como gm worldMember
    await db.insert(worldMembers).values({
      worldId: createdWorld.id,
      userId,
      role: 'gm',
    });

    // El GM se une a la campaign como miembro automáticamente
    await db.insert(campaignMembers).values({
      campaignId: created.id,
      userId,
      role: 'gm',
    });

    return reply.code(201).send({
      id: created.id,
      name: created.name,
      gmUserId: created.gmUserId,
      worldId: created.worldId,
      rulesProfile: profile,
      createdAt: created.createdAt,
    });
  });

  // ---- GET /campaigns ------------------------------------------------------
  // Lista las campañas donde el user es miembro.
  app.get('/campaigns', { preHandler: app.authenticate }, async (request) => {
    const userId = request.user!.sub;

    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        gmUserId: campaigns.gmUserId,
        worldId: campaigns.worldId,
        createdAt: campaigns.createdAt,
        memberRole: campaignMembers.role,
      })
      .from(campaigns)
      .innerJoin(campaignMembers, eq(campaignMembers.campaignId, campaigns.id))
      .where(eq(campaignMembers.userId, userId));

    return { data: rows };
  });

  // ---- GET /campaigns/:id --------------------------------------------------
  app.get('/campaigns/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const campaign = await loadCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'NOT_FOUND' });

    // Verificar que el user es miembro
    const userId = request.user!.sub;
    const member = await db
      .select()
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, id), eq(campaignMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.code(403).send({ error: 'FORBIDDEN' });

    return campaign;
  });

  // ---- PATCH /campaigns/:id ------------------------------------------------
  // Cualquier GM del world (worldMembers.role='gm') puede editar la campaña.
  app.patch('/campaigns/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = UpdateCampaignBody.parse(request.body);
    const userId = request.user!.sub;

    const campaign = await loadCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'NOT_FOUND' });

    const check = await assertWorldGm(campaign.worldId, userId);
    if (!check.ok) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        issues: [{ code: 'WORLD_GM_REQUIRED', worldId: campaign.worldId, userId }],
      });
    }

    const updates: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, id))
      .returning();

    // Post-C2: rulesProfile lives on the world. Update world if rulesProfile was provided.
    if (body.rulesProfile !== undefined) {
      await db
        .update(worlds)
        .set({ rulesProfile: body.rulesProfile, updatedAt: new Date() })
        .where(eq(worlds.id, campaign.worldId));
    }

    return { ...updated, rulesProfile: body.rulesProfile ?? campaign.rulesProfile };
  });
};

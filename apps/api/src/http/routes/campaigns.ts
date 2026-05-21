import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { DEFAULT_RULES_PROFILE, RulesProfileSchema } from '@dungeon-hub/domain/rules-profile';
import { db } from '../../infra/db/client.js';
import { campaigns, campaignMembers, users } from '../../infra/db/schema.js';
import { loadCampaign } from '../../use-cases/campaigns/load-campaign.js';

const CreateCampaignBody = z.object({
  name: z.string().min(1).max(120),
  /** Si se omite, se usa DEFAULT_RULES_PROFILE. */
  rulesProfile: RulesProfileSchema.optional(),
});

const UpdateCampaignBody = z.object({
  name: z.string().min(1).max(120).optional(),
  rulesProfile: RulesProfileSchema.optional(),
});

const ParamsWithId = z.object({ id: z.string().uuid() });

export const campaignsRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /campaigns -----------------------------------------------------
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

    const [created] = await db
      .insert(campaigns)
      .values({
        name: body.name,
        gmUserId: userId,
        rulesProfile: profile,
      })
      .returning();

    if (!created) {
      return reply.code(500).send({ error: 'CREATE_FAILED' });
    }

    // El GM se une como miembro automáticamente
    await db.insert(campaignMembers).values({
      campaignId: created.id,
      userId,
      role: 'gm',
    });

    return reply.code(201).send({
      id: created.id,
      name: created.name,
      gmUserId: created.gmUserId,
      rulesProfile: created.rulesProfile,
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
  // Solo el GM puede editar (en particular, el Rules Profile).
  app.patch('/campaigns/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = UpdateCampaignBody.parse(request.body);
    const userId = request.user!.sub;

    const campaign = await loadCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (campaign.gmUserId !== userId) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el GM puede editar' });
    }

    const updates: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.rulesProfile !== undefined) updates.rulesProfile = body.rulesProfile;

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, id))
      .returning();

    return updated;
  });
};

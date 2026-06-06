import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { DEFAULT_RULES_PROFILE, RulesProfileSchema } from '@dungeon-hub/domain/rules-profile';
import { db } from '../../infra/db/client.js';
import {
  campaigns,
  campaignMembers,
  campaignInviteTokens,
  users,
  worlds,
  worldMembers,
} from '../../infra/db/schema.js';
import { loadCampaign } from '../../use-cases/campaigns/load-campaign.js';
import { listUserCampaigns } from '../../use-cases/campaigns/list-user-campaigns.js';
import { loadCampaignMembers } from '../../use-cases/campaigns/load-campaign-members.js';
import { assertWorldGm } from '../../use-cases/auth/assert-world-gm.js';
import { generateToken, buildAppUrl } from '../../infra/tokens.js';

const CreateCampaignBody = z.object({
  name: z.string().min(1).max(120),
  /** Si se omite, se usa DEFAULT_RULES_PROFILE. */
  rulesProfile: RulesProfileSchema.optional(),
  /**
   * Opcional. Cuando se provee, crea la campaña bajo un world existente del cual
   * el caller ya es GM. Omitir para crear un world+campaign atómicamente (path original).
   */
  worldId: z.string().uuid().optional(),
});

const UpdateCampaignBody = z.object({
  name: z.string().min(1).max(120).optional(),
  /**
   * Post-C2: rulesProfile is stored on the world, not the campaign.
   * Accepting it here for backward compat — updates the associated world.
   */
  rulesProfile: RulesProfileSchema.optional(),
});

const CreateInviteBody = z.object({
  /** TTL in hours. Defaults to 168 (7 days). Clamped to [1, 720]. */
  ttlHours: z.number().int().min(1).max(720).optional(),
  /** When true, maxUses=null (unlimited). Default is single-use (maxUses=1). */
  multiUse: z.boolean().optional(),
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

    // ── Branch: worldId provided → create campaign under an EXISTING world ──
    if (body.worldId) {
      // Verify the caller is a GM of that world
      const check = await assertWorldGm(body.worldId, userId);
      if (!check.ok) {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          issues: [{ code: 'WORLD_GM_REQUIRED', worldId: body.worldId, userId }],
        });
      }

      // Create campaign under the existing world (no new world row)
      const [created] = await db
        .insert(campaigns)
        .values({
          name: body.name,
          gmUserId: userId,
          worldId: body.worldId,
        })
        .returning();

      if (!created) {
        return reply.code(500).send({ error: 'CREATE_FAILED' });
      }

      // GM joins the new campaign as member
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
    }

    // ── Default branch: atomic world+campaign creation (existing behavior) ──

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
  // Lista las campañas donde el user es miembro, con aggregates v3
  // (playersCount, sessionsCount, nextSession, pendingFichas DM-only).
  // Optional ?status=active|archived to filter by status.
  app.get('/campaigns', { preHandler: app.authenticate }, async (request) => {
    const userId = request.user!.sub;
    const query = request.query as Record<string, string | undefined>;
    const statusFilter = query['status'];
    const data = await listUserCampaigns(userId, statusFilter);
    return { data };
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

    const members = await loadCampaignMembers(id);
    // member[0] is guaranteed present — the member.length === 0 guard ran above.
    const callerRole: 'gm' | 'player' = member[0]!.role;
    return { ...campaign, members, callerRole };
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

  // ---- POST /campaigns/:id/invite -----------------------------------------
  // GM-only. Generates a shareable invite link for the campaign.
  // Returns 201 { url, expiresAt }. NEVER logs the raw token.
  app.post('/campaigns/:id/invite', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const bodyParsed = CreateInviteBody.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply
        .code(400)
        .send({ error: 'VALIDATION_FAILED', issues: bodyParsed.error.issues });
    }
    const body = bodyParsed.data;
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

    const token = generateToken();
    const ttlMs = (body.ttlHours ?? 168) * 3_600_000; // 168h = 7 days default
    const expiresAt = new Date(Date.now() + ttlMs);
    const maxUses = body.multiUse ? null : 1;

    await db.insert(campaignInviteTokens).values({
      token,
      campaignId: id,
      worldId: campaign.worldId,
      createdByUserId: userId,
      role: 'player',
      maxUses,
      expiresAt,
    });

    return reply.code(201).send({
      url: buildAppUrl('invite', token),
      expiresAt: expiresAt.toISOString(),
    });
  });

  // ---- POST /campaigns/:id/archive -----------------------------------------
  // GM-only. Sets status='archived' (idempotent — always returns 200).
  app.post('/campaigns/:id/archive', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
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

    const [updated] = await db
      .update(campaigns)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();

    return { ...updated };
  });

  // ---- POST /campaigns/:id/unarchive ----------------------------------------
  // GM-only. Sets status='active' (idempotent — always returns 200).
  app.post('/campaigns/:id/unarchive', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
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

    const [updated] = await db
      .update(campaigns)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();

    return { ...updated };
  });
};

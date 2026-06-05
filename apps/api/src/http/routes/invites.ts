import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { campaignInviteTokens, campaignMembers, campaigns, worldMembers, worlds } from '../../infra/db/schema.js';
import { evaluateInviteToken } from '../../use-cases/campaigns/evaluate-invite-token.js';
import { acceptCampaignInvite } from '../../use-cases/campaigns/accept-campaign-invite.js';

const StatusParams = z.object({
  token: z.string().min(1),
});

const ConfirmBody = z.object({
  token: z.string().min(1),
});

/**
 * Campaign invite routes.
 *
 * GET  /invites/status/:token — auth required; returns token state + campaign info.
 * POST /invites/confirm        — auth required; atomically joins world + campaign.
 *
 * Both endpoints require authentication (anti-enumeration, mirrors auth/link/status).
 * The raw token string is NEVER echoed back in any response body.
 *
 * REQ-INV-STATUS-01, REQ-INV-CONFIRM-01 (SDD spec #1872).
 */
export const invitesRoute: FastifyPluginAsync = async (app) => {
  // ---- GET /invites/status/:token ------------------------------------------
  // Returns the current state of an invite token plus enough info for the
  // accept screen to render: campaignName, worldName, alreadyMember.
  // 404 if token unknown; 410 EXPIRED or CONSUMED if exhausted.
  app.get(
    '/invites/status/:token',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { token } = StatusParams.parse(request.params);
      const userId = request.user!.sub;

      // Load the token row joined with campaign + world names.
      const rows = await db
        .select({
          token: campaignInviteTokens.token,
          campaignId: campaignInviteTokens.campaignId,
          worldId: campaignInviteTokens.worldId,
          expiresAt: campaignInviteTokens.expiresAt,
          revokedAt: campaignInviteTokens.revokedAt,
          maxUses: campaignInviteTokens.maxUses,
          useCount: campaignInviteTokens.useCount,
          campaignName: campaigns.name,
          worldName: worlds.name,
        })
        .from(campaignInviteTokens)
        .innerJoin(campaigns, eq(campaigns.id, campaignInviteTokens.campaignId))
        .innerJoin(worlds, eq(worlds.id, campaignInviteTokens.worldId))
        .where(eq(campaignInviteTokens.token, token))
        .limit(1);

      const row = rows[0];
      if (!row) return reply.code(404).send({ error: 'NOT_FOUND' });

      const now = new Date();
      const state = evaluateInviteToken(row, now);
      if (state === 'CONSUMED') {
        return reply.code(410).send({ error: 'CONSUMED' });
      }
      if (state === 'EXPIRED') {
        return reply.code(410).send({ error: 'EXPIRED' });
      }

      // Check if the caller is already a campaign member.
      const memberRows = await db
        .select({ campaignId: campaignMembers.campaignId })
        .from(campaignMembers)
        .where(
          and(
            eq(campaignMembers.campaignId, row.campaignId),
            eq(campaignMembers.userId, userId),
          ),
        )
        .limit(1);

      const alreadyMember = memberRows.length > 0;

      // Resolve caller's world-level role so the invite page can branch on GM vs player.
      // ADR-A4: natural to do here since worldId is already in scope from the join.
      const wmRows = await db
        .select({ role: worldMembers.role })
        .from(worldMembers)
        .where(and(eq(worldMembers.worldId, row.worldId), eq(worldMembers.userId, userId)))
        .limit(1);
      const worldRole: 'gm' | 'player' | null = wmRows[0]?.role ?? null;

      // NEVER echo the raw token in the response.
      return {
        campaignName: row.campaignName,
        worldName: row.worldName,
        campaignId: row.campaignId,
        alreadyMember,
        worldRole,
      };
    },
  );

  // ---- POST /invites/confirm -----------------------------------------------
  // Atomically joins the caller to the world + campaign for the given token.
  // Delegates to acceptCampaignInvite (db.transaction + TOCTOU re-validation).
  app.post('/invites/confirm', { preHandler: app.authenticate }, async (request, reply) => {
    const body = ConfirmBody.parse(request.body);
    const userId = request.user!.sub;

    const result = await acceptCampaignInvite(body.token, userId);

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        return reply.code(410).send({ error: 'INVALID_TOKEN' });
      }
      if (result.reason === 'EXPIRED') {
        return reply.code(410).send({ error: 'EXPIRED' });
      }
      // CONSUMED
      return reply.code(410).send({ error: 'CONSUMED' });
    }

    return { campaignId: result.campaignId };
  });
};

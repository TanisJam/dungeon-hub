/**
 * worlds.ts — Routes for the `worlds` entity (top-level ownership layer).
 *
 * Note: `world.ts` (map content routes) handles factions, NPCs, world events
 * scoped to campaigns. This file handles the `worlds` table itself.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { worlds, worldMembers } from '../../infra/db/schema.js';

const ListWorldsQuery = z.object({
  mine: z.coerce.number().int().optional(),
});

export const worldsRoute: FastifyPluginAsync = async (app) => {
  // ---- GET /worlds ----------------------------------------------------------
  // With ?mine=1: returns all worlds where the authenticated user is a worldMember.
  // Without ?mine=1: returns 400 (only `mine=1` is supported in MVP).
  app.get('/worlds', { preHandler: app.authenticate }, async (request, reply) => {
    const query = ListWorldsQuery.parse(request.query);
    const userId = request.user!.sub;

    if (!query.mine) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'MINE_PARAM_REQUIRED', message: 'Use ?mine=1 to list your worlds.' }],
      });
    }

    // Fetch all worlds where the user has a worldMembers row (any role)
    const rows = await db
      .select({
        id: worlds.id,
        name: worlds.name,
        slug: worlds.slug,
      })
      .from(worlds)
      .innerJoin(worldMembers, and(eq(worldMembers.worldId, worlds.id), eq(worldMembers.userId, userId)));

    return reply.send({ worlds: rows });
  });
};

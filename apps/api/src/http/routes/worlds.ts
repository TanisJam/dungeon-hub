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
import { loadWorldById } from '../../use-cases/campaigns/load-campaign.js';
import { loadWorldRefData } from '../../use-cases/world/load-ref-data.js';
import { listWorldCharacters } from '../../use-cases/worlds/list-world-characters.js';

const ListWorldsQuery = z.object({
  mine: z.coerce.number().int().optional(),
});

const WorldIdParams = z.object({ id: z.string().uuid() });

/**
 * Status filter for GET /worlds/:id/characters?status=...
 *
 * Accepts a comma-separated string. Empty/missing → undefined (no filter).
 * Unknown values yield `INVALID_STATUS` so the route can return 400
 * VALIDATION_FAILED per REQ-WDCL-STATUS-FILTER.
 */
const CharacterStatusEnum = z.enum(['draft', 'active', 'retired', 'dead', 'pending_approval']);

const WorldCharactersQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((v) => v.trim()).filter(Boolean) : undefined))
    .pipe(z.array(CharacterStatusEnum).optional()),
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

  // ---- GET /worlds/:id ------------------------------------------------------
  // Returns the world payload (including rulesProfile) for any authenticated
  // worldMember. Used by the character wizard to scope compendium queries and
  // surface statGeneration on the stats step.
  //
  // Additive: response includes `callerRole: 'gm' | 'player' | null` so the web
  // can render DM-only chrome (DM session panel) without a second round-trip.
  // See SDD `dm-session-panel` REQ-WDR-CALLER-ROLE.
  app.get('/worlds/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = WorldIdParams.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues,
      });
    }
    const { id } = parsed.data;
    const userId = request.user!.sub;

    const world = await loadWorldById(id);
    if (!world) return reply.code(404).send({ error: 'NOT_FOUND' });

    const membership = await db
      .select({ role: worldMembers.role })
      .from(worldMembers)
      .where(and(eq(worldMembers.worldId, id), eq(worldMembers.userId, userId)))
      .limit(1);
    if (membership.length === 0) return reply.code(403).send({ error: 'FORBIDDEN' });

    const callerRole: 'gm' | 'player' | null = membership[0]?.role ?? null;

    const refData = await loadWorldRefData(id);
    // Sets aren't JSON-serializable — flatten to arrays at the API boundary.
    const refDataPayload =
      refData == null
        ? null
        : {
            languagePool: refData.languagePool,
            subraceRequiredSet: Array.from(refData.subraceRequiredSet),
            subraceReplacingAbilitySet: Array.from(refData.subraceReplacingAbilitySet),
          };

    return reply.send({
      id: world.id,
      name: world.name,
      slug: world.slug,
      ownerUserId: world.ownerUserId,
      rulesProfile: world.rulesProfile,
      refData: refDataPayload,
      callerRole,
    });
  });

  // ---- GET /worlds/:id/characters ------------------------------------------
  // DM session panel: lists characters scoped to a world for the GM landing.
  // Read-access is symmetric (any worldMember can list); the web layer hides
  // DM-only chrome by inspecting `callerRole` from GET /worlds/:id.
  // See SDD `dm-session-panel` REQ-WDCL-LIST-ENDPOINT + REQ-WDCL-STATUS-FILTER.
  app.get('/worlds/:id/characters', { preHandler: app.authenticate }, async (request, reply) => {
    const paramsParsed = WorldIdParams.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: paramsParsed.error.issues,
      });
    }
    const { id } = paramsParsed.data;
    const userId = request.user!.sub;

    // Validate the status filter BEFORE doing any DB work, so a bad token
    // shape returns 400 INVALID_STATUS regardless of membership.
    const queryParsed = WorldCharactersQuery.safeParse(request.query);
    if (!queryParsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [
          {
            code: 'INVALID_STATUS',
            message: 'Unknown status value in ?status= query (must be one of draft|pending_approval|active|retired|dead).',
            zod: queryParsed.error.issues,
          },
        ],
      });
    }

    const membership = await db
      .select({ role: worldMembers.role })
      .from(worldMembers)
      .where(and(eq(worldMembers.worldId, id), eq(worldMembers.userId, userId)))
      .limit(1);
    if (membership.length === 0) return reply.code(403).send({ error: 'FORBIDDEN' });

    const rows = await listWorldCharacters({
      worldId: id,
      callerUserId: userId,
      ...(queryParsed.data.status ? { statusFilter: queryParsed.data.status } : {}),
    });

    return reply.send({ characters: rows });
  });
};

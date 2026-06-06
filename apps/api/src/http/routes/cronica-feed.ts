/**
 * cronica-feed — unified guild bitácora feed endpoint.
 *
 * bitacora-gremio W4, ADR-1, ADR-3.
 * REQ-GREM-FD-01, REQ-GREM-FD-02, REQ-GREM-FD-03, REQ-GREM-FD-04.
 *
 * GET /worlds/:worldId/cronica-feed
 *   Query params:
 *     tag?    — filter by KNOWLEDGE_TAGS tag (validated, 400 if invalid)
 *     source? — 'gremio' | 'dm' | 'evento' (facet filter)
 *     limit?  — default 50, max 200
 *     offset? — default 0
 *
 * Auth: world member required (403 for non-members).
 * Visibility: each source filtered by its OWN helper BEFORE merge (ADR-3 — no leak).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getWorldAccess } from '../../use-cases/auth/get-world-access.js';
import { aggregateGuildFeed, type FeedSource } from '../../use-cases/world/aggregate-guild-feed.js';
import { isKnowledgeTag } from '@dungeon-hub/domain/world/codex';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const WorldParam = z.object({ worldId: z.string().uuid() });

const CronicaFeedQuery = z.object({
  tag: z.string().min(1).max(40).optional(),
  source: z.enum(['gremio', 'dm', 'evento']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const cronicaFeedRoute: FastifyPluginAsync = async (app) => {
  // GET /worlds/:worldId/cronica-feed
  app.get(
    '/worlds/:worldId/cronica-feed',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { worldId } = WorldParam.parse(request.params);
      const userId = request.user!.sub;

      // World access check — 403 for non-members (ADR-3 outer gate)
      const access = await getWorldAccess(worldId, userId);
      if (access === 'none') {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      const queryParsed = CronicaFeedQuery.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: queryParsed.error.issues });
      }
      const query = queryParsed.data;

      // Validate ?tag= against KNOWLEDGE_TAGS (REQ-GREM-FD-03)
      if (query.tag !== undefined && !isKnowledgeTag(query.tag)) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'CONTRIBUTION_TAG_INVALID', got: query.tag }],
        });
      }

      const result = await aggregateGuildFeed({
        worldId,
        access,
        userId,
        ...(query.tag !== undefined && { tag: query.tag }),
        ...(query.source !== undefined && { source: query.source as FeedSource }),
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      });

      return reply.code(200).send(result);
    },
  );
};

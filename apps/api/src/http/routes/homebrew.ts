import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getWorldAccess } from '../../use-cases/auth/get-world-access.js';
import { uploadHomebrewItems } from '../../use-cases/world/upload-homebrew-items.js';

const WorldParam = z.object({ worldId: z.string().uuid() });

const HomebrewItemBody = z.object({
  name: z.string().min(1).max(120),
  type: z.string().optional(),
  weight: z.number().min(0).optional(),
  data: z.record(z.unknown()).optional(),
});

const UploadItemsBody = z.object({
  items: z.array(HomebrewItemBody).min(1).max(200),
});

/**
 * Custom content via JSON upload — items only (MVP #3.8, DEC-1 locked
 * 2026-06-04: JSON upload, not visual authoring — server-side enforcement
 * already existed via `rulesProfile.sources`; this route is the missing
 * DM-facing way to populate it). Route stays thin: Zod → use-case → status
 * code (CLAUDE.md §3) — the upsert/enable-source logic lives in
 * upload-homebrew-items.ts.
 */
export const homebrewRoute: FastifyPluginAsync = async (app) => {
  // POST /worlds/:worldId/homebrew/items
  app.post(
    '/worlds/:worldId/homebrew/items',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { worldId } = WorldParam.parse(request.params);
      const parsed = UploadItemsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
      }
      const userId = request.user!.sub;

      // Same access-check shape as quests.ts: 'none' vs. 'player' both end
      // in 403, but the player case gets a role-specific message.
      const access = await getWorldAccess(worldId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (access !== 'gm') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Solo un GM puede subir contenido homebrew' });
      }

      const result = await uploadHomebrewItems(worldId, parsed.data.items);
      if (!result.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
      }

      return reply.code(201).send({
        source: result.source,
        created: result.created,
        updated: result.updated,
      });
    },
  );
};

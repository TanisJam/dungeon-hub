import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { users } from '../../infra/db/schema.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const DevModeBody = z.object({
  devMode: z.boolean(),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * Users self-management endpoints.
 *
 * POST /users/me/dev-mode — toggle/set the authenticated user's devMode flag.
 *
 * codex-knowledge B-0 gap closure: provides the server-side endpoint the
 * B-4 devMode toggle UI calls to persist the per-user devMode setting.
 * REQ-CK-DEV-01, REQ-CK-DEV-03. Design intent: FORK 5 (#1944).
 */
export const usersRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /users/me/dev-mode ------------------------------------------------
  // Sets users.devMode for the authenticated caller.
  // Auth required. Body: { devMode: boolean }. Returns { devMode: boolean }.
  app.post('/users/me/dev-mode', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = DevModeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ code: i.code, message: i.message, path: i.path })),
      });
    }

    const userId = request.user!.sub;
    const { devMode } = parsed.data;

    await db.update(users).set({ devMode }).where(eq(users.id, userId));

    return { devMode };
  });
};

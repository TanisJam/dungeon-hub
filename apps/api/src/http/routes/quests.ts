import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { quests } from '../../infra/db/schema.js';
import { getWorldAccess } from '../../use-cases/auth/get-world-access.js';
import {
  filterQuestsByAccess,
  listQuests,
  loadQuest,
  projectQuestForAccess,
} from '../../use-cases/world/load-quest.js';

const WorldParam = z.object({ worldId: z.string().uuid() });
const QuestParam = z.object({ questId: z.string().uuid() });

const STATUS = z.enum(['available', 'active', 'completed', 'abandoned']);

const CreateQuestBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(100000).nullable().optional(),
  dmNotes: z.string().max(100000).nullable().optional(),
  status: STATUS.optional(),
  visibility: z.enum(['public', 'dm-only']).optional(),
});

const UpdateQuestBody = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(100000).nullable().optional(),
    dmNotes: z.string().max(100000).nullable().optional(),
    status: STATUS.optional(),
    visibility: z.enum(['public', 'dm-only']).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

const ListQuestsQuery = z.object({
  status: STATUS.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const questsRoute: FastifyPluginAsync = async (app) => {
  // POST /worlds/:worldId/quests
  app.post(
    '/worlds/:worldId/quests',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { worldId } = WorldParam.parse(request.params);
      const parsed = CreateQuestBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
      }
      const body = parsed.data;
      const userId = request.user!.sub;

      const access = await getWorldAccess(worldId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (access !== 'gm') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Solo un GM puede crear quests' });
      }

      const [created] = await db
        .insert(quests)
        .values({
          worldId,
          title: body.title,
          description: body.description ?? null,
          dmNotes: body.dmNotes ?? null,
          ...(body.status && { status: body.status }),
          ...(body.visibility && { visibility: body.visibility }),
          authorUserId: userId,
        })
        .returning();

      return reply.code(201).send(created);
    },
  );

  // GET /worlds/:worldId/quests
  app.get(
    '/worlds/:worldId/quests',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { worldId } = WorldParam.parse(request.params);
      const query = ListQuestsQuery.parse(request.query);
      const userId = request.user!.sub;

      const access = await getWorldAccess(worldId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      const list = await listQuests({
        worldId,
        ...(query.status && { status: query.status }),
        ...(query.limit && { limit: query.limit }),
        ...(query.offset && { offset: query.offset }),
      });

      return { data: filterQuestsByAccess(list, access) };
    },
  );

  // GET /quests/:questId
  app.get(
    '/quests/:questId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { questId } = QuestParam.parse(request.params);
      const userId = request.user!.sub;

      const quest = await loadQuest(questId);
      if (!quest) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getWorldAccess(quest.worldId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      if (access !== 'gm' && quest.visibility === 'dm-only') {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }

      return projectQuestForAccess(quest, access);
    },
  );

  // PATCH /quests/:questId
  app.patch(
    '/quests/:questId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { questId } = QuestParam.parse(request.params);
      const parsed = UpdateQuestBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
      }
      const body = parsed.data;
      const userId = request.user!.sub;

      const quest = await loadQuest(questId);
      if (!quest) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getWorldAccess(quest.worldId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const updates: Partial<typeof quests.$inferInsert> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.dmNotes !== undefined) updates.dmNotes = body.dmNotes;
      if (body.status !== undefined) updates.status = body.status;
      if (body.visibility !== undefined) updates.visibility = body.visibility;

      const [updated] = await db
        .update(quests)
        .set(updates)
        .where(eq(quests.id, questId))
        .returning();
      return updated;
    },
  );

  // DELETE /quests/:questId
  app.delete(
    '/quests/:questId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { questId } = QuestParam.parse(request.params);
      const userId = request.user!.sub;

      const quest = await loadQuest(questId);
      if (!quest) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getWorldAccess(quest.worldId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      await db.delete(quests).where(eq(quests.id, questId));
      return reply.code(204).send();
    },
  );
};

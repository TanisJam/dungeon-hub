import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { journalEntries } from '../../infra/db/schema.js';
import { getMapAccess } from '../../use-cases/map/load-hex.js';
import {
  filterJournalByAccess,
  listJournalEntries,
  loadJournalEntry,
} from '../../use-cases/journal/load-entry.js';

const CampaignParam = z.object({ campaignId: z.string().uuid() });
const EntryParam = z.object({ entryId: z.string().uuid() });

const CreateEntryBody = z.object({
  title: z.string().min(1).max(300),
  body: z.string().max(100000).nullable().optional(),
  visibility: z.enum(['public', 'dm-only']).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

const UpdateEntryBody = z
  .object({
    title: z.string().min(1).max(300).optional(),
    body: z.string().max(100000).nullable().optional(),
    visibility: z.enum(['public', 'dm-only']).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

const ListEntriesQuery = z.object({
  tag: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const journalRoute: FastifyPluginAsync = async (app) => {
  // POST /campaigns/:campaignId/journal-entries
  app.post(
    '/campaigns/:campaignId/journal-entries',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const body = CreateEntryBody.parse(request.body);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (access !== 'gm') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Solo un GM puede crear entries' });
      }

      const [created] = await db
        .insert(journalEntries)
        .values({
          campaignId,
          title: body.title,
          body: body.body ?? null,
          ...(body.visibility && { visibility: body.visibility }),
          ...(body.tags && { tags: body.tags }),
          authorUserId: userId,
        })
        .returning();

      return reply.code(201).send(created);
    },
  );

  // GET /campaigns/:campaignId/journal-entries
  app.get(
    '/campaigns/:campaignId/journal-entries',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { campaignId } = CampaignParam.parse(request.params);
      const query = ListEntriesQuery.parse(request.query);
      const userId = request.user!.sub;

      const access = await getMapAccess(campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      const list = await listJournalEntries({
        campaignId,
        ...(query.tag && { tag: query.tag }),
        ...(query.limit && { limit: query.limit }),
        ...(query.offset && { offset: query.offset }),
      });

      return { data: filterJournalByAccess(list, access) };
    },
  );

  // GET /journal-entries/:entryId
  app.get(
    '/journal-entries/:entryId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { entryId } = EntryParam.parse(request.params);
      const userId = request.user!.sub;

      const entry = await loadJournalEntry(entryId);
      if (!entry) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(entry.campaignId, userId);
      if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

      if (access !== 'gm' && entry.visibility === 'dm-only') {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }

      return entry;
    },
  );

  // PATCH /journal-entries/:entryId
  app.patch(
    '/journal-entries/:entryId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { entryId } = EntryParam.parse(request.params);
      const body = UpdateEntryBody.parse(request.body);
      const userId = request.user!.sub;

      const entry = await loadJournalEntry(entryId);
      if (!entry) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(entry.campaignId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const updates: Partial<typeof journalEntries.$inferInsert> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.body !== undefined) updates.body = body.body;
      if (body.visibility !== undefined) updates.visibility = body.visibility;
      if (body.tags !== undefined) updates.tags = body.tags;

      const [updated] = await db
        .update(journalEntries)
        .set(updates)
        .where(eq(journalEntries.id, entryId))
        .returning();
      return updated;
    },
  );

  // DELETE /journal-entries/:entryId
  app.delete(
    '/journal-entries/:entryId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { entryId } = EntryParam.parse(request.params);
      const userId = request.user!.sub;

      const entry = await loadJournalEntry(entryId);
      if (!entry) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getMapAccess(entry.campaignId, userId);
      if (access !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      await db.delete(journalEntries).where(eq(journalEntries.id, entryId));
      return reply.code(204).send();
    },
  );
};

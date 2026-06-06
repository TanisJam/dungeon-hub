/**
 * contributions — guild_contributions endpoints (append-only).
 *
 * codex-knowledge Slice 1, Sub-slice A.
 * Design: FORK 4 (#1944) — guild_contributions from day 1, append-only invariant.
 * ADR-1 (#1948): new table, NOT overloading worldEvents.
 *
 * APPEND-ONLY INVARIANT: NO PATCH-content route, NO DELETE route.
 * Only sealedStatus/sealedBy/sealedAt/visibility MAY be updated.
 *
 * Endpoints:
 *   POST   /worlds/:worldId/contributions        — create (any world member)
 *   GET    /worlds/:worldId/contributions        — list (visibility-filtered)
 *   POST   /contributions/:id/seal              — GM only (confirmed|debunked)
 *   POST   /contributions/:id/hide              — GM only (set visibility=personal)
 *   POST   /contributions/:id/visibility        — author or GM (promote only)
 *
 * REQ-CK-NOTE-01, NOTE-04, NOTE-05, NOTE-09, REQ-CK-GC-03, GC-04, GC-05,
 * REQ-CK-API-01, API-02, API-03, API-04, API-05, API-06.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, arrayContains, desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { guildContributions } from '../../infra/db/schema.js';
import { getWorldAccess } from '../../use-cases/auth/get-world-access.js';
import {
  validateContribution,
  canSeal,
  applySeal,
  isVisibleTo,
} from '@dungeon-hub/domain/world/contribution';
import { isKnowledgeTag } from '@dungeon-hub/domain/world/codex';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const WorldParam = z.object({ worldId: z.string().uuid() });
const ContribParam = z.object({ id: z.string().uuid() });

const CONTRIBUTION_VISIBILITY = z.enum(['personal', 'guild', 'canonical']);

const CreateContributionBody = z.object({
  contributionType: z.string().min(1).max(60),
  body: z.string().max(100000),
  refEntityKind: z.string().min(1).max(60).nullable().optional(),
  refEntityId: z.string().min(1).max(200).nullable().optional(),
  visibility: CONTRIBUTION_VISIBILITY.optional(),
  occurredAt: z.string().datetime().optional(),
  /** Optional tags ⊆ KNOWLEDGE_TAGS. Write-at-create only (ADR-2, REQ-GREM-CT-02). */
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
});

const SealBody = z.object({
  sealedStatus: z.enum(['confirmed', 'debunked']),
});

const VisibilityBody = z.object({
  visibility: z.enum(['guild', 'canonical']),
});

const ListContributionsQuery = z.object({
  refEntityKind: z.string().min(1).optional(),
  refEntityId: z.string().min(1).optional(),
  authorUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  /** Filter contributions whose tags[] contains this value. Must be ⊆ KNOWLEDGE_TAGS. */
  tag: z.string().min(1).max(40).optional(),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const contributionsRoute: FastifyPluginAsync = async (app) => {
  // ── POST /worlds/:worldId/contributions ───────────────────────────────────
  // Create a contribution. Any world member may create for their own authorUserId.
  // visibility defaults to 'personal' (REQ-CK-GC-04, SCENARIO GC-B).
  // REQ-CK-NOTE-01, REQ-CK-API-01, API-02, API-03.
  app.post(
    '/worlds/:worldId/contributions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { worldId } = WorldParam.parse(request.params);
      const userId = request.user!.sub;

      const access = await getWorldAccess(worldId, userId);
      if (access === 'none') {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      const parsed = CreateContributionBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
      }
      const body = parsed.data;

      // Domain validation (pure function)
      const domainResult = validateContribution({
        contributionType: body.contributionType,
        body: body.body,
        refEntityKind: body.refEntityKind ?? null,
        refEntityId: body.refEntityId ?? null,
        visibility: body.visibility ?? 'personal',
        ...(body.tags !== undefined && { tags: body.tags }),
      });
      if (!domainResult.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: domainResult.issues });
      }

      const [created] = await db
        .insert(guildContributions)
        .values({
          worldId,
          authorUserId: userId,
          contributionType: body.contributionType,
          body: body.body,
          refEntityKind: body.refEntityKind ?? null,
          refEntityId: body.refEntityId ?? null,
          visibility: body.visibility ?? 'personal',
          tags: body.tags ?? [],
          ...(body.occurredAt && { occurredAt: new Date(body.occurredAt) }),
        })
        .returning();

      return reply.code(200).send(created);
    },
  );

  // ── GET /worlds/:worldId/contributions ────────────────────────────────────
  // List contributions visible to the requesting user.
  // Visibility is filtered per isVisibleTo domain function.
  // Supports refEntityKind/refEntityId for codex entity page reverse-lookup.
  // NEVER JOIN-hard on refEntityId — tolerate dangling refs (REQ-CK-RT-05, GC-D).
  // REQ-CK-NOTE-09, REQ-CK-GC-06, REQ-CK-API-01, API-02.
  app.get(
    '/worlds/:worldId/contributions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { worldId } = WorldParam.parse(request.params);
      const query = ListContributionsQuery.parse(request.query);
      const userId = request.user!.sub;

      const access = await getWorldAccess(worldId, userId);
      if (access === 'none') {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      const viewerRole: 'gm' | 'player' = access === 'gm' ? 'gm' : 'player';
      const limit = query.limit ?? 50;
      const offset = ((query.page ?? 1) - 1) * limit;

      // Validate ?tag= against KNOWLEDGE_TAGS before querying (REQ-GREM-CT-03)
      if (query.tag !== undefined && !isKnowledgeTag(query.tag)) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'CONTRIBUTION_TAG_INVALID', got: query.tag }],
        });
      }

      // Build base conditions
      const conditions = [eq(guildContributions.worldId, worldId)];
      if (query.refEntityKind) {
        conditions.push(eq(guildContributions.refEntityKind, query.refEntityKind));
      }
      if (query.refEntityId) {
        conditions.push(eq(guildContributions.refEntityId, query.refEntityId));
      }
      if (query.authorUserId) {
        conditions.push(eq(guildContributions.authorUserId, query.authorUserId));
      }
      // GIN tag filter — arrayContains(tags, [tag]) mirrors journal + world_events pattern
      if (query.tag) {
        conditions.push(arrayContains(guildContributions.tags, [query.tag]));
      }

      // Load rows — no hard join on refEntityId (tolerate dangling)
      const rows = await db
        .select()
        .from(guildContributions)
        .where(and(...conditions))
        .orderBy(desc(guildContributions.occurredAt))
        .limit(limit)
        .offset(offset);

      // Filter by visibility (domain pure function per row)
      const visible = rows.filter((row) =>
        isVisibleTo(
          {
            visibility: row.visibility as 'personal' | 'guild' | 'canonical',
            authorUserId: row.authorUserId,
            sealedStatus: row.sealedStatus as 'confirmed' | 'debunked' | null,
          },
          { userId, role: viewerRole },
        ),
      );

      return reply.code(200).send({ rows: visible, total: visible.length });
    },
  );

  // ── POST /contributions/:id/seal ─────────────────────────────────────────
  // World-GM seals a contribution (confirmed|debunked). Last-write-wins.
  // Uses domain canSeal + applySeal (pure functions).
  // REQ-CK-NOTE-05, REQ-CK-GC-05, SCENARIO GC-C, NOTE-D, NOTE-E.
  app.post(
    '/contributions/:id/seal',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ContribParam.parse(request.params);
      const userId = request.user!.sub;

      const parsed = SealBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
      }

      const rows = await db
        .select()
        .from(guildContributions)
        .where(eq(guildContributions.id, id))
        .limit(1);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const contrib = rows[0]!;

      // Check world membership + GM role
      const access = await getWorldAccess(contrib.worldId, userId);
      if (!canSeal(access === 'gm' ? 'gm' : 'player')) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      const sealedAt = new Date();
      const sealed = applySeal(
        {
          id: contrib.id,
          body: contrib.body,
          authorUserId: contrib.authorUserId,
          contributionType: contrib.contributionType,
          visibility: contrib.visibility as 'personal' | 'guild' | 'canonical',
          sealedStatus: contrib.sealedStatus as 'confirmed' | 'debunked' | null,
          sealedBy: contrib.sealedBy,
          sealedAt: contrib.sealedAt,
        },
        parsed.data.sealedStatus,
        userId,
        sealedAt,
      );

      const [updated] = await db
        .update(guildContributions)
        .set({
          sealedStatus: sealed.sealedStatus,
          sealedBy: sealed.sealedBy,
          sealedAt: sealed.sealedAt,
        })
        .where(eq(guildContributions.id, id))
        .returning();

      return reply.code(200).send(updated);
    },
  );

  // ── POST /contributions/:id/hide ──────────────────────────────────────────
  // GM collapses contribution to personal visibility. DM visibility valve.
  // REQ-CK-NOTE-05, SCENARIO NOTE-F.
  app.post(
    '/contributions/:id/hide',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ContribParam.parse(request.params);
      const userId = request.user!.sub;

      const rows = await db
        .select()
        .from(guildContributions)
        .where(eq(guildContributions.id, id))
        .limit(1);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const contrib = rows[0]!;

      const access = await getWorldAccess(contrib.worldId, userId);
      if (access !== 'gm') {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      const [updated] = await db
        .update(guildContributions)
        .set({ visibility: 'personal' })
        .where(eq(guildContributions.id, id))
        .returning();

      return reply.code(200).send(updated);
    },
  );

  // ── POST /contributions/:id/visibility ────────────────────────────────────
  // Author or GM promotes visibility (personal→guild or personal/guild→canonical).
  // Non-GM MUST NOT demote from guild back to personal.
  // REQ-CK-NOTE-04, SCENARIO NOTE-C.
  app.post(
    '/contributions/:id/visibility',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ContribParam.parse(request.params);
      const userId = request.user!.sub;

      const parsed = VisibilityBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
      }

      const rows = await db
        .select()
        .from(guildContributions)
        .where(eq(guildContributions.id, id))
        .limit(1);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const contrib = rows[0]!;

      const access = await getWorldAccess(contrib.worldId, userId);
      const isGm = access === 'gm';
      const isAuthor = contrib.authorUserId === userId;

      if (!isGm && !isAuthor) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      // Non-GM cannot demote (promotion-only for non-GM — REQ-CK-NOTE-04)
      // guild accepts: 'guild' | 'canonical' (both are promotions from personal)
      // No demotion check needed since VisibilityBody only allows guild|canonical

      const [updated] = await db
        .update(guildContributions)
        .set({ visibility: parsed.data.visibility })
        .where(eq(guildContributions.id, id))
        .returning();

      return reply.code(200).send(updated);
    },
  );

  // NOTE: NO PATCH /contributions/:id route (append-only invariant, REQ-CK-GC-03, API-06).
  // NOTE: NO DELETE /contributions/:id route (append-only invariant).
};

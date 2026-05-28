/**
 * /encounters routes — initiative tracker (SDD encuentros-v3).
 *
 * Gating:
 *   - POST / PATCH / advance-turn: caller MUST be GM (campaign_members.role='gm').
 *   - GET endpoints: caller MUST be a member of the campaign (gm or player).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { campaignMembers, encounters } from '../../infra/db/schema.js';
import { createEncounter } from '../../use-cases/encounters/create-encounter.js';
import { listCampaignEncounters } from '../../use-cases/encounters/list-campaign-encounters.js';
import { loadEncounter } from '../../use-cases/encounters/load-encounter.js';
import { advanceEncounterTurn } from '../../use-cases/encounters/advance-encounter-turn.js';
import { patchCombatant } from '../../use-cases/encounters/patch-combatant.js';

const CreateBody = z.object({
  campaignId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  name: z.string().min(1),
  combatants: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: z.enum(['pc', 'npc']),
        characterId: z.string().uuid().optional(),
        initiative: z.number().int(),
        hpCurrent: z.number().int().nonnegative(),
        hpMax: z.number().int().positive(),
      }),
    )
    .min(1),
});

const ListQuery = z.object({ campaignId: z.string().uuid() });
const ParamsWithId = z.object({ id: z.string().uuid() });
const ParamsWithIdAndCid = z.object({
  id: z.string().uuid(),
  cid: z.string().uuid(),
});
const AdvanceBody = z.object({ version: z.number().int().nonnegative() });
const PatchCombatantBody = z.object({ hpCurrent: z.number().int().nonnegative() });

async function memberRole(
  campaignId: string,
  userId: string,
): Promise<'gm' | 'player' | null> {
  const rows = await db
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0]!.role as 'gm' | 'player';
}

export const encountersRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /encounters ---------------------------------------------------
  app.post('/encounters', { preHandler: app.authenticate }, async (request, reply) => {
    const body = CreateBody.parse(request.body);
    const userId = request.user!.sub;
    const role = await memberRole(body.campaignId, userId);
    if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

    const created = await createEncounter({
      campaignId: body.campaignId,
      sessionId: body.sessionId ?? null,
      name: body.name,
      combatants: body.combatants.map((c) => ({
        name: c.name,
        kind: c.kind,
        characterId: c.characterId ?? null,
        initiative: c.initiative,
        hpCurrent: c.hpCurrent,
        hpMax: c.hpMax,
      })),
    });
    return reply.code(201).send(created);
  });

  // ---- GET /encounters?campaignId=… ---------------------------------------
  app.get('/encounters', { preHandler: app.authenticate }, async (request, reply) => {
    const { campaignId } = ListQuery.parse(request.query);
    const userId = request.user!.sub;
    const role = await memberRole(campaignId, userId);
    if (role === null) return reply.code(403).send({ error: 'FORBIDDEN' });

    const data = await listCampaignEncounters(campaignId);
    return { data };
  });

  // ---- GET /encounters/:id ------------------------------------------------
  app.get('/encounters/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const encounter = await loadEncounter(id);
    if (!encounter) return reply.code(404).send({ error: 'NOT_FOUND' });

    const userId = request.user!.sub;
    const role = await memberRole(encounter.campaignId, userId);
    if (role === null) return reply.code(403).send({ error: 'FORBIDDEN' });

    return encounter;
  });

  // ---- POST /encounters/:id/advance-turn ----------------------------------
  app.post(
    '/encounters/:id/advance-turn',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);
      const { version } = AdvanceBody.parse(request.body);
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await advanceEncounterTurn(id, version);
      if (!result.ok) {
        if (result.code === 'NOT_FOUND') return reply.code(404).send({ error: 'NOT_FOUND' });
        return reply.code(409).send({ error: 'VERSION_CONFLICT' });
      }
      return result.encounter;
    },
  );

  // ---- PATCH /encounters/:id/combatants/:cid ------------------------------
  app.patch(
    '/encounters/:id/combatants/:cid',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, cid } = ParamsWithIdAndCid.parse(request.params);
      const body = PatchCombatantBody.parse(request.body);
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await patchCombatant({
        encounterId: id,
        combatantId: cid,
        hpCurrent: body.hpCurrent,
      });
      if (!result.ok) return reply.code(404).send({ error: 'NOT_FOUND' });
      return { hpCurrent: result.hpCurrent, newVersion: result.newVersion };
    },
  );
};

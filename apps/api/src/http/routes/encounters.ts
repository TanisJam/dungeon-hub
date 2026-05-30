/**
 * /encounters routes — initiative tracker (SDD encuentros-v3).
 *
 * Gating:
 *   - POST / PATCH / advance-turn: caller MUST be GM (campaign_members.role='gm').
 *   - GET endpoints: caller MUST be a member of the campaign (gm or player).
 *   - POST /:id/actions/attack: caller MUST own the attacker character (or be GM).
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
import { performWeaponAttack } from '../../use-cases/encounters/perform-weapon-attack.js';

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

/**
 * POST /encounters/:id/actions/attack — engine action pipeline Slice 1 (read-only).
 *
 * REQ-ATK-READONLY-01: no DB writes. Returns {toHit, damage, rollMode}.
 * REQ-ATK-NULLSAFE-01: Zod validates required fields (CLAUDE.md §6).
 */
const AttackActionBodySchema = z.object({
  attackerId: z.string().uuid(),
  targetId: z.string().uuid(),
  weaponInstanceId: z.string().uuid(),
  activeConditions: z.array(z.string()).optional(),
});

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

  // ---- POST /encounters/:id/actions/attack --------------------------------
  // Engine action pipeline Slice 1 — read-only; see design ADR-8/ADR-9.
  app.post(
    '/encounters/:id/actions/attack',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      // Parse body — Zod validation failure → 400 VALIDATION_FAILED (CLAUDE.md §6).
      const bodyResult = AttackActionBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { attackerId, targetId, weaponInstanceId, activeConditions } = bodyResult.data;
      const userId = request.user!.sub;

      // Load encounter to check campaign membership for the GM/player gate.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      const role = await memberRole(encRow.campaignId, userId);
      if (role === null) return reply.code(403).send({ error: 'FORBIDDEN' });

      // Delegate to use-case (ownership + turn + active guards are inside).
      const result = await performWeaponAttack({
        encounterId: id,
        attackerId,
        targetId,
        weaponInstanceId,
        ...(activeConditions !== undefined ? { activeConditions } : {}),
        callerId: userId,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'FORBIDDEN':
            return reply.code(403).send({ error: 'FORBIDDEN' });
          case 'NOT_YOUR_TURN':
            return reply.code(409).send({ error: 'NOT_YOUR_TURN' });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({
        toHit: result.toHit,
        damage: result.damage,
        rollMode: result.rollMode,
      });
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

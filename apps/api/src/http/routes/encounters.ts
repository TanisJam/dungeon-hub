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
import { performWeaponAttackApply } from '../../use-cases/encounters/perform-weapon-attack-apply.js';
import { performForcedCheck } from '../../use-cases/encounters/perform-forced-check.js';

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
        /** AC: required for NPC combatants (REQ-AC-CREATE-01); optional/ignored for PC (REQ-AC-CREATE-02). */
        ac: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .superRefine((combatants, ctx) => {
      // REQ-AC-CREATE-01: NPC combatants MUST supply ac at creation time.
      // REQ-AC-CREATE-02: PC combatants may omit ac; if provided it is silently ignored.
      for (let i = 0; i < combatants.length; i++) {
        const c = combatants[i]!;
        if (c.kind === 'npc' && c.ac === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'AC is required for NPC combatants',
            path: [i, 'ac'],
            params: { code: 'AC_REQUIRED_FOR_NPC' },
          });
        }
      }
    }),
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
  /**
   * Caller-asserted per-action decisions (REQ-SA-API-01).
   * Keys: 'sneakAttackFirstThisTurn', 'sneakAttackSpatialAssert', etc.
   * Absence = no assertions → all runtimeDecision leaves evaluate to false.
   * Additive and backwards-compatible: existing callers may omit this field.
   */
  runtimeDecisions: z.record(z.string(), z.boolean()).optional(),
});

/**
 * POST /encounters/:id/actions/attack/apply — engine mutation slice (FIRST mutation).
 *
 * GM-only. Server-authoritative: rolls d20, resolves target AC, derives DiceExpr,
 * rolls damage with crypto RNG, clamps HP, persists atomically.
 *
 * REQ-ROUTE-BODY-01: `crit` REMOVED — server derives crit from rollToHit.
 * REQ-ATK-APPLY-02: client supplies NO damage or crit value — server derives both.
 * REQ-ATK-VERSION-01: optimistic CAS — version mismatch → 409 VERSION_CONFLICT.
 * REQ-ATK-AUTH-01: GM-only (memberRole check).
 */
const AttackApplyBody = z.object({
  attackerId: z.string().uuid(),
  targetId: z.string().uuid(),
  weaponInstanceId: z.string().uuid(),
  /**
   * Caller-asserted runtime decisions — open boolean map (ADR-7: no per-key Zod, open record).
   * Known keys (Slice 2b+):
   *   sneakAttackFirstThisTurn: boolean — Rogue Sneak Attack eligible this turn
   *   stunningStrikeSpend: boolean     — Slice 3b-ii: Monk Stunning Strike ki spend
   */
  runtimeDecisions: z.record(z.string(), z.boolean()).optional(),
  /**
   * GM-supplied CON save modifier for an NPC target (mirrors npcSaveMod in ForcedCheckBody).
   * Required when stunningStrikeSpend=true AND the target is an NPC.
   * Omitting it returns 400 NO_TARGET_SAVE (pre-roll, nothing committed, no ki wasted).
   * PC targets ignore this field — server derives save mod from the character sheet.
   * Slice 3b-ii NPC fix (REQ-SS-NPC-01).
   */
  targetNpcSaveMod: z.number().int().optional(),
  /** Client's known encounter version — must match DB version for CAS. */
  version: z.number().int().nonnegative(),
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
    const bodyResult = CreateBody.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
    }
    const body = bodyResult.data;
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
        // REQ-AC-CREATE-03: ac threaded for NPC combatants. PC: undefined → null in use-case.
        ...(c.ac !== undefined ? { ac: c.ac } : {}),
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
      const { attackerId, targetId, weaponInstanceId, activeConditions, runtimeDecisions } = bodyResult.data;
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
        ...(runtimeDecisions !== undefined ? { runtimeDecisions } : {}),
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

  // ---- POST /encounters/:id/actions/attack/apply --------------------------
  // Engine mutation slice — GM-only, server-authoritative damage application.
  // REQ-ATK-AUTH-01: GM-only. REQ-ATK-VERSION-01: CAS version. REQ-ATK-APPLY-02: no client damage.
  app.post(
    '/encounters/:id/actions/attack/apply',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      // Zod validation — CLAUDE.md §6: 400 VALIDATION_FAILED on bad body.
      const bodyResult = AttackApplyBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { attackerId, targetId, weaponInstanceId, runtimeDecisions, targetNpcSaveMod, version } = bodyResult.data;
      const userId = request.user!.sub;

      // Load encounter for campaign membership check.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (REQ-ATK-AUTH-01).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await performWeaponAttackApply({
        encounterId: id,
        attackerId,
        targetId,
        weaponInstanceId,
        ...(runtimeDecisions !== undefined ? { runtimeDecisions } : {}),
        // exactOptionalPropertyTypes: only spread when defined (avoids passing undefined).
        ...(targetNpcSaveMod !== undefined ? { targetNpcSaveMod } : {}),
        version,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'FORBIDDEN':
            return reply.code(403).send({ error: 'FORBIDDEN' });
          case 'NOT_YOUR_TURN':
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'NO_TARGET_AC':
            // REQ-ROUTE-BODY-04: NO_TARGET_AC → 400 VALIDATION_FAILED with issues[].
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_TARGET_AC' }],
            });
          // Slice 3b-ii pre-roll guards — FAIL-FAST before any roll or mutation.
          // CLAUDE.md §6: 400 VALIDATION_FAILED with issues[{ code }].
          // Mirrors RESOURCE_OVER_LIMIT at characters.ts:3713.
          case 'STUNNING_STRIKE_NOT_MELEE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'STUNNING_STRIKE_NOT_MELEE' }],
            });
          case 'KI_EXHAUSTED':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'KI_EXHAUSTED' }],
            });
          // NPC target + stunningStrikeSpend + missing targetNpcSaveMod (REQ-SS-NPC-01).
          // Pre-roll: nothing rolled, nothing committed, no ki wasted. GM must supply CON save mod.
          case 'NO_TARGET_SAVE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_TARGET_SAVE' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // REQ-ROUTE-BODY-02: miss response — no damage fields.
      if (!result.hit) {
        return reply.code(200).send({
          hit: false,
          d20: result.d20,
          d20All: result.d20All,
          total: result.total,
          toHitBonus: result.toHitBonus,
          targetAc: result.targetAc,
        });
      }

      // REQ-ROUTE-BODY-03: hit response — includes all to-hit + damage fields.
      // Slice 3b-ii: stunningStrike block forwarded when present (omitted on non-spend — backward-compat).
      return reply.code(200).send({
        hit: true,
        crit: result.crit,
        d20: result.d20,
        d20All: result.d20All,
        total: result.total,
        toHitBonus: result.toHitBonus,
        targetAc: result.targetAc,
        rolledDamage: result.rolledDamage,
        perDie: result.perDie,
        newHp: result.newHp,
        damageType: result.damageType,
        ...(result.stunningStrike !== undefined ? { stunningStrike: result.stunningStrike } : {}),
      });
    },
  );

  // ---- POST /encounters/:id/actions/forced-check --------------------------
  // Engine saving throw + condition apply (engine-forced-check-3a).
  // GM-only. Server-authoritative: rolls save, applies conditions on fail.
  // REQ-API-01: thin route — Zod body → performForcedCheck → response.
  // NO encounters.version required/bumped (ADR-5 — append-only child table).
  const ForcedCheckBody = z.object({
    targetCombatantId: z.string().uuid(),
    ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
    dc: z.number().int().min(1).max(30),
    conditionOnFail: z.string().min(1),
    npcSaveMod: z.number().optional(),
    rollMode: z.enum(['normal', 'advantage', 'disadvantage']).optional().default('normal'),
    // Turn-anchor params (3b-i sweep — ADR-5). All optional for backward-compat.
    turnAnchorEntityId: z.string().uuid().optional(),
    turnAnchorBoundary: z.enum(['start', 'end']).optional(),
    turnsRemaining: z.number().int().min(0).optional(),
    /**
     * Slice 3b-ii ADR-4: when true AND turnAnchorEntityId provided, refreshes
     * turn-anchor fields on an already-present condition instead of silently skipping.
     * Defaults to false (undefined = no refresh — preserves 3a idempotency behavior).
     */
    refreshAnchorOnExisting: z.boolean().optional(),
  });

  app.post(
    '/encounters/:id/actions/forced-check',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      // Zod body validation — CLAUDE.md §6: 400 VALIDATION_FAILED on bad body.
      const bodyResult = ForcedCheckBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const {
        targetCombatantId,
        ability,
        dc,
        conditionOnFail,
        npcSaveMod,
        rollMode,
        turnAnchorEntityId,
        turnAnchorBoundary,
        turnsRemaining,
        refreshAnchorOnExisting,
      } = bodyResult.data;
      const userId = request.user!.sub;

      // Load encounter for campaign membership check.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (REQ-ATK-AUTH-01 pattern).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await performForcedCheck({
        encounterId: id,
        targetCombatantId,
        ability,
        dc,
        conditionOnFail,
        npcSaveMod: npcSaveMod ?? null,
        rollMode,
        turnAnchorEntityId: turnAnchorEntityId ?? null,
        // exactOptionalPropertyTypes: omit the key entirely when undefined (not pass undefined).
        ...(turnAnchorBoundary !== undefined ? { turnAnchorBoundary } : {}),
        turnsRemaining: turnsRemaining ?? null,
        // Slice 3b-ii ADR-4: optional refresh for re-stun (default false → 3a behavior preserved).
        ...(refreshAnchorOnExisting !== undefined ? { refreshAnchorOnExisting } : {}),
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          case 'NO_TARGET_SAVE':
            // CLAUDE.md §6: NO_TARGET_SAVE → 400 VALIDATION_FAILED with issues[].
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_TARGET_SAVE' }],
            });
          case 'UNKNOWN_CONDITION':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'UNKNOWN_CONDITION', condition: result.condition }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // Return discriminated response by outcome.
      if (result.outcome === 'autoFail') {
        return reply.code(200).send({
          outcome: 'autoFail',
          reason: result.reason,
          applied: result.applied,
        });
      }

      if (result.outcome === 'fail') {
        return reply.code(200).send({
          outcome: 'fail',
          save: result.save,
          applied: result.applied,
        });
      }

      // outcome === 'save'
      return reply.code(200).send({
        outcome: 'save',
        save: result.save,
        applied: result.applied,
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

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
import { applyCombatantEffect } from '../../use-cases/encounters/apply-combatant-effect.js';
import { removeCombatantEffect } from '../../use-cases/encounters/remove-combatant-effect.js';
import { removeCombatantCondition } from '../../use-cases/encounters/remove-combatant-condition.js';
import { performSpellHeal } from '../../use-cases/encounters/perform-spell-heal.js';
import { resolveAttackReaction } from '../../use-cases/encounters/resolve-attack-reaction.js';
import { performCastSpellApply } from '../../use-cases/encounters/perform-cast-spell-apply.js';
import { resolveCastReaction } from '../../use-cases/encounters/resolve-cast-reaction.js';

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
const AttackApplyBody = z
  .object({
    attackerId: z.string().uuid(),
    targetId: z.string().uuid(),
    weaponInstanceId: z.string().uuid(),
    /**
     * Caller-asserted runtime decisions — open boolean map (ADR-7: no per-key Zod, open record).
     * Known keys (Slice 2b+):
     *   sneakAttackFirstThisTurn: boolean — Rogue Sneak Attack eligible this turn
     *   stunningStrikeSpend: boolean     — Slice 3b-ii: Monk Stunning Strike ki spend
     *   divineSmiteSpend: boolean        — engine-divine-smite: Paladin Divine Smite slot spend
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
    /**
     * PHB p.85 — Divine Smite slot level (1-5). Required when divineSmiteSpend=true.
     * Top-level typed field (runtimeDecisions is boolean-only — ADR-7).
     * engine-divine-smite — REQ-DS-SCHEMA-01.
     */
    divineSmiteSlotLevel: z.number().int().min(1).max(5).optional(),
    /**
     * PHB p.85 — caller-asserted undead/fiend target for +1d8 bonus.
     * engine-divine-smite — REQ-DS-UNDEAD-01.
     */
    divineSmiteUndead: z.boolean().optional(),
    /** Client's known encounter version — must match DB version for CAS. */
    version: z.number().int().nonnegative(),
  })
  .refine(
    (b) => !(b.runtimeDecisions?.['divineSmiteSpend'] === true && b.divineSmiteSlotLevel === undefined),
    { message: 'divineSmiteSlotLevel required when divineSmiteSpend=true (PHB p.85 — slot must be specified)' },
  );

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
      const {
        attackerId,
        targetId,
        weaponInstanceId,
        runtimeDecisions,
        targetNpcSaveMod,
        divineSmiteSlotLevel,
        divineSmiteUndead,
        version,
      } = bodyResult.data;
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
        ...(divineSmiteSlotLevel !== undefined ? { divineSmiteSlotLevel } : {}),
        ...(divineSmiteUndead !== undefined ? { divineSmiteUndead } : {}),
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
          // Divine Smite pre-roll guards (engine-divine-smite, FAIL-FAST — PHB p.85).
          // CLAUDE.md §6: 400 VALIDATION_FAILED with issues[{ code }].
          case 'DIVINE_SMITE_NOT_AVAILABLE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'DIVINE_SMITE_NOT_AVAILABLE' }],
            });
          case 'DIVINE_SMITE_NOT_MELEE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'DIVINE_SMITE_NOT_MELEE' }],
            });
          case 'DIVINE_SMITE_SLOT_NOT_AVAILABLE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'DIVINE_SMITE_SLOT_NOT_AVAILABLE' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // REQ-ERB-FLOW-01: reactionOffered — suspend path, no commit.
      // PHB p.275: "When you are hit by an attack, you can use your reaction."
      // Client must call POST .../resolve-reaction to continue.
      if ('reactionOffered' in result) {
        return reply.code(200).send({
          hit: true,
          reactionOffered: result.reactionOffered,
        });
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
      // engine-divine-smite: divineSmite block forwarded when present (omitted on non-spend — REQ-DS-COMPAT-01).
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
        ...(result.divineSmite !== undefined ? { divineSmite: result.divineSmite } : {}),
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

  // ---- POST /encounters/:id/actions/apply-combatant-effect ---------------
  // Apply a named effect to a target combatant (idempotent). GM-only.
  // REQ-CEF-06: thin route — Zod body → applyCombatantEffect → response.
  // NO version/CAS coupling — append-only child table (ADR-5).
  const ApplyCombatantEffectBody = z.object({
    targetCombatantId: z.string().uuid(),
    effectName: z.string().min(1),
    sourceCombatantId: z.string().uuid().optional(),
    concentrationToken: z.string().optional(),
  });

  app.post(
    '/encounters/:id/actions/apply-combatant-effect',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = ApplyCombatantEffectBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { targetCombatantId, effectName, sourceCombatantId, concentrationToken } =
        bodyResult.data;
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (mirrors forced-check :488-500).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await applyCombatantEffect({
        encounterId: id,
        targetCombatantId,
        effectName,
        // exactOptionalPropertyTypes: conditional spread for optional uuid fields.
        ...(sourceCombatantId !== undefined ? { sourceCombatantId } : {}),
        ...(concentrationToken !== undefined ? { concentrationToken } : {}),
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({ applied: result.applied });
    },
  );

  // ---- POST /encounters/:id/actions/remove-combatant-effect ---------------
  // Remove a named effect from a target combatant. GM-only.
  // REQ-CEF-07: thin route — Zod body → removeCombatantEffect → response.
  // Zero rows deleted = 200 success (idempotent remove).
  const RemoveCombatantEffectBody = z.object({
    targetCombatantId: z.string().uuid(),
    effectName: z.string().min(1),
    sourceCombatantId: z.string().uuid().optional(),
  });

  app.post(
    '/encounters/:id/actions/remove-combatant-effect',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = RemoveCombatantEffectBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { targetCombatantId, effectName, sourceCombatantId } = bodyResult.data;
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate.
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await removeCombatantEffect({
        encounterId: id,
        targetCombatantId,
        effectName,
        ...(sourceCombatantId !== undefined ? { sourceCombatantId } : {}),
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({ removed: result.removed });
    },
  );

  // ---- DELETE /encounters/:id/combatants/:cid/conditions/:name -----------
  // Remove a named condition from a target combatant. GM-only, idempotent.
  // REQ-COND-DEL-01..04 (conditions-catalog Slice 1, ADR-4):
  //   - 200 {removed:n} on success (n=0 when condition was absent — idempotent)
  //   - 403 for non-DM callers
  //   - 404 for missing encounter or combatant (NOT for absent condition)
  //   - 409 for inactive encounter

  app.delete(
    '/encounters/:id/combatants/:cid/conditions/:name',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);
      const params = request.params as { cid: string; name: string };
      const cid = params.cid;
      const conditionName = params.name;

      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (mirrors apply-condition + remove-combatant-effect).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await removeCombatantCondition({
        encounterId: id,
        targetCombatantId: cid,
        conditionName,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({ removed: result.removed });
    },
  );

  // ---- POST /encounters/:id/actions/heal ----------------------------------
  // Engine mutation slice — GM-only, server-authoritative spell healing.
  // REQ-H-01: applyHealing clamp. REQ-H-14: CAS atomicity.
  // REQ-H-06: slot pre-check. REQ-H-09: spellcaster guard.
  const HealApplyBody = z.object({
    healerCombatantId: z.string().uuid(),
    targetCombatantId: z.string().uuid(),
    spellName: z.enum(['Cure Wounds', 'Healing Word']),
    slotLevel: z.number().int().min(1).max(9),
    version: z.number().int().nonnegative(),
  });

  app.post(
    '/encounters/:id/actions/heal',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      // Zod validation — CLAUDE.md §6: 400 VALIDATION_FAILED on bad body.
      const bodyResult = HealApplyBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }

      const { healerCombatantId, targetCombatantId, spellName, slotLevel, version } =
        bodyResult.data;
      const userId = request.user!.sub;

      // Load encounter for campaign membership check.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (ADR-6 — symmetric with attack/apply).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await performSpellHeal({
        encounterId: id,
        healerCombatantId,
        targetCombatantId,
        spellName,
        slotLevel,
        version,
        userId,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'NOT_YOUR_TURN':
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          case 'SLOT_NOT_AVAILABLE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'SLOT_NOT_AVAILABLE' }],
            });
          case 'HEALER_NOT_SPELLCASTER':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'HEALER_NOT_SPELLCASTER' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // ADR-5: response includes both rolled (PHB amount) and healed (effective delta).
      return reply.code(200).send({
        spell: result.spell,
        slotLevel: result.slotLevel,
        dice: result.dice,
        rolled: result.rolled,
        healed: result.healed,
        newHp: result.newHp,
        perDie: result.perDie,
      });
    },
  );

  // ---- POST /encounters/:id/actions/attack/resolve-reaction ---------------
  // engine-reaction-bus: two-step Shield reaction resolution.
  // GM-only. Server-authoritative: damage/toHitTotal/AC are read from server-stored
  // pending_reaction; the client supplies only reactionDecision + defenderCombatantId + version.
  // REQ-ERB-RESOLVE-01/02: cast-shield commits Shield+5 re-resolution; decline commits original.
  // REQ-ERB-ECON-01: REACTION_ALREADY_USED → 400 VALIDATION_FAILED.
  // REQ-ERB-AUTH-01: GM-only (mirrors attack/apply).
  const ResolveReactionBody = z.object({
    reactionDecision: z.enum(['cast-shield', 'decline']),
    defenderCombatantId: z.string().uuid(),
    version: z.number().int().nonnegative(),
  });

  app.post(
    '/encounters/:id/actions/attack/resolve-reaction',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = ResolveReactionBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { reactionDecision, defenderCombatantId, version } = bodyResult.data;
      const userId = request.user!.sub;

      // Load encounter for campaign membership check.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (REQ-ERB-AUTH-01 — mirrors attack/apply).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await resolveAttackReaction({
        encounterId: id,
        reactionDecision,
        defenderCombatantId,
        version,
        callerId: userId,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          case 'FORBIDDEN':
            return reply.code(403).send({ error: 'FORBIDDEN' });
          case 'REACTION_ALREADY_USED':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'REACTION_ALREADY_USED' }],
            });
          case 'SHIELD_NO_SLOT_AVAILABLE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'SHIELD_NO_SLOT_AVAILABLE' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({
        hit: result.hit,
        shieldCast: result.shieldCast,
        newAc: result.newAc,
        ...(result.newHp !== undefined ? { newHp: result.newHp } : {}),
      });
    },
  );

  // ---- POST /encounters/:id/actions/cast-spell ----------------------------
  // engine-spell-cast-suspend: interceptable Magic Missile cast action.
  // GM-only. Server-authoritative: rolls MM darts server-side, suspends into pending_cast
  // when defender can react with Shield (PC + free reaction + 1st-level slot), else atomic resolve.
  // REQ-SC-01..05: cast + suspend flow.
  // C-1: server-rolled damage NEVER in response body (stored in pending_cast server-side).
  // W-3: pending_cast write is version-guarded (no version bump on suspend).
  const CastSpellBody = z.object({
    casterId: z.string().uuid(),
    spellName: z.literal('Magic Missile'),
    slotLevel: z.number().int().min(1).max(9),
    targets: z.array(z.string().uuid()).min(1),
    version: z.number().int().nonnegative(),
  });

  app.post(
    '/encounters/:id/actions/cast-spell',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = CastSpellBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { casterId, spellName, slotLevel, targets, version } = bodyResult.data;
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (mirrors attack/apply — engine-spell-cast-suspend design).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await performCastSpellApply({
        encounterId: id,
        casterId,
        spellName,
        slotLevel,
        targets,
        version,
        userId,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'NOT_YOUR_TURN':
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          case 'MULTI_TARGET_NOT_SUPPORTED':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'MULTI_TARGET_NOT_SUPPORTED' }],
            });
          case 'INSUFFICIENT_SLOT':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'INSUFFICIENT_SLOT' }],
            });
          case 'CASTER_NOT_SPELLCASTER':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'CASTER_NOT_SPELLCASTER' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // Suspend path: castAnnounced (no HP/slot/version committed — C-1 server-authority).
      if (result.castAnnounced) {
        return reply.code(200).send({ castAnnounced: result.castAnnounced });
      }

      // Atomic path: damage result (NPC target / no defender slot / reaction used).
      return reply.code(200).send({ damage: result.damage });
    },
  );

  // ---- POST /encounters/:id/actions/cast-spell/resolve-reaction -----------
  // engine-spell-cast-suspend: Shield-vs-MM / Counterspell reaction resolution.
  // GM-only. Server reads damage from pending_cast (server-authoritative).
  // Body: { reactionDecision, defenderCombatantId, version } — NO damage fields (C-1).
  // ADR-4 (engine-counterspell): adds 'cast-counterspell' arm with counterspellerCombatantId + slotLevel.
  // REQ-SC-06: cast-shield → 0 force damage, both slots consumed.
  // REQ-SC-07: decline → full server-rolled force damage, caster slot consumed.
  // REQ-SC-08: REACTION_ALREADY_USED → 400.
  // REQ-CS-07: INSUFFICIENT_SLOT, COUNTERSPELLER_IS_CASTER, REACTION_ALREADY_USED → 400.
  const ResolveCastReactionBody = z.object({
    reactionDecision: z.enum(['cast-shield', 'decline', 'cast-counterspell']),
    defenderCombatantId: z.string().uuid(),
    version: z.number().int().nonnegative(),
    // cast-counterspell fields (optional for backward-compat; required when reactionDecision === 'cast-counterspell').
    counterspellerCombatantId: z.string().uuid().optional(),
    slotLevel: z.number().int().min(1).optional(),
    // Zod strips unknown keys — any client-injected damage/roll field is silently dropped (C-1).
  });

  app.post(
    '/encounters/:id/actions/cast-spell/resolve-reaction',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = ResolveCastReactionBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const {
        reactionDecision,
        defenderCombatantId,
        version,
        counterspellerCombatantId,
        slotLevel,
      } = bodyResult.data;
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (mirrors attack/resolve-reaction — engine-reaction-bus pattern).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await resolveCastReaction({
        encounterId: id,
        reactionDecision,
        defenderCombatantId,
        counterspellerCombatantId,
        counterspellSlotLevel: slotLevel,
        version,
        callerId: userId,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          case 'REACTION_ALREADY_USED':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'REACTION_ALREADY_USED' }],
            });
          case 'SHIELD_NO_SLOT_AVAILABLE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'SHIELD_NO_SLOT_AVAILABLE' }],
            });
          case 'INSUFFICIENT_SLOT':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'INSUFFICIENT_SLOT', slotLevel: result.slotLevel }],
            });
          case 'COUNTERSPELLER_IS_CASTER':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'COUNTERSPELLER_IS_CASTER' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({
        shieldCast: result.shieldCast,
        spelCountered: result.spelCountered,
        newHp: result.newHp,
        damageApplied: result.damageApplied,
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

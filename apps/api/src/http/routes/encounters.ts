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
import { campaignMembers, encounters, encounterCombatants } from '../../infra/db/schema.js';
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
import { activateRage } from '../../use-cases/encounters/activate-rage.js';
import { deactivateRage } from '../../use-cases/encounters/deactivate-rage.js';
import { passEncounterTurn } from '../../use-cases/encounters/pass-encounter-turn.js';
import { performAbilityCheck } from '../../use-cases/encounters/perform-ability-check.js';
import { rollCombatantInitiative } from '../../use-cases/encounters/roll-combatant-initiative.js';
import { performContest } from '../../use-cases/encounters/perform-contest.js';
import { ALL_SKILLS } from '@dungeon-hub/domain/character/sheet';

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
        /**
         * engine-surprise-round1: GM-supplied surprise flag (PHB p.189 — caller-authoritative).
         * optional NOT nullable (B9 lesson): absence = not surprised. REQ-SUR-S1-01.
         */
        surprised: z.boolean().optional(),
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
const PatchCombatantBody = z
  .object({
    hpCurrent: z.number().int().nonnegative().optional(),
    /**
     * engine-surprise-round1: GM may set/clear surprised flag before firstTurnActed=true.
     * After firstTurnActed=true → use-case returns SURPRISED_NOT_EDITABLE (post-design #2256).
     * optional NOT nullable (B9 lesson). REQ-SUR-S1-01.
     */
    surprised: z.boolean().optional(),
  })
  .superRefine((b, ctx) => {
    if (b.hpCurrent === undefined && b.surprised === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of hpCurrent or surprised must be provided',
        params: { code: 'PATCH_BODY_EMPTY' },
      });
    }
  });

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
 * Owner-or-GM gate (C2). Server-authoritative: rolls d20, resolves target AC, derives
 * DiceExpr, rolls damage with crypto RNG, clamps HP, persists atomically.
 * A campaign member may attack with a combatant they own (assertCombatantOwnerOrGm);
 * the GM may attack with any combatant.
 *
 * REQ-ROUTE-BODY-01: `crit` REMOVED — server derives crit from rollToHit.
 * REQ-ATK-APPLY-02: client supplies NO damage or crit value — server derives both.
 * REQ-ATK-VERSION-01: optimistic CAS — version mismatch → 409 VERSION_CONFLICT.
 * REQ-ATK-AUTH-01: owner-OR-GM gate — member attacks own combatant; GM attacks any.
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
    /**
     * PHB p.48 — Reckless Attack declaration (Barbarian).
     * true = player declared reckless on this attack; server inserts RecklessAttacking
     * condition inside the CAS tx (idempotency-guarded SELECT-before-INSERT).
     * engine-barbarian-dsl-2 — REQ-API-02.
     */
    reckless: z.boolean().optional(),
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
        // engine-surprise-round1: thread surprised flag when provided (REQ-SUR-S1-01).
        ...(c.surprised !== undefined ? { surprised: c.surprised } : {}),
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

    // REQ-WCO-WEB-08: surface the caller's campaign role so the web client can
    // gate GM-only controls (TurnControlsIsland) without a second round-trip.
    // `role` is already computed above — this is not new business logic.
    return { ...encounter, callerRole: role };
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
          case 'ACTOR_INCAPACITATED':
            // engine-incapacitated-gating — REQ-INC-02 (PHB p.290). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_INCAPACITATED' }],
            });
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
        reckless,
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

      // C2 gate relaxation (REQ-WCA-API-01): member-with-ownership gate replaces GM-only.
      // Non-members (role === null) are rejected here before use-case entry.
      // Players are allowed through — the use-case enforces per-combatant ownership via
      // assertCombatantOwnerOrGm. GMs remain unaffected (helper short-circuits for gm).
      const role = await memberRole(encRow.campaignId, userId);
      if (role === null) return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await performWeaponAttackApply({
        encounterId: id,
        attackerId,
        targetId,
        weaponInstanceId,
        callerId: userId,
        callerRole: role,
        ...(runtimeDecisions !== undefined ? { runtimeDecisions } : {}),
        // exactOptionalPropertyTypes: only spread when defined (avoids passing undefined).
        ...(targetNpcSaveMod !== undefined ? { targetNpcSaveMod } : {}),
        ...(divineSmiteSlotLevel !== undefined ? { divineSmiteSlotLevel } : {}),
        ...(divineSmiteUndead !== undefined ? { divineSmiteUndead } : {}),
        ...(reckless !== undefined ? { reckless } : {}),
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
          // C2 — REQ-WCA-API-02: player attacked a PC target (defense-in-depth guard).
          // Category error (not a value mismatch) → no expectedCount/gotCount (CLAUDE.md §6).
          // Mirrors NO_TARGET_AC mapping above.
          case 'TARGET_NOT_NPC':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'TARGET_NOT_NPC' }],
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
          case 'ACTOR_INCAPACITATED':
            // engine-incapacitated-gating — REQ-INC-02 (PHB p.290). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_INCAPACITATED' }],
            });
          case 'ACTOR_SURPRISED':
            // engine-surprise-round1 — REQ-SUR-S2-02 (PHB p.189). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_SURPRISED' }],
            });
          case 'ACTION_ALREADY_USED':
            // engine-action-economy — REQ-AE-06 (PHB p.198). Attack action already spent this turn.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTION_ALREADY_USED' }],
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
      // engine-concentration-break-damage: concentrationSave forwarded when present (REQ-CB-12).
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
        ...(result.concentrationSave !== undefined ? { concentrationSave: result.concentrationSave } : {}),
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
      // engine-resist-immunity C-8: include skippedImmune[] when present (transparency field).
      if (result.outcome === 'autoFail') {
        return reply.code(200).send({
          outcome: 'autoFail',
          reason: result.reason,
          applied: result.applied,
          ...(result.skippedImmune !== undefined && result.skippedImmune.length > 0
            ? { skippedImmune: result.skippedImmune }
            : {}),
        });
      }

      if (result.outcome === 'fail') {
        return reply.code(200).send({
          outcome: 'fail',
          save: result.save,
          applied: result.applied,
          ...(result.skippedImmune !== undefined && result.skippedImmune.length > 0
            ? { skippedImmune: result.skippedImmune }
            : {}),
        });
      }

      // outcome === 'save'
      return reply.code(200).send({
        outcome: 'save',
        save: result.save,
        applied: result.applied,
        ...(result.skippedImmune !== undefined && result.skippedImmune.length > 0
          ? { skippedImmune: result.skippedImmune }
          : {}),
      });
    },
  );

  // ---- POST /encounters/:id/actions/apply-combatant-effect ---------------
  // Apply a named effect to a target combatant (idempotent). GM-only.
  // REQ-CEF-06: thin route — Zod body → applyCombatantEffect → response.
  // NO version/CAS coupling — append-only child table (ADR-5).
  // REQ-CONC-01/06: concentrationToken is NOT accepted from the client — server-generated only.
  // .strict() rejects any unknown field (concentrationToken or any client-fabricated field).
  const ApplyCombatantEffectBody = z
    .object({
      targetCombatantId: z.string().uuid(),
      effectName: z.string().min(1),
      sourceCombatantId: z.string().uuid().optional(),
    })
    .strict();

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
      const { targetCombatantId, effectName, sourceCombatantId } = bodyResult.data;
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

      // REQ-CONC-01: server mints the concentration token.
      const concentrationToken = globalThis.crypto.randomUUID();

      // ADR-2: resolve sourceCombatant → characterId BEFORE the use-case.
      // The use-case calls startConcentration if resolvedCharacterId is non-null (PC caster).
      // NPC casters (characterId=null) skip concentration tracking.
      let resolvedCharacterId: string | null = null;
      if (sourceCombatantId !== undefined) {
        const [combatantRow] = await db
          .select({ characterId: encounterCombatants.characterId })
          .from(encounterCombatants)
          .where(eq(encounterCombatants.id, sourceCombatantId))
          .limit(1);
        resolvedCharacterId = combatantRow?.characterId ?? null;
      }

      const result = await applyCombatantEffect({
        encounterId: id,
        targetCombatantId,
        effectName,
        // exactOptionalPropertyTypes: conditional spread for optional uuid fields.
        ...(sourceCombatantId !== undefined ? { sourceCombatantId } : {}),
        concentrationToken,
        ...(resolvedCharacterId !== null ? { resolvedCharacterId } : {}),
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

      return reply.code(200).send({ concentrationToken, applied: result.applied });
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
          case 'ACTOR_INCAPACITATED':
            // engine-incapacitated-gating — REQ-INC-04 (PHB p.290). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_INCAPACITATED' }],
            });
          case 'ACTOR_SURPRISED':
            // engine-surprise-round1 — REQ-SUR-S2-02 + REQ-SUR-S2-03 (PHB p.189). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_SURPRISED' }],
            });
          case 'ACTION_ALREADY_USED':
            // engine-action-economy — REQ-AE-02 (PHB p.230). Cure Wounds action already spent.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTION_ALREADY_USED' }],
            });
          case 'BONUS_ACTION_ALREADY_USED':
            // engine-action-economy — REQ-AE-03 (PHB p.250). Healing Word bonus action already spent.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'BONUS_ACTION_ALREADY_USED' }],
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
          case 'ACTOR_INCAPACITATED':
            // engine-incapacitated-gating — REQ-INC-05 (PHB p.290). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_INCAPACITATED' }],
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
          case 'ACTOR_INCAPACITATED':
            // engine-incapacitated-gating — REQ-INC-03 (PHB p.290). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_INCAPACITATED' }],
            });
          case 'ACTOR_SURPRISED':
            // engine-surprise-round1 — REQ-SUR-S2-02 (PHB p.189). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_SURPRISED' }],
            });
          case 'ACTION_ALREADY_USED':
            // engine-action-economy — REQ-AE-02 (PHB p.257). Cast action already spent this turn.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTION_ALREADY_USED' }],
            });
          case 'ACTOR_RAGING':
            // engine-rage — REQ-RAGE-06 (PHB p.48). Can't cast spells while raging.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_RAGING' }],
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
      // engine-concentration-break-damage: concentrationSave forwarded when present (REQ-CB-12).
      return reply.code(200).send({
        damage: result.damage,
        ...(result.concentrationSave !== undefined ? { concentrationSave: result.concentrationSave } : {}),
      });
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
    slotLevel: z.number().int().min(1).max(9).optional(),
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
          case 'ACTOR_INCAPACITATED':
            // engine-incapacitated-gating — REQ-INC-05 (PHB p.290). State-gate refusal.
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_INCAPACITATED' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({
        shieldCast: result.shieldCast,
        ...(result.spellCountered !== undefined ? { spellCountered: result.spellCountered } : {}),
        newHp: result.newHp,
        damageApplied: result.damageApplied,
        ...(result.concentrationSave !== undefined ? { concentrationSave: result.concentrationSave } : {}),
      });
    },
  );

  // ---- POST /encounters/:id/actions/activate-rage -------------------------
  // engine-rage: Barbarian Rage activation (PHB p.48). Owner-OR-GM.
  // Costs one bonus action + one barbarian:rage-uses charge. Breaks concentration.
  // REQ-RAGE-01, REQ-RAGE-02. REQ-WCR-ACT-01, REQ-WCR-ROUTE-01.
  const ActivateRageBody = z.object({
    ragerId: z.string().uuid(),
    version: z.number().int().nonnegative(),
  });

  app.post(
    '/encounters/:id/actions/activate-rage',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = ActivateRageBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { ragerId, version } = bodyResult.data;
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      const role = await memberRole(encRow.campaignId, userId);
      // Non-members (role === null) are rejected at the route level (membership gate only).
      // Owner-OR-GM resolution is delegated to the use-case via assertCombatantOwnerOrGm.
      if (role === null) return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await activateRage({ encounterId: id, ragerId, version, callerId: userId, callerRole: role });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'FORBIDDEN':
            return reply.code(403).send({ error: 'FORBIDDEN' });
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'NOT_YOUR_TURN':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          case 'ACTOR_INCAPACITATED':
          case 'ACTOR_SURPRISED':
          case 'BONUS_ACTION_ALREADY_USED':
          case 'RESOURCE_OVER_LIMIT':
          case 'RAGE_NOT_AVAILABLE':
          case 'RAGE_BLOCKED_BY_HEAVY_ARMOR':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: result.code }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({ ok: true });
    },
  );

  // ---- POST /encounters/:id/actions/deactivate-rage -----------------------
  // engine-rage: Barbarian voluntary Rage end (PHB p.48). Owner-OR-GM.
  // Costs one bonus action. Removes 'Raging' condition.
  // REQ-RAGE-10. REQ-WCR-DEACT-01, REQ-WCR-ROUTE-01.
  const DeactivateRageBody = z.object({
    ragerId: z.string().uuid(),
    version: z.number().int().nonnegative(),
  });

  app.post(
    '/encounters/:id/actions/deactivate-rage',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = DeactivateRageBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { ragerId, version } = bodyResult.data;
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      const role = await memberRole(encRow.campaignId, userId);
      // Non-members (role === null) are rejected at the route level (membership gate only).
      // Owner-OR-GM resolution is delegated to the use-case via assertCombatantOwnerOrGm.
      if (role === null) return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await deactivateRage({ encounterId: id, ragerId, version, callerId: userId, callerRole: role });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'FORBIDDEN':
            return reply.code(403).send({ error: 'FORBIDDEN' });
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'NOT_YOUR_TURN':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          case 'BONUS_ACTION_ALREADY_USED':
          case 'NOT_RAGING':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: result.code }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send({ ok: true });
    },
  );

  // ---- POST /encounters/:id/actions/pass-turn ------------------------------
  // web-combat-pass-turn C1: player passes own turn. Owner-OR-GM.
  // Body: { version } only — no combatantId (authz targets server-derived currentCombatantId).
  // PHB p.189 — a creature may take fewer actions and declare its turn complete.
  // REQ-WCPT-API-01, REQ-WCPT-API-03. ADR-2 (thin route, mirrors rage threading).

  const PassTurnBody = z.object({
    version: z.number().int().nonnegative(),
  });

  app.post(
    '/encounters/:id/actions/pass-turn',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      const bodyResult = PassTurnBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { version } = bodyResult.data;
      const userId = request.user!.sub;

      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      const role = await memberRole(encRow.campaignId, userId);
      // Non-members (role === null) are rejected at route level (membership gate only).
      // Owner-OR-GM resolution is delegated to use-case via assertCombatantOwnerOrGm.
      if (role === null) return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await passEncounterTurn({ encounterId: id, version, callerId: userId, callerRole: role });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND' });
          case 'FORBIDDEN':
            return reply.code(403).send({ error: 'FORBIDDEN' });
          case 'ENCOUNTER_NOT_ACTIVE':
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: result.code });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      return reply.code(200).send(result.encounter);
    },
  );

  // ---- POST /encounters/:id/actions/ability-check -------------------------
  // Engine ability check (actor polarity). GM-only. Server-authoritative.
  // B6 REQ-ROUTE-01..04: add check surface mirroring forced-check route pattern.
  // PHB p.174: ability check = d20 + relevant ability modifier >= DC.
  // PHB p.175: skill check = d20 + ability modifier + proficiency bonus (if proficient) >= DC.
  // PHB p.48: Raging barbarian gets advantage on STR checks (checkAbility:'str' leaf).
  const AbilityCheckBody = z.object({
    actorCombatantId: z.string().uuid(),
    ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
    dc: z.number().int().min(1).max(30),
    // REQ-ROUTE-02: skill enum derived from ALL_SKILLS (not hand-maintained literal).
    // PHB p.175: skills are a closed PHB list (18 skills).
    skill: z.enum(ALL_SKILLS as [string, ...string[]]).optional(),
    npcCheckMod: z.number().optional(),
    rollMode: z.enum(['normal', 'advantage', 'disadvantage']).optional().default('normal'),
  });

  app.post(
    '/encounters/:id/actions/ability-check',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      // Zod body validation — CLAUDE.md §6: 400 VALIDATION_FAILED on bad body.
      const bodyResult = AbilityCheckBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { actorCombatantId, ability, dc, skill, npcCheckMod, rollMode } = bodyResult.data;
      const userId = request.user!.sub;

      // Load encounter for GM membership check.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (REQ-ROUTE-01 — mirrors forced-check :566-567 pattern).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await performAbilityCheck({
        encounterId: id,
        actorCombatantId,
        ability,
        dc,
        ...(skill !== undefined ? { skill } : {}),
        npcCheckMod: npcCheckMod ?? null,
        rollMode,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          case 'NO_ACTOR_CHECK':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_ACTOR_CHECK' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // REQ-ROUTE-03: response shape — NO crit, NO applied[], NO autoFail.
      return reply.code(200).send({
        outcome: result.outcome,
        check: result.check,
      });
    },
  );

  // ---- POST /encounters/:id/actions/roll-initiative -------------------------
  // Server-side initiative roll (combatant polarity). GM-only. Server-authoritative.
  // B7 REQ-ROUTE-01..06: add initiative surface mirroring ability-check route pattern.
  // PHB p.189: initiative = d20 + DEX mod (ordering only, no DC, no success/fail).
  // PHB p.50:  Feral Instinct — barbarian L7+ has advantage on initiative rolls.
  const RollInitiativeBody = z.object({
    combatantId: z.string().uuid(),
    npcInitiativeMod: z.number().int().optional(),
    rollMode: z.enum(['normal', 'advantage', 'disadvantage']).optional().default('normal'),
  });

  app.post(
    '/encounters/:id/actions/roll-initiative',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      // Zod body validation — CLAUDE.md §6: 400 VALIDATION_FAILED on bad body.
      const bodyResult = RollInitiativeBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const { combatantId, npcInitiativeMod, rollMode } = bodyResult.data;
      const userId = request.user!.sub;

      // Load encounter for GM membership check.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (REQ-ROUTE-01 — mirrors ability-check :1476-1477 pattern).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const result = await rollCombatantInitiative({
        encounterId: id,
        combatantId,
        ...(npcInitiativeMod !== undefined ? { npcInitiativeMod } : {}),
        ...(rollMode !== undefined ? { rollMode } : {}),
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          case 'NO_ACTOR_INITIATIVE':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_ACTOR_INITIATIVE' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // REQ-ROUTE-03: response shape — NO success, NO dc, NO crit.
      return reply.code(200).send({
        initiative: result.initiative,
      });
    },
  );

  // ---- POST /encounters/:id/actions/contest --------------------------------
  // Two-actor contested check (grapple/shove/escape). GM-only. Server-authoritative.
  // B9 REQ-ROUTE-01..10: discriminated union on verb; shoveOutcome required iff shove.
  // PHB p.174: contests — both roll, higher wins.
  // PHB p.195: grapple/shove = one attack from Attack action; escape = full action.
  // PHB p.290: Grappled condition (speed=0, narrative-only until #513).
  const ContestBaseFields = {
    attackerCombatantId: z.string().uuid(),
    defenderCombatantId: z.string().uuid(),
    defenderSkill: z.enum(['athletics', 'acrobatics']),
    defenderAbility: z.enum(['str', 'dex']),
    npcAttackerCheckMod: z.number().optional(),
    npcDefenderCheckMod: z.number().optional(),
    attackerRollMode: z.enum(['normal', 'advantage', 'disadvantage']).optional().default('normal'),
    defenderRollMode: z.enum(['normal', 'advantage', 'disadvantage']).optional().default('normal'),
    version: z.number().int().nonnegative(),
  };
  const ContestBody = z.discriminatedUnion('verb', [
    z.object({ verb: z.literal('grapple'), ...ContestBaseFields }),
    z.object({ verb: z.literal('shove'), shoveOutcome: z.enum(['prone', 'push']), ...ContestBaseFields }),
    z.object({ verb: z.literal('escape'), ...ContestBaseFields }),
  ]);

  app.post(
    '/encounters/:id/actions/contest',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = ParamsWithId.parse(request.params);

      // REQ-ROUTE-04: verb=shove without shoveOutcome → custom issue code BEFORE Zod.
      // Zod's discriminatedUnion would emit 'invalid_type' for the missing shoveOutcome —
      // the spec requires the client-facing code 'SHOVE_OUTCOME_REQUIRED'.
      const rawBody = request.body as Record<string, unknown>;
      if (rawBody?.['verb'] === 'shove' && rawBody['shoveOutcome'] === undefined) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'SHOVE_OUTCOME_REQUIRED', path: ['shoveOutcome'] }],
        });
      }

      // Zod body validation — CLAUDE.md §6: 400 VALIDATION_FAILED on bad body.
      const bodyResult = ContestBody.safeParse(request.body);
      if (!bodyResult.success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_FAILED', issues: bodyResult.error.issues });
      }
      const userId = request.user!.sub;

      // Load encounter for GM membership check.
      const [encRow] = await db
        .select({ campaignId: encounters.campaignId })
        .from(encounters)
        .where(eq(encounters.id, id))
        .limit(1);
      if (!encRow) return reply.code(404).send({ error: 'NOT_FOUND' });

      // GM-only gate (REQ-ROUTE-02 — mirrors ability-check :1476-1477 pattern).
      const role = await memberRole(encRow.campaignId, userId);
      if (role !== 'gm') return reply.code(403).send({ error: 'FORBIDDEN' });

      const {
        attackerCombatantId,
        defenderCombatantId,
        verb,
        defenderSkill,
        defenderAbility,
        npcAttackerCheckMod,
        npcDefenderCheckMod,
        attackerRollMode,
        defenderRollMode,
        version,
      } = bodyResult.data;
      const shoveOutcome = verb === 'shove' ? bodyResult.data.shoveOutcome : undefined;

      const result = await performContest({
        encounterId: id,
        attackerCombatantId,
        defenderCombatantId,
        verb,
        defenderAbility,
        defenderSkill,
        ...(shoveOutcome !== undefined ? { shoveOutcome } : {}),
        npcAttackerCheckMod: npcAttackerCheckMod ?? null,
        npcDefenderCheckMod: npcDefenderCheckMod ?? null,
        attackerRollMode,
        defenderRollMode,
        version,
      });

      if (!result.ok) {
        switch (result.code) {
          case 'NOT_FOUND':
            return reply.code(404).send({ error: 'NOT_FOUND', target: result.target });
          case 'ENCOUNTER_NOT_ACTIVE':
            return reply.code(409).send({ error: 'ENCOUNTER_NOT_ACTIVE' });
          case 'NO_ATTACKER_CONTEST':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_ATTACKER_CONTEST' }],
            });
          case 'NO_DEFENDER_CONTEST':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_DEFENDER_CONTEST' }],
            });
          case 'NOT_GRAPPLED':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NOT_GRAPPLED' }],
            });
          case 'NO_GRAPPLER_RECORDED':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'NO_GRAPPLER_RECORDED' }],
            });
          case 'ACTION_ALREADY_USED':
            return reply.code(409).send({ error: 'ACTION_ALREADY_USED' });
          case 'VERSION_CONFLICT':
            return reply.code(409).send({ error: 'VERSION_CONFLICT' });
          case 'ACTOR_SURPRISED':
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ACTOR_SURPRISED' }],
            });
          default:
            return reply.code(400).send({ error: 'BAD_REQUEST' });
        }
      }

      // REQ-ROUTE-10: response shape.
      return reply.code(200).send({
        ok: true,
        outcome: result.outcome,
        attackerCheck: result.attackerCheck,
        defenderCheck: result.defenderCheck,
        verb: result.verb,
        ...(result.shoveOutcome !== undefined ? { shoveOutcome: result.shoveOutcome } : {}),
        applied: result.applied,
        removed: result.removed,
        ...(result.autoSuccess ? { autoSuccess: true } : {}),
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
        ...(body.hpCurrent !== undefined ? { hpCurrent: body.hpCurrent } : {}),
        ...(body.surprised !== undefined ? { surprised: body.surprised } : {}),
      });
      if (!result.ok) {
        if (result.code === 'SURPRISED_NOT_EDITABLE') {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'SURPRISED_NOT_EDITABLE' }],
          });
        }
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      return { hpCurrent: result.hpCurrent, newVersion: result.newVersion };
    },
  );
};

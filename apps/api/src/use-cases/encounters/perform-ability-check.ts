/**
 * performAbilityCheck — ability check use-case (actor polarity).
 *
 * PHB p.174 — Ability Checks:
 *   "To make an ability check, roll a d20 and add the relevant ability modifier."
 *   "If the total equals or exceeds the Difficulty Class (DC), the ability check is a success."
 * PHB p.175 — Skill Checks:
 *   "Each skill is associated with an ability score... add that modifier to the roll."
 *   If proficient in the skill, add proficiency bonus.
 * PHB p.48 — Rage:
 *   "You have advantage on Strength checks... while raging."
 *   REQ-SKILL-01: Athletics is a Strength check (PHB p.175); rage advantage applies.
 *
 * 7-step flow (mirrors performForcedCheck minus condition machinery):
 *  1. Load encounter + active guard
 *  2. Load actor combatant (kind, characterId)
 *  3. Load actor's existing conditions (for rage/check predicate ctx)
 *  4. resolveActorCheck → checkMod + gather payload
 *  5. If PC + rollMode==='normal': build-once register rage emit 1 advantage instances
 *     (when isRaging) — registry.query({trigger:'on-check'}) drives roll-mode upgrade
 *  6. resolveRollMode + upgrade only from 'normal' (caller-wins)
 *  7. rollAbilityCheck(checkMod, dc, resolvedRollMode, cryptoRng)
 *
 * NO conditionOnFail, NO applyConditions, NO encounter version bump.
 *
 * Design ref: sdd/engine-ability-check-surface/design — D10 (performAbilityCheck shape).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, encounterCombatantConditions } from '../../infra/db/schema.js';
import {
  rollAbilityCheck,
  isRaging,
  compileRule,
  rageRuleDoc,
  resolveRollMode,
  type RngFn,
} from '@dungeon-hub/domain/engine';
import { resolveActorCheck, type Ability } from './resolve-actor-check.js';

// ── Crypto RNG (mirrors perform-forced-check.ts) ──────────────────────────────

/**
 * Server-side crypto RNG. Same pattern as forced-check / weapon-attack-apply.
 * Returns an integer in [1..sides].
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── Module-scope compiled rules (D10 / build-once pattern) ────────────────────

// Compiled once at module scope — pure/no-IO. .build() called per request inside gate.
// Mirrors perform-forced-check.ts:62-66 pattern.

// PHB p.48 — Rage emit 1: advantage on STR checks while raging.
// B6 REQ-RAGE-01: emit 1 now has trigger:'on-check' + checkAbility:'str' (D12).
// Registered per-request when actor is Raging; predicate gates STR-only at query time.
const compiledRage = compileRule(rageRuleDoc);

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface PerformAbilityCheckInput {
  encounterId: string;
  actorCombatantId: string;
  ability: Ability;
  dc: number;
  skill?: string;
  npcCheckMod?: number | null;
  rollMode?: 'normal' | 'advantage' | 'disadvantage';
}

export type PerformAbilityCheckResult =
  | {
      ok: true;
      outcome: 'success' | 'fail';
      check: {
        d20: number;
        d20All: number[];
        checkMod: number;
        dc: number;
        total: number;
        success: boolean;
        rollMode: 'normal' | 'advantage' | 'disadvantage';
      };
    }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'actor' | 'character' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NO_ACTOR_CHECK' };

// ── performAbilityCheck ────────────────────────────────────────────────────────

export async function performAbilityCheck(
  input: PerformAbilityCheckInput,
): Promise<PerformAbilityCheckResult> {
  const {
    encounterId,
    actorCombatantId,
    ability,
    dc,
    skill,
    npcCheckMod,
    rollMode = 'normal',
  } = input;

  // ── Step 1: Load encounter + active guard ─────────────────────────────────────
  const [encounterRow] = await db
    .select({ id: encounters.id, status: encounters.status })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Step 2: Load actor combatant ──────────────────────────────────────────────
  const [actorCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, actorCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!actorCombatant) return { ok: false, code: 'NOT_FOUND', target: 'actor' };

  // ── Step 3: Load actor's existing conditions ──────────────────────────────────
  // Reuses the same pattern as perform-forced-check.ts:234-238 (condition rows for ctx).
  // Zero extra DB query cost — needed for rage predicate evaluation (isRaging check).
  const existingConditionRows = await db
    .select({ conditionName: encounterCombatantConditions.conditionName })
    .from(encounterCombatantConditions)
    .where(eq(encounterCombatantConditions.combatantId, actorCombatantId));

  const selfConditions = existingConditionRows.map((r) => ({ name: r.conditionName }));

  // ── Step 4: Resolve actor check modifier + gather ────────────────────────────
  const checkResult = await resolveActorCheck(
    {
      kind: actorCombatant.kind as 'pc' | 'npc',
      characterId: actorCombatant.characterId,
      ability,
      ...(skill !== undefined ? { skill } : {}),
    },
    npcCheckMod ?? null,
    selfConditions,
  );

  if (!checkResult.ok) {
    if (checkResult.code === 'NO_ACTOR_CHECK') {
      return { ok: false, code: 'NO_ACTOR_CHECK' };
    }
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  const { checkMod } = checkResult;

  // ── Step 5: Check-advantage gather (PC path + normal rollMode) ────────────────
  // Mirrors perform-forced-check.ts Gate B pattern but for check context.
  // Only fires on PC path (checkResult.gather present) when caller left rollMode at default 'normal'.
  // Explicit caller rollMode wins (caller-wins-on-explicit — mirrors REQ-GATHER-10).
  let resolvedRollMode = rollMode;

  if ('gather' in checkResult && checkResult.gather !== undefined && rollMode === 'normal') {
    const { gather } = checkResult;

    // ── Rage emit 1: STR-check advantage (PHB p.48) ────────────────────────────
    // Register compiledRage advantage instances when actor is Raging.
    // The checkAbility:'str' leaf in emit 1 predicate gates advantage to STR/Athletics checks only
    // at query time (D12 / REQ-RAGE-01). No caller-side ability guard needed (leaf handles it).
    if (isRaging(gather.ctx.self.conditions)) {
      const rageInstances = compiledRage.build({
        ragerId: gather.charId,
        rageBonus: 2,  // dummy — advantage emits don't read rageBonus (NumMod emit 6 does)
        rageCount: 1,  // dummy — mirrors perform-forced-check.ts:341 precedent
      });
      for (const i of rageInstances.filter((i) => i.def.kind === 'advantage')) {
        gather.registry.register(i);
      }
    }

    // ── Query + resolveRollMode + precedence ─────────────────────────────────
    // query({trigger:'on-check'}) matches 'on-check' AND 'always' instances.
    // Rage emit 1 now has trigger:'on-check' (D12) — explicit match.
    const gatherMods = gather.registry.query({
      trigger: 'on-check',
      self: gather.charId,
      ctx: gather.ctx,
    });
    const rollModeResult = resolveRollMode(gatherMods, gather.ctx);

    // Only upgrade from 'normal'; explicit caller rollMode wins.
    if (rollModeResult.mode !== 'normal') {
      resolvedRollMode = rollModeResult.mode;
    }
  }

  // ── Step 6: Roll the ability check ────────────────────────────────────────────
  const checkRoll = rollAbilityCheck(checkMod, dc, resolvedRollMode, cryptoRng);

  // ── Step 7: Return outcome ────────────────────────────────────────────────────
  return {
    ok: true,
    outcome: checkRoll.success ? 'success' : 'fail',
    check: {
      d20: checkRoll.d20,
      d20All: checkRoll.d20All,
      checkMod: checkRoll.checkMod,
      dc: checkRoll.dc,
      total: checkRoll.total,
      success: checkRoll.success,
      rollMode: checkRoll.rollMode,
    },
  };
}

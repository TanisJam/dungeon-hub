/**
 * performContest — two-actor contested check use-case (grapple / shove / escape).
 *
 * PHB p.174 — Contests:
 *   "Both participants make ability checks... The participant with the higher check
 *    total wins the contest."
 *
 * PHB p.195 — Grapple / Shove:
 *   "You can use the Attack action to make a special melee attack, a grapple."
 *   "This attack replaces one of them [attacks from the Attack action]."
 *   "You succeed automatically if the target is incapacitated."
 *
 * PHB p.195 — Escape:
 *   "A grappled creature can use its action to escape."  (full action, NOT one attack)
 *
 * PHB p.290 — Grappled condition:
 *   "A grappled creature's speed becomes 0."
 *
 * 10-step flow (mirrors perform-ability-check.ts / perform-forced-check.ts):
 *  1. Load encounter + active guard
 *  2. Load attacker + defender combatants (escape: grappler derived from appliedByCombatantId)
 *  3. Load attacker + defender conditions (two queries)
 *  4. Incapacitated short-circuit (grapple/shove ONLY — PHB p.195 auto-success)
 *     AMENDED (spec-amendment-auto01): budget tx RUNS even on auto-success
 *  5. resolveActorCheck — attacker side (str/athletics always for grapple/shove/escape attacker)
 *     NPC with null npcAttackerCheckMod → NO_ATTACKER_CONTEST (pre-budget fail-fast)
 *  6. resolveActorCheck — defender side (caller-authoritative ability+skill, #2163)
 *     NPC with null npcDefenderCheckMod → NO_DEFENDER_CONTEST (pre-budget fail-fast)
 *  7. Two independent gathers (PC path: rage on-check advantage per side)
 *  8. Budget tx BEFORE rollContest (declaration-spends, ADR-3 reasoning):
 *     - grapple/shove: attack-replace (3-branch machine, perform-weapon-attack-apply.ts:597-647)
 *     - escape: full-action (separate simpler machine, PHB p.195 — REQ-ESCAPE-01)
 *  9. rollContest(attackerMod, defenderMod, attackerResolvedRollMode, defenderResolvedRollMode, cryptoRng)
 * 10. Outcome application (attacker-wins only; tie/defender-wins → applied:[], removed:[])
 *
 * Design ref: sdd/engine-contested-checks/design — D-UC (step flow, BINDING).
 * Spec: REQ-GRAPPLE-*, REQ-SHOVE-*, REQ-ESCAPE-*, REQ-BUDGET-*, REQ-NPC-*, REQ-AUTO-*.
 * Amendment: sdd/engine-contested-checks/spec-amendment-auto01 (incapacitated budget tx runs).
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  encounters,
  encounterCombatants,
  encounterCombatantConditions,
  characters,
} from '../../infra/db/schema.js';
import {
  rollContest,
  isIncapacitated,
  isRaging,
  compileRule,
  rageRuleDoc,
  resolveRollMode,
  extraAttacksPerAction,
  type RngFn,
} from '@dungeon-hub/domain/engine';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import { resolveActorCheck, type Ability } from './resolve-actor-check.js';
import { isCombatantSurprisedFirstTurn } from './is-combatant-surprised-first-turn.js';

// ── Crypto RNG (mirrors perform-ability-check.ts) ─────────────────────────────

/**
 * Server-side crypto RNG. Same pattern as forced-check / weapon-attack-apply.
 * Returns an integer in [1..sides].
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── Module-scope compiled rules ────────────────────────────────────────────────

// PHB p.48 — Rage: advantage on STR checks while raging.
// Compiled once at module scope; .build() called per request inside gather gate.
// Mirrors perform-ability-check.ts:62 pattern.
const compiledRage = compileRule(rageRuleDoc);

// ── Input / Output ─────────────────────────────────────────────────────────────

export type ContestVerb = 'grapple' | 'shove' | 'escape';
export type ShoveOutcome = 'prone' | 'push';

export interface PerformContestInput {
  encounterId: string;
  attackerCombatantId: string;
  defenderCombatantId: string;
  verb: ContestVerb;
  defenderAbility: Ability;
  defenderSkill: 'athletics' | 'acrobatics';
  shoveOutcome?: ShoveOutcome; // required when verb === 'shove'
  npcAttackerCheckMod?: number | null;
  npcDefenderCheckMod?: number | null;
  attackerRollMode?: 'normal' | 'advantage' | 'disadvantage';
  defenderRollMode?: 'normal' | 'advantage' | 'disadvantage';
  version: number;
}

export type PerformContestResult =
  | {
      ok: true;
      outcome: 'attacker-wins' | 'defender-wins' | 'tie';
      attackerCheck: {
        d20: number;
        d20All: number[];
        checkMod: number;
        total: number;
        rollMode: 'normal' | 'advantage' | 'disadvantage';
      } | null;
      defenderCheck: {
        d20: number;
        d20All: number[];
        checkMod: number;
        total: number;
        rollMode: 'normal' | 'advantage' | 'disadvantage';
      } | null;
      verb: ContestVerb;
      shoveOutcome?: ShoveOutcome;
      applied: string[];
      removed: string[];
      autoSuccess?: true;
    }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'defender' | 'character' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NO_ATTACKER_CONTEST' }
  | { ok: false; code: 'NO_DEFENDER_CONTEST' }
  | { ok: false; code: 'NOT_GRAPPLED' }
  | { ok: false; code: 'NO_GRAPPLER_RECORDED' }
  | { ok: false; code: 'ACTION_ALREADY_USED' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  // engine-surprise-round1 (REQ-SUR-S2-02, PHB p.189 — actions blocked while surprised)
  | { ok: false; code: 'ACTOR_SURPRISED' };

// ── performContest ─────────────────────────────────────────────────────────────

export async function performContest(
  input: PerformContestInput,
): Promise<PerformContestResult> {
  const {
    encounterId,
    attackerCombatantId,
    defenderCombatantId,
    verb,
    defenderAbility,
    defenderSkill,
    shoveOutcome,
    npcAttackerCheckMod,
    npcDefenderCheckMod,
    attackerRollMode = 'normal',
    defenderRollMode = 'normal',
    version,
  } = input;

  // ── Step 1: Load encounter + active guard ─────────────────────────────────────
  const [encounterRow] = await db
    .select({ id: encounters.id, status: encounters.status, version: encounters.version })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Step 2: Load attacker + defender combatants ───────────────────────────────

  const resolvedAttackerCombatantId = attackerCombatantId;
  let resolvedDefenderCombatantId = defenderCombatantId;

  // Escape: grappler is resolved from appliedByCombatantId — the escaper is attackerCombatantId.
  // defenderCombatantId from the body is IGNORED for escape to avoid TOCTOU mismatches.
  // Design: D-UC escape-grappler-resolution; REQ-ESCAPE-02.
  if (verb === 'escape') {
    const [grappledRow] = await db
      .select({
        appliedByCombatantId: encounterCombatantConditions.appliedByCombatantId,
      })
      .from(encounterCombatantConditions)
      .where(
        and(
          eq(encounterCombatantConditions.combatantId, attackerCombatantId),
          eq(encounterCombatantConditions.conditionName, 'Grappled'),
        ),
      )
      .limit(1);

    if (!grappledRow) {
      // REQ-ESCAPE-03: no Grappled condition on the escaping combatant → NOT_GRAPPLED.
      return { ok: false, code: 'NOT_GRAPPLED' };
    }
    if (grappledRow.appliedByCombatantId === null) {
      // Legacy or unknown grappler — appliedByCombatantId required for escape (REQ-ESCAPE-02).
      return { ok: false, code: 'NO_GRAPPLER_RECORDED' };
    }
    // Grappler is the defender for the escape contest.
    resolvedDefenderCombatantId = grappledRow.appliedByCombatantId;
  }

  // Load attacker combatant.
  const [attackerCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
      actionUsed: encounterCombatants.actionUsed,
      attacksRemaining: encounterCombatants.attacksRemaining,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, resolvedAttackerCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!attackerCombatant) return { ok: false, code: 'NOT_FOUND', target: 'attacker' };

  // ── Step 2a: Surprise gate (ADR-3.2, REQ-SUR-S2-02, PHB p.189) ──────────────
  // FIRST actor-side block (this file has NO actor turn/incap gate — ADR-3.2).
  // Gate on resolvedAttackerCombatantId — covers both grapple/shove (attacker)
  // and escape (actor is the grappled combatant, resolved above at verb==='escape').
  if (await isCombatantSurprisedFirstTurn(resolvedAttackerCombatantId)) {
    return { ok: false, code: 'ACTOR_SURPRISED' };
  }

  // Load defender combatant.
  const [defenderCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, resolvedDefenderCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!defenderCombatant) return { ok: false, code: 'NOT_FOUND', target: 'defender' };

  // ── Step 3: Load conditions for both combatants ───────────────────────────────
  // Two independent queries — mirrors perform-forced-check.ts Step 4 / ability-check Step 3.

  const [attackerConditionRows, defenderConditionRows] = await Promise.all([
    db
      .select({ conditionName: encounterCombatantConditions.conditionName })
      .from(encounterCombatantConditions)
      .where(eq(encounterCombatantConditions.combatantId, resolvedAttackerCombatantId)),
    db
      .select({ conditionName: encounterCombatantConditions.conditionName })
      .from(encounterCombatantConditions)
      .where(eq(encounterCombatantConditions.combatantId, resolvedDefenderCombatantId)),
  ]);

  const attackerConditions = attackerConditionRows.map((r) => ({ name: r.conditionName }));
  const defenderConditions = defenderConditionRows.map((r) => ({ name: r.conditionName }));

  // ── Step 4: Incapacitated short-circuit (grapple/shove ONLY — PHB p.195) ──────
  // PHB p.195: "You succeed automatically if the target is incapacitated."
  // AMENDED (spec-amendment-auto01): budget tx STILL RUNS — this is a "special melee attack"
  // that replaces one Attack action attack. The auto-success replaces the CONTEST roll,
  // not the action spend.
  // Escape has NO incapacitated auto-success arm (if the grappler is incapacitated, that
  // ENDS the grapple by PHB p.290 — a condition-expiry debt deferred to a future SDD).
  if ((verb === 'grapple' || verb === 'shove') && isIncapacitated(defenderConditions)) {
    // Budget tx runs BEFORE returning (amendment #2240: incapacitated arm IS attack-replace).
    const loadedAttackerClasses = await loadAttackerClasses(
      attackerCombatant.kind as 'pc' | 'npc',
      attackerCombatant.characterId,
    );
    const budgetResult = await applyAttackReplaceBudget({
      encounterId,
      attackerCombatantId: resolvedAttackerCombatantId,
      actionUsed: attackerCombatant.actionUsed,
      attacksRemaining: attackerCombatant.attacksRemaining,
      classes: loadedAttackerClasses,
      version,
    });

    if (!budgetResult.ok) {
      if (budgetResult.code === 'ACTION_ALREADY_USED') return { ok: false, code: 'ACTION_ALREADY_USED' };
      return { ok: false, code: 'VERSION_CONFLICT' };
    }

    // Apply outcome condition on auto-success.
    const applied: string[] = [];
    if (verb === 'grapple') {
      const wasInserted = await idempotentInsertCondition({
        combatantId: resolvedDefenderCombatantId,
        conditionName: 'Grappled',
        appliedByCombatantId: resolvedAttackerCombatantId,
      });
      if (wasInserted) applied.push('Grappled');
    } else if (verb === 'shove') {
      if (shoveOutcome === 'prone') {
        const wasInserted = await idempotentInsertCondition({
          combatantId: resolvedDefenderCombatantId,
          conditionName: 'Prone',
          appliedByCombatantId: resolvedAttackerCombatantId,
        });
        if (wasInserted) applied.push('Prone');
      }
      // shoveOutcome === 'push' → narrative-only, no insert
    }

    return {
      ok: true,
      outcome: 'attacker-wins',
      attackerCheck: null,
      defenderCheck: null,
      verb,
      ...(verb === 'shove' && shoveOutcome ? { shoveOutcome } : {}),
      applied,
      removed: [],
      autoSuccess: true,
    };
  }

  // ── Step 5: resolveActorCheck — attacker side ─────────────────────────────────
  // PHB p.195: attacker (grappler/shover/escapee) ALWAYS uses STR (Athletics).
  // REQ-GRAPPLE-05, REQ-SHOVE-06, REQ-ESCAPE-04.
  // NPC with null npcAttackerCheckMod → NO_ATTACKER_CONTEST BEFORE budget tx (fail-fast).
  const attackerCheckResult = await resolveActorCheck(
    {
      kind: attackerCombatant.kind as 'pc' | 'npc',
      characterId: attackerCombatant.characterId,
      ability: 'str' as Ability,
      skill: 'athletics',
    },
    npcAttackerCheckMod ?? null,
    attackerConditions,
  );

  if (!attackerCheckResult.ok) {
    if (attackerCheckResult.code === 'NO_ACTOR_CHECK') {
      return { ok: false, code: 'NO_ATTACKER_CONTEST' };
    }
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  // ── Step 6: resolveActorCheck — defender side ─────────────────────────────────
  // Caller-authoritative ability+skill (#2163, PHB p.175 variant). Server does NOT coerce.
  // NPC with null npcDefenderCheckMod → NO_DEFENDER_CONTEST BEFORE budget tx.
  const defenderCheckResult = await resolveActorCheck(
    {
      kind: defenderCombatant.kind as 'pc' | 'npc',
      characterId: defenderCombatant.characterId,
      ability: defenderAbility,
      skill: defenderSkill,
    },
    npcDefenderCheckMod ?? null,
    defenderConditions,
  );

  if (!defenderCheckResult.ok) {
    if (defenderCheckResult.code === 'NO_ACTOR_CHECK') {
      return { ok: false, code: 'NO_DEFENDER_CONTEST' };
    }
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  // ── Step 7: Two independent gathers (PC path + normal rollMode) ───────────────
  // Each side: register rage on-check advantage if raging + rollMode==='normal'.
  // Two INDEPENDENT registries — verified no collision (explore #2233 §(a)).
  // Mirrors perform-ability-check.ts:174-205 per side.

  let attackerResolvedRollMode: 'normal' | 'advantage' | 'disadvantage' = attackerRollMode;
  let defenderResolvedRollMode: 'normal' | 'advantage' | 'disadvantage' = defenderRollMode;

  if ('gather' in attackerCheckResult && attackerCheckResult.gather !== undefined && attackerRollMode === 'normal') {
    const { gather } = attackerCheckResult;
    if (isRaging(gather.ctx.self.conditions)) {
      const rageInstances = compiledRage.build({
        ragerId: gather.charId,
        rageBonus: 2,  // dummy — advantage emits don't read rageBonus
        rageCount: 1,  // dummy — mirrors perform-ability-check.ts:184 precedent
      });
      for (const i of rageInstances.filter((i) => i.def.kind === 'advantage')) {
        gather.registry.register(i);
      }
    }
    const attackerGatherMods = gather.registry.query({
      trigger: 'on-check',
      self: gather.charId,
      ctx: gather.ctx,
    });
    const attackerRollModeResult = resolveRollMode(attackerGatherMods, gather.ctx);
    if (attackerRollModeResult.mode !== 'normal') {
      attackerResolvedRollMode = attackerRollModeResult.mode;
    }
  }

  if ('gather' in defenderCheckResult && defenderCheckResult.gather !== undefined && defenderRollMode === 'normal') {
    const { gather } = defenderCheckResult;
    if (isRaging(gather.ctx.self.conditions)) {
      const rageInstances = compiledRage.build({
        ragerId: gather.charId,
        rageBonus: 2,  // dummy
        rageCount: 1,  // dummy
      });
      for (const i of rageInstances.filter((i) => i.def.kind === 'advantage')) {
        gather.registry.register(i);
      }
    }
    const defenderGatherMods = gather.registry.query({
      trigger: 'on-check',
      self: gather.charId,
      ctx: gather.ctx,
    });
    const defenderRollModeResult = resolveRollMode(defenderGatherMods, gather.ctx);
    if (defenderRollModeResult.mode !== 'normal') {
      defenderResolvedRollMode = defenderRollModeResult.mode;
    }
  }

  // ── Step 8: Budget tx BEFORE rollContest (declaration-spends, ADR-3) ──────────
  // PHB p.198 / ADR-3: the action is spent when DECLARED, outcome-independent.
  // grapple/shove = attack-replace (REQ-BUDGET-01/02).
  // escape = full-action (REQ-BUDGET-03/04).

  if (verb === 'grapple' || verb === 'shove') {
    // Attack-replace: same 3-branch machine as perform-weapon-attack-apply.ts:597-647.
    const loadedAttackerClasses = await loadAttackerClasses(
      attackerCombatant.kind as 'pc' | 'npc',
      attackerCombatant.characterId,
    );
    const budgetResult = await applyAttackReplaceBudget({
      encounterId,
      attackerCombatantId: resolvedAttackerCombatantId,
      actionUsed: attackerCombatant.actionUsed,
      attacksRemaining: attackerCombatant.attacksRemaining,
      classes: loadedAttackerClasses,
      version,
    });

    if (!budgetResult.ok) {
      if (budgetResult.code === 'ACTION_ALREADY_USED') return { ok: false, code: 'ACTION_ALREADY_USED' };
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
  } else {
    // Escape: full-action (REQ-BUDGET-03/04 — PHB p.195 "can use its action to escape").
    // actionUsed===true → ACTION_ALREADY_USED (regardless of attacksRemaining).
    const budgetResult = await applyFullActionBudget({
      encounterId,
      attackerCombatantId: resolvedAttackerCombatantId,
      actionUsed: attackerCombatant.actionUsed,
      version,
    });

    if (!budgetResult.ok) {
      if (budgetResult.code === 'ACTION_ALREADY_USED') return { ok: false, code: 'ACTION_ALREADY_USED' };
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
  }

  // ── Step 9: rollContest ───────────────────────────────────────────────────────
  // D-PRIM: single cryptoRng, attacker side first.
  const contestResult = rollContest(
    attackerCheckResult.checkMod,
    defenderCheckResult.checkMod,
    attackerResolvedRollMode,
    defenderResolvedRollMode,
    cryptoRng,
  );

  // ── Step 10: Outcome application ──────────────────────────────────────────────
  // Attacker-wins: apply verb-specific outcome.
  // Defender-wins / tie: status quo — no conditions applied/removed.

  const applied: string[] = [];
  const removed: string[] = [];

  if (contestResult.winner === 'attacker') {
    if (verb === 'grapple') {
      // REQ-GRAPPLE-01/03/04: idempotent INSERT Grappled on defender.
      const wasInserted = await idempotentInsertCondition({
        combatantId: resolvedDefenderCombatantId,
        conditionName: 'Grappled',
        appliedByCombatantId: resolvedAttackerCombatantId,
      });
      if (wasInserted) applied.push('Grappled');
    } else if (verb === 'shove') {
      if (shoveOutcome === 'prone') {
        // REQ-SHOVE-02: idempotent INSERT Prone on defender.
        const wasInserted = await idempotentInsertCondition({
          combatantId: resolvedDefenderCombatantId,
          conditionName: 'Prone',
          appliedByCombatantId: resolvedAttackerCombatantId,
        });
        if (wasInserted) applied.push('Prone');
      }
      // shoveOutcome === 'push' → narrative-only, no condition insert (REQ-SHOVE-03).
    } else if (verb === 'escape') {
      // REQ-ESCAPE-06: DELETE the Grappled row on the escaping combatant.
      await db
        .delete(encounterCombatantConditions)
        .where(
          and(
            eq(encounterCombatantConditions.combatantId, resolvedAttackerCombatantId),
            eq(encounterCombatantConditions.conditionName, 'Grappled'),
          ),
        );
      removed.push('Grappled');
    }
  }
  // else: defender-wins or tie — status quo, no mutations.

  return {
    ok: true,
    outcome: contestResult.winner === 'attacker'
      ? 'attacker-wins'
      : contestResult.winner === 'defender'
        ? 'defender-wins'
        : 'tie',
    attackerCheck: {
      d20: contestResult.attacker.d20,
      d20All: contestResult.attacker.d20All,
      checkMod: contestResult.attacker.checkMod,
      total: contestResult.attacker.total,
      rollMode: contestResult.attacker.rollMode as 'normal' | 'advantage' | 'disadvantage',
    },
    defenderCheck: {
      d20: contestResult.defender.d20,
      d20All: contestResult.defender.d20All,
      checkMod: contestResult.defender.checkMod,
      total: contestResult.defender.total,
      rollMode: contestResult.defender.rollMode as 'normal' | 'advantage' | 'disadvantage',
    },
    verb,
    ...(verb === 'shove' && contestResult.winner === 'attacker' && shoveOutcome ? { shoveOutcome } : {}),
    applied,
    removed,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load the attacker's classes array for extraAttacksPerAction.
 *
 * PC attacker: load from characters.data.classes (lightweight single query).
 * NPC attacker: return empty array → extraAttacksPerAction([]) = 1 (single attack).
 * Accepted duplication (ADR-2 stance from D-UC): contest use-case loads classes
 * separately because resolveActorCheck does not return classes.
 */
async function loadAttackerClasses(
  kind: 'pc' | 'npc',
  characterId: string | null,
): Promise<AppliedClass[]> {
  if (kind === 'npc' || !characterId) return [];

  const [charRow] = await db
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!charRow) return [];
  const charData = (charRow.data as Record<string, unknown>) ?? {};
  return (charData['classes'] as AppliedClass[] | undefined) ?? [];
}

/**
 * Apply the attack-replace budget (grapple/shove — PHB p.195 "replaces one attack").
 *
 * Three-branch machine (ADR-3 / REQ-BUDGET-01/02):
 *   Branch 3: actionUsed && attacksRemaining===0 → ACTION_ALREADY_USED (no tx).
 *   Branch 1: !actionUsed → first attack: set actionUsed=true, attacksRemaining=N-1.
 *   Branch 2: actionUsed && attacksRemaining>0 → decrement attacksRemaining.
 *
 * Atomic tx: UPDATE combatant budget + bump encounters.version with CAS on version.
 * VERSION_CONFLICT on race (0 rows returned by CAS WHERE clause).
 */
async function applyAttackReplaceBudget(opts: {
  encounterId: string;
  attackerCombatantId: string;
  actionUsed: boolean;
  attacksRemaining: number;
  classes: AppliedClass[];
  version: number;
}): Promise<{ ok: true } | { ok: false; code: 'ACTION_ALREADY_USED' | 'VERSION_CONFLICT' }> {
  const { encounterId, attackerCombatantId, actionUsed, attacksRemaining, classes, version } = opts;
  const totalAttacks = extraAttacksPerAction(classes);

  // Branch 3: action fully spent — reject before any tx.
  if (actionUsed && attacksRemaining === 0) {
    return { ok: false, code: 'ACTION_ALREADY_USED' };
  }

  // Branches 1 & 2: compute planned next state.
  const nextActionUsed = true;
  const nextAttacksRemaining = actionUsed
    ? attacksRemaining - 1               // Branch 2: continuation — decrement allowance
    : totalAttacks - 1;                   // Branch 1: first attack — set full allowance minus 1

  // Atomic budget tx + version bump with CAS.
  const budgetTxRows = await db.transaction(async (tx) => {
    await tx
      .update(encounterCombatants)
      .set({ actionUsed: nextActionUsed, attacksRemaining: nextAttacksRemaining })
      .where(
        and(
          eq(encounterCombatants.id, attackerCombatantId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    return tx
      .update(encounters)
      .set({ version: sql`${encounters.version} + 1`, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ version: encounters.version });
  });

  if (budgetTxRows.length === 0) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  return { ok: true };
}

/**
 * Apply the full-action budget (escape — PHB p.195 "can use its action to escape").
 *
 * Simpler machine (REQ-BUDGET-03/04):
 *   actionUsed===true → ACTION_ALREADY_USED (regardless of attacksRemaining).
 *   actionUsed===false → set actionUsed=true, attacksRemaining=0 (whole action consumed).
 */
async function applyFullActionBudget(opts: {
  encounterId: string;
  attackerCombatantId: string;
  actionUsed: boolean;
  version: number;
}): Promise<{ ok: true } | { ok: false; code: 'ACTION_ALREADY_USED' | 'VERSION_CONFLICT' }> {
  const { encounterId, attackerCombatantId, actionUsed, version } = opts;

  // Escape: if action is already used, reject immediately.
  if (actionUsed) {
    return { ok: false, code: 'ACTION_ALREADY_USED' };
  }

  // Atomic tx: set actionUsed=true, attacksRemaining=0 + version bump with CAS.
  const budgetTxRows = await db.transaction(async (tx) => {
    await tx
      .update(encounterCombatants)
      .set({ actionUsed: true, attacksRemaining: 0 })
      .where(
        and(
          eq(encounterCombatants.id, attackerCombatantId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    return tx
      .update(encounters)
      .set({ version: sql`${encounters.version} + 1`, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ version: encounters.version });
  });

  if (budgetTxRows.length === 0) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  return { ok: true };
}

/**
 * Idempotently insert a condition row.
 *
 * Returns true if a new row was inserted; false if the row already existed
 * with the same combatantId + conditionName + appliedByCombatantId (REQ-GRAPPLE-03/04).
 *
 * Follows the App-level idempotency pattern from perform-forced-check.ts (ADR-3).
 * Note: for grapple idempotency, the existing row must match BOTH combatantId AND
 * appliedByCombatantId to be considered the same grapple (same attacker re-grappling
 * the same target). A different attacker grapplin the same target would be a new row.
 */
async function idempotentInsertCondition(opts: {
  combatantId: string;
  conditionName: string;
  appliedByCombatantId: string;
}): Promise<boolean> {
  const { combatantId, conditionName, appliedByCombatantId } = opts;

  // Check if the exact (combatantId + conditionName + appliedByCombatantId) row already exists.
  const [existingRow] = await db
    .select({ id: encounterCombatantConditions.id })
    .from(encounterCombatantConditions)
    .where(
      and(
        eq(encounterCombatantConditions.combatantId, combatantId),
        eq(encounterCombatantConditions.conditionName, conditionName),
        eq(encounterCombatantConditions.appliedByCombatantId, appliedByCombatantId),
      ),
    )
    .limit(1);

  if (existingRow) {
    // Idempotent no-op — condition already applied by this same attacker (REQ-GRAPPLE-04).
    return false;
  }

  // Insert the new condition row.
  await db.insert(encounterCombatantConditions).values({
    combatantId,
    conditionName,
    appliedByCombatantId,
    turnAnchorEntityId: null,
    turnAnchorBoundary: null,
    turnsRemaining: null,
  });

  return true;
}

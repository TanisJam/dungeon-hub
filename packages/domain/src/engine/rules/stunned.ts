/**
 * buildStunnedModifiers — Stunned rule encoding.
 *
 * PHB p.292 — Stunned:
 *   "Attack rolls against the creature have advantage."
 *
 * REQ-COND-02: outgoing advantage grant to ALL attackers UNCONDITIONALLY.
 *
 * Design:
 *   Emits 1 ModifierInstance (outgoing grant only — no selfMod enforcement in 3a,
 *   no imposePredicate since Stunned never disadvantages attackers):
 *     (1) Attackers-of-scoped AdvantageMod (grant) with alwaysTrue() predicate:
 *         ALL attackers get advantage, unconditionally (PHB p.292).
 *
 *   CONTRAST with buildProneModifiers (3 instances — self-disadvantage +
 *   range-gated grant + range-gated impose). Stunned is simpler: outgoing-grant only.
 *
 *   NOTE: buildProneModifiers existed but was dead code (zero production call sites
 *   before this slice). This function lights up the attackers-of path for the FIRST
 *   time in production (design ADR-6 CRITICAL DISCOVERY). The integration test
 *   9.10 (attack-vs-Stunned-target-gets-advantage) confirms the path is live end-to-end.
 *
 *   Returns { ok: false, issues: [{code:'CONDITION_NOT_FOUND', expected:'Stunned'}] }
 *   if the conditionResolver returns null — §6 issue codes.
 *
 * // TODO #513: ConditionResolver → runtime catalog per §1.2.
 */
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── ConditionResolver type ────────────────────────────────────────────────────

/**
 * Injected resolver — returns the ConditionDefinition for 'Stunned', or null
 * if the condition is not found in the catalog.
 */
export type ConditionResolver = (name: string) => ConditionDefinition | null;

// ── Issue codes ───────────────────────────────────────────────────────────────

export interface ConditionNotFoundIssue {
  code: 'CONDITION_NOT_FOUND';
  expected: string;
}

// ── Return type ───────────────────────────────────────────────────────────────

export type BuildStunnedResult =
  | { ok: true; instances: ModifierInstance[] }
  | { ok: false; issues: [ConditionNotFoundIssue] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Stunned condition.
 *
 * @param targetId          - ID of the entity that is stunned.
 * @param conditionResolver - Injected resolver — returns STUNNED_CONDITION_DEF
 *                           or null if not found.
 * @returns BuildStunnedResult — ok:true with instances, or ok:false with issues.
 */
export function buildStunnedModifiers(
  targetId: EntityId,
  conditionResolver: ConditionResolver,
): BuildStunnedResult {
  const def = conditionResolver('Stunned');

  if (def === null) {
    return {
      ok: false,
      issues: [{ code: 'CONDITION_NOT_FOUND', expected: 'Stunned' }],
    };
  }

  const instances: ModifierInstance[] = [];

  // ── Attackers-of: ALL attackers → advantage (grant), unconditional ─────────
  // PHB p.292: "Attack rolls against the creature have advantage."
  // Unlike Prone (range/weapon-gated), Stunned advantage is UNCONDITIONAL.
  // predicate = alwaysTrue() = { op: 'and', nodes: [] } (vacuous truth).
  instances.push({
    id: iid(`stunned-outgoing-grant-${targetId}`),
    label: 'Stunned',
    def: { kind: 'advantage', mode: 'grant', rollType: 'attack' },
    scope: {
      owner: targetId,
      target: { axis: 'attackers-of', ids: [targetId] },
      trigger: 'on-attack-roll',
    },
    predicate: def.outgoingMod.grantPredicate,
  });

  return { ok: true, instances };
}

/**
 * buildProneModifiers — Prone rule encoding.
 *
 * // PHB 292 Appendix A — Prone:
 * // "The creature has disadvantage on attack rolls.
 * //  An attack roll against the creature has advantage if the attacker is
 * //  within 5 feet of the creature. Otherwise, the attack roll has disadvantage."
 *
 * REQ-PRONE-01: self-disadvantage + outgoing-aware grant/impose via attackers-of axis.
 *
 * Design:
 *   - Emits 3 ModifierInstance entries total:
 *     (1) Self-scoped AdvantageMod (impose) on 'on-attack-roll': the prone
 *         creature's OWN attack rolls have disadvantage.
 *     (2) Attackers-of-scoped AdvantageMod (grant) predicated on melee ≤5ft:
 *         attackers within 5ft (melee) get advantage.
 *     (3) Attackers-of-scoped AdvantageMod (impose) predicated on NOT(melee ≤5ft):
 *         ranged / far attackers get disadvantage.
 *
 *   The registry gathers (2) and (3) for any attacker querying against the
 *   prone entity via the 'attackers-of' axis. Predicates then filter to
 *   exactly ONE (grant OR impose) based on ctx.weaponInUse/rangeFt.
 *
 *   Returns { ok: false, issues: [{code:'CONDITION_NOT_FOUND', expected:'Prone'}] }
 *   if the conditionResolver returns null — §6 issue codes.
 *
 * // TODO #513: ConditionResolver → runtime catalog per §1.2.
 */
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── ConditionResolver type ────────────────────────────────────────────────────

/**
 * Injected resolver — returns the ConditionDefinition for 'Prone', or null
 * if the condition is not found in the catalog.
 */
export type ConditionResolver = (name: string) => ConditionDefinition | null;

// ── Issue codes ───────────────────────────────────────────────────────────────

export interface ConditionNotFoundIssue {
  code: 'CONDITION_NOT_FOUND';
  expected: string;
}

// ── Return type ───────────────────────────────────────────────────────────────

export type BuildProneResult =
  | { ok: true; instances: ModifierInstance[] }
  | { ok: false; issues: [ConditionNotFoundIssue] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Prone condition.
 *
 * @param targetId         - ID of the entity that is prone.
 * @param conditionResolver - Injected resolver — returns PRONE_CONDITION_DEF
 *                           or null if not found.
 * @returns BuildProneResult — ok:true with instances, or ok:false with issues.
 */
export function buildProneModifiers(
  targetId: EntityId,
  conditionResolver: ConditionResolver,
): BuildProneResult {
  const def = conditionResolver('Prone');

  if (def === null) {
    return {
      ok: false,
      issues: [{ code: 'CONDITION_NOT_FOUND', expected: 'Prone' }],
    };
  }

  const instances: ModifierInstance[] = [];

  // ── (1) Self-scoped: prone creature's own attacks → disadvantage ────────────
  instances.push({
    id: iid(`prone-self-${targetId}`),
    label: 'Prone',
    def: def.selfMod,
    scope: {
      owner: targetId,
      target: { axis: 'self' },
      trigger: 'on-attack-roll',
    },
  });

  // ── (2) Attackers-of: melee ≤5ft → advantage (grant) ───────────────────────
  instances.push({
    id: iid(`prone-outgoing-grant-${targetId}`),
    label: 'Prone',
    def: { kind: 'advantage', mode: 'grant', rollType: 'attack' },
    scope: {
      owner: targetId,
      target: { axis: 'attackers-of', ids: [targetId] },
      trigger: 'on-attack-roll',
    },
    predicate: def.outgoingMod.grantPredicate,
  });

  // ── (3) Attackers-of: NOT(melee ≤5ft) → disadvantage (impose) ──────────────
  instances.push({
    id: iid(`prone-outgoing-impose-${targetId}`),
    label: 'Prone',
    def: { kind: 'advantage', mode: 'impose', rollType: 'attack' },
    scope: {
      owner: targetId,
      target: { axis: 'attackers-of', ids: [targetId] },
      trigger: 'on-attack-roll',
    },
    predicate: def.outgoingMod.imposePredicate,
  });

  return { ok: true, instances };
}

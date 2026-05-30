/**
 * buildInvisibleModifiers — Invisible rule encoding.
 * Polar mirror of buildBlindedModifiers.
 *
 * PHB p.291 — Appendix A: Conditions, Invisible:
 *   "Attack rolls against the creature have disadvantage, and the creature's
 *    attack rolls have advantage."
 *
 * REQ-COND-INVIS-01: outgoing attackers-of impose (disadvantage), unconditional.
 * REQ-COND-INVIS-02: self grant (advantage) on own attack rolls.
 *
 * Design:
 *   Emits 2 ModifierInstance entries:
 *     (1) Self-scoped AdvantageMod (grant) on 'on-attack-roll': invisible creature's
 *         OWN attacks have advantage (PHB p.291).
 *     (2) Attackers-of-scoped AdvantageMod (impose) with alwaysTrue() predicate:
 *         ALL attackers get disadvantage, unconditionally (PHB p.291).
 *
 *   Returns { ok: false, issues: [{code:'CONDITION_NOT_FOUND', expected:'Invisible'}] }
 *   if the conditionResolver returns null.
 *
 * // TODO #513: ConditionResolver → runtime catalog per §1.2.
 */
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── ConditionResolver type ────────────────────────────────────────────────────

/**
 * Injected resolver — returns the ConditionDefinition for 'Invisible', or null
 * if the condition is not found in the catalog.
 */
export type ConditionResolver = (name: string) => ConditionDefinition | null;

// ── Issue codes ───────────────────────────────────────────────────────────────

export interface ConditionNotFoundIssue {
  code: 'CONDITION_NOT_FOUND';
  expected: string;
}

// ── Return type ───────────────────────────────────────────────────────────────

export type BuildInvisibleResult =
  | { ok: true; instances: ModifierInstance[] }
  | { ok: false; issues: [ConditionNotFoundIssue] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Invisible condition.
 *
 * @param targetId          - ID of the entity that is invisible.
 * @param conditionResolver - Injected resolver — returns INVISIBLE_CONDITION_DEF
 *                           or null if not found.
 * @returns BuildInvisibleResult — ok:true with instances, or ok:false with issues.
 */
export function buildInvisibleModifiers(
  targetId: EntityId,
  conditionResolver: ConditionResolver,
): BuildInvisibleResult {
  const def = conditionResolver('Invisible');

  if (def === null) {
    return {
      ok: false,
      issues: [{ code: 'CONDITION_NOT_FOUND', expected: 'Invisible' }],
    };
  }

  const instances: ModifierInstance[] = [];

  // ── (1) Self-scoped: invisible creature's own attacks → advantage ────────────
  // PHB p.291: "The creature's attack rolls have advantage"
  instances.push({
    id: iid(`invisible-self-${targetId}`),
    label: 'Invisible',
    def: def.selfMod,
    scope: {
      owner: targetId,
      target: { axis: 'self' },
      trigger: 'on-attack-roll',
    },
  });

  // ── (2) Attackers-of: ALL attackers → disadvantage (impose), unconditional ───
  // PHB p.291: "attack rolls against the creature have disadvantage."
  // UNCONDITIONAL — no range or weapon-kind gate.
  instances.push({
    id: iid(`invisible-outgoing-impose-${targetId}`),
    label: 'Invisible',
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

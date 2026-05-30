/**
 * buildBlindedModifiers — Blinded rule encoding.
 *
 * PHB p.290 — Appendix A: Conditions, Blinded:
 *   "Attack rolls against the creature have advantage, and the creature's
 *    attack rolls have disadvantage."
 *
 * REQ-COND-BLIND-01: outgoing attackers-of grant (advantage), unconditional.
 * REQ-COND-BLIND-02: self impose (disadvantage) on own attack rolls.
 *
 * Design:
 *   Emits 2 ModifierInstance entries:
 *     (1) Self-scoped AdvantageMod (impose) on 'on-attack-roll': blinded creature's
 *         OWN attacks have disadvantage (PHB p.290).
 *     (2) Attackers-of-scoped AdvantageMod (grant) with alwaysTrue() predicate:
 *         ALL attackers get advantage, unconditionally (PHB p.290).
 *
 *   Returns { ok: false, issues: [{code:'CONDITION_NOT_FOUND', expected:'Blinded'}] }
 *   if the conditionResolver returns null.
 *
 * // TODO #513: ConditionResolver → runtime catalog per §1.2.
 */
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── ConditionResolver type ────────────────────────────────────────────────────

/**
 * Injected resolver — returns the ConditionDefinition for 'Blinded', or null
 * if the condition is not found in the catalog.
 */
export type ConditionResolver = (name: string) => ConditionDefinition | null;

// ── Issue codes ───────────────────────────────────────────────────────────────

export interface ConditionNotFoundIssue {
  code: 'CONDITION_NOT_FOUND';
  expected: string;
}

// ── Return type ───────────────────────────────────────────────────────────────

export type BuildBlindedResult =
  | { ok: true; instances: ModifierInstance[] }
  | { ok: false; issues: [ConditionNotFoundIssue] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Blinded condition.
 *
 * @param targetId          - ID of the entity that is blinded.
 * @param conditionResolver - Injected resolver — returns BLINDED_CONDITION_DEF
 *                           or null if not found.
 * @returns BuildBlindedResult — ok:true with instances, or ok:false with issues.
 */
export function buildBlindedModifiers(
  targetId: EntityId,
  conditionResolver: ConditionResolver,
): BuildBlindedResult {
  const def = conditionResolver('Blinded');

  if (def === null) {
    return {
      ok: false,
      issues: [{ code: 'CONDITION_NOT_FOUND', expected: 'Blinded' }],
    };
  }

  const instances: ModifierInstance[] = [];

  // ── (1) Self-scoped: blinded creature's own attacks → disadvantage ──────────
  // PHB p.290: "the creature's attack rolls have disadvantage"
  instances.push({
    id: iid(`blinded-self-${targetId}`),
    label: 'Blinded',
    def: def.selfMod,
    scope: {
      owner: targetId,
      target: { axis: 'self' },
      trigger: 'on-attack-roll',
    },
  });

  // ── (2) Attackers-of: ALL attackers → advantage (grant), unconditional ──────
  // PHB p.290: "Attack rolls against the creature have advantage."
  // UNCONDITIONAL — no range or weapon-kind gate (unlike Prone, PHB p.292-Prone).
  instances.push({
    id: iid(`blinded-outgoing-grant-${targetId}`),
    label: 'Blinded',
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

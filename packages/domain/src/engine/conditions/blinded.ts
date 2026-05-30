/**
 * Blinded condition definition.
 *
 * PHB p.290 — Appendix A: Conditions, Blinded:
 *   "A blinded creature can't see and automatically fails any ability check
 *    that requires sight."
 *   "Attack rolls against the creature have advantage, and the creature's
 *    attack rolls have disadvantage."
 *
 * REQ-COND-BLIND-01: outgoingMod grants advantage to ALL attackers UNCONDITIONALLY.
 * REQ-COND-BLIND-02: selfMod imposes disadvantage on the blinded creature's own attacks.
 * REQ-COND-BLIND-03: auto-fail sight checks DEFERRED (R2 — no sight metadata in engine yet).
 *
 * // TODO sight-check: auto-fail on ability checks requiring sight (PHB p.290) deferred
 * //                   to a future slice when sight-check metadata is added to the engine.
 * // TODO #513: Blinded condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 */
import type { ConditionDefinition } from './prone.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── BLINDED_CONDITION_DEF ─────────────────────────────────────────────────────

/**
 * The Blinded condition definition (PHB p.290).
 *
 * Self: own attack rolls have disadvantage (PHB p.290).
 * Outgoing (attackers-of axis):
 *   - advantage for ALL attackers UNCONDITIONALLY (PHB p.290)
 *   - grantPredicate = alwaysTrue() — no range/weapon check
 *   - imposePredicate = dead (Blinded never imposes disadvantage on attackers)
 */
export const BLINDED_CONDITION_DEF: ConditionDefinition = {
  name: 'Blinded',

  // PHB p.290: "the creature's attack rolls have disadvantage"
  selfMod: {
    kind: 'advantage',
    mode: 'impose', // own attack rolls at disadvantage
    rollType: 'attack',
  },

  outgoingMod: {
    // PHB p.290: "Attack rolls against the creature have advantage."
    // UNCONDITIONAL — no range or weapon-kind gate (unlike Prone, PHB p.292-Prone).
    grantPredicate: alwaysTrue(),

    // No impose predicate for Blinded — attackers never get disadvantage from this condition.
    // Dead predicate = not(alwaysTrue()) = always-false.
    imposePredicate: { op: 'not', node: alwaysTrue() },
  },
};

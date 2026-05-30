/**
 * Invisible condition definition — polar mirror of Blinded.
 *
 * PHB p.291 — Appendix A: Conditions, Invisible:
 *   "An invisible creature is impossible to see without the aid of magic or
 *    a special sense. For the purpose of hiding, the creature is heavily obscured.
 *    The creature's location can be detected by any noise it makes or any tracks
 *    it leaves."
 *   "Attack rolls against the creature have disadvantage, and the creature's
 *    attack rolls have advantage."
 *
 * REQ-COND-INVIS-01: outgoingMod imposes disadvantage on ALL attackers UNCONDITIONALLY.
 * REQ-COND-INVIS-02: selfMod grants advantage on the invisible creature's own attacks.
 *
 * // TODO #513: Invisible condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 */
import type { ConditionDefinition } from './prone.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── INVISIBLE_CONDITION_DEF ───────────────────────────────────────────────────

/**
 * The Invisible condition definition (PHB p.291).
 * Polar mirror of Blinded: grant/impose swap, self-adv vs self-disadv.
 *
 * Self: own attack rolls have ADVANTAGE (PHB p.291).
 * Outgoing (attackers-of axis):
 *   - DISADVANTAGE for ALL attackers UNCONDITIONALLY (PHB p.291)
 *   - imposePredicate = alwaysTrue() — no range/weapon check
 *   - grantPredicate = dead (Invisible never grants advantage to attackers)
 */
export const INVISIBLE_CONDITION_DEF: ConditionDefinition = {
  name: 'Invisible',

  // PHB p.291: "The creature's attack rolls have advantage"
  selfMod: {
    kind: 'advantage',
    mode: 'grant', // own attack rolls at advantage
    rollType: 'attack',
  },

  outgoingMod: {
    // PHB p.291: "attack rolls against the creature have disadvantage" — unconditional.
    imposePredicate: alwaysTrue(),

    // No grant predicate for Invisible — attackers never get advantage from this condition.
    // Dead predicate = not(alwaysTrue()) = always-false.
    grantPredicate: { op: 'not', node: alwaysTrue() },
  },
};

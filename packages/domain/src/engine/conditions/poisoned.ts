/**
 * Poisoned condition definition.
 *
 * PHB p.292 — Appendix A: Conditions, Poisoned:
 *   "A poisoned creature has disadvantage on attack rolls and ability checks."
 *
 * REQ-COND-POISON-01: self disadvantage on attack rolls (unconditional).
 * REQ-COND-POISON-02: self disadvantage on ability checks (unconditional).
 *
 * Design note (ADR-1): ConditionDefinition holds a single selfMod (attack).
 * The second self-mod (ability check disadvantage) is emitted directly by the
 * builder (buildPoisonedModifiers), matching the Prone multi-instance emit pattern.
 * outgoingMod both predicates are dead — Poisoned has zero outgoing effect on attackers.
 *
 * // TODO #513: Poisoned condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 */
import type { ConditionDefinition } from './prone.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── POISONED_CONDITION_DEF ────────────────────────────────────────────────────

/**
 * The Poisoned condition definition (PHB p.292).
 *
 * Self: attack rolls have disadvantage (PHB p.292).
 *       A second self-mod (check disadvantage) is emitted by the builder directly.
 * Outgoing: NONE — both predicates are dead.
 */
export const POISONED_CONDITION_DEF: ConditionDefinition = {
  name: 'Poisoned',

  // PHB p.292: "A poisoned creature has disadvantage on attack rolls"
  selfMod: {
    kind: 'advantage',
    mode: 'impose', // own attack rolls at disadvantage
    rollType: 'attack',
  },

  outgoingMod: {
    // Poisoned has no outgoing effect — both predicates are dead.
    // Dead predicate = not(alwaysTrue()) = always-false.
    grantPredicate: { op: 'not', node: alwaysTrue() },
    imposePredicate: { op: 'not', node: alwaysTrue() },
  },
};

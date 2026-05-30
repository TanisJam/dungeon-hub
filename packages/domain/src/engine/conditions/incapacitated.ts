/**
 * Incapacitated condition definition — hardcoded for slice 3a.
 *
 * PHB p.291 — Incapacitated:
 *   "An incapacitated creature can't take actions or reactions."
 *
 * REQ-COND-01: INCAPACITATED_CONDITION_DEF — inert in 3a (no action bus yet).
 * The condition name is queryable; its mechanical enforcement (action gate) is
 * deferred to a future action-economy slice.
 *
 * // TODO #513: Incapacitated condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 */
import type { ConditionDefinition } from './prone.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── INCAPACITATED_CONDITION_DEF ───────────────────────────────────────────────

/**
 * The Incapacitated condition definition (PHB p.291).
 *
 * Self: can't take actions or reactions — inert in 3a (no action bus).
 *       selfMod placeholder; enforcement deferred to action-economy slice.
 * Outgoing: no effects on attackers' rolls (PHB p.291 — no attacker advantage).
 *           grantPredicate / imposePredicate both inert (always-true grant with
 *           mode:'grant' would give advantage, so we use a neutral selfMod-style
 *           noop here — the outgoingMod shape is required by ConditionDefinition
 *           but the predicates will never fire advantage for Incapacitated).
 *
 * NOTE: Incapacitated ships as a NAMED, queryable condition. Its presence in
 * encounter_combatant_conditions is the point — future action bus reads it.
 */
export const INCAPACITATED_CONDITION_DEF: ConditionDefinition = {
  name: 'Incapacitated',

  // PHB p.291: creature can't take actions/reactions — inert mod; deferred to action bus.
  selfMod: {
    kind: 'advantage',
    mode: 'impose', // Placeholder: Incapacitated prevents actions (TODO action-economy slice)
    rollType: 'attack',
  },

  outgoingMod: {
    // PHB p.291: no advantage/disadvantage for attackers — inert predicates.
    // Using alwaysTrue() but in an imposePredicate would give disadvantage, so we
    // use a dead predicate that will never match (imposePredicate = not(alwaysTrue())).
    // grantPredicate is vacuous: alwaysTrue(), but we don't register this mod in 3a.
    grantPredicate: alwaysTrue(), // Not used — Incapacitated grants no advantage to attackers
    imposePredicate: { op: 'not', node: alwaysTrue() }, // Never true — no disadvantage either
  },
};

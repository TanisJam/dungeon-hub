/**
 * Stunned condition definition — hardcoded for slice 3a.
 *
 * PHB p.292 — Stunned:
 *   "A stunned creature is incapacitated (see the condition), can't move, and can
 *    speak only falteringly."
 *   "The creature automatically fails Strength and Dexterity saving throws."
 *   "Attack rolls against the creature have advantage."
 *
 * REQ-COND-02: STUNNED_CONDITION_DEF — outgoingMod grants advantage to ALL attackers
 * UNCONDITIONALLY (unlike Prone which is range/weapon-gated, PHB p.292 vs p.292-Prone).
 *
 * Effects split (ADR-3 sub-decision):
 *   (a) attackers-have-advantage → outgoingMod read by the ATTACK pipeline via
 *       threaded activeConditions/registry (ADR-6).
 *   (b) auto-fail STR/DEX saves → READ-PATH check in performForcedCheck (ADR-5),
 *       NOT a ConditionDefinition mod (it is a control-flow short-circuit, not a roll mod).
 *
 * // TODO #513: Stunned condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 * // TODO (3b): selfMod — Stunned creature can't take actions; deferred to action-economy slice.
 */
import type { ConditionDefinition } from './prone.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── STUNNED_CONDITION_DEF ─────────────────────────────────────────────────────

/**
 * The Stunned condition definition (PHB p.292).
 *
 * Self: creature is incapacitated (can't take actions/reactions), can't move.
 *       selfMod placeholder; enforcement deferred to action-economy slice (3b+).
 * Outgoing (attackers-of axis):
 *   - advantage for ALL attackers UNCONDITIONALLY (PHB p.292)
 *   - grantPredicate = alwaysTrue() — no range/weapon check (unlike Prone)
 *   - no imposePredicate (Stunned never imposes disadvantage on attackers)
 */
export const STUNNED_CONDITION_DEF: ConditionDefinition = {
  name: 'Stunned',

  // PHB p.292: stunned creature is incapacitated — inert mod; deferred to action bus (3b+).
  selfMod: {
    kind: 'advantage',
    mode: 'impose', // Placeholder: Stunned prevents actions (TODO action-economy 3b+)
    rollType: 'attack',
  },

  outgoingMod: {
    // PHB p.292: "Attack rolls against the creature have advantage."
    // UNCONDITIONAL — no range or weapon-kind gate (unlike Prone, PHB 292-Prone).
    // alwaysTrue() = { op: 'and', nodes: [] } = vacuous truth.
    grantPredicate: alwaysTrue(),

    // No impose predicate for Stunned — attackers never get disadvantage from this condition.
    // We use the same dead predicate as Incapacitated: not(alwaysTrue()) = always-false.
    imposePredicate: { op: 'not', node: alwaysTrue() },
  },
};

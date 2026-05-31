/**
 * Incapacitated condition definition + action-economy gate predicate.
 *
 * PHB p.290, Appendix A — Incapacitated:
 *   "An incapacitated creature can't take actions or reactions."
 *
 * REQ-COND-01: INCAPACITATED_CONDITION_DEF — condition definition (named, queryable).
 * REQ-INC-01:  isIncapacitated(conditions) — pure gate predicate (engine-incapacitated-gating).
 *
 * The gate predicate is a SEPARATE pure function; it does NOT run through the
 * modifier registry. See ADR-5 (sdd/engine-incapacitated-gating/design).
 *
 * // TODO #513: Incapacitated condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 */
import type { ConditionDefinition } from './prone.js';
import type { ConditionRef } from '../types.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── isIncapacitated predicate (REQ-INC-01) ────────────────────────────────────

/**
 * Returns true if and only if the given condition set contains an entry whose
 * name equals 'Incapacitated' (case-sensitive, PHB p.290).
 *
 * PHB p.290, Appendix A — "An incapacitated creature can't take actions or
 * reactions."
 *
 * Pure domain predicate — no IO, no DB, no side effects.
 * Action/reaction denial is enforced at the use-case gate by calling THIS
 * function, NOT by selfMod on INCAPACITATED_CONDITION_DEF (which is
 * intentionally never registered in the modifier registry).
 */
export function isIncapacitated(conditions: ConditionRef[]): boolean {
  return conditions.some((c) => c.name === 'Incapacitated');
}

// ── INCAPACITATED_CONDITION_DEF ───────────────────────────────────────────────

/**
 * The Incapacitated condition definition (PHB p.290).
 *
 * Self: can't take actions or reactions — enforced by the pure `isIncapacitated`
 *       predicate at the use-case gate (engine-incapacitated-gating, ADR-5).
 *       selfMod is a PLACEHOLDER and is intentionally never registered.
 * Outgoing: no effects on attackers' rolls (PHB p.290 — no attacker advantage).
 *           grantPredicate / imposePredicate both inert (always-true grant with
 *           mode:'grant' would give advantage, so we use a neutral selfMod-style
 *           noop here — the outgoingMod shape is required by ConditionDefinition
 *           but the predicates will never fire advantage for Incapacitated).
 *
 * NOTE: Incapacitated ships as a NAMED, queryable condition. Its presence in
 * encounter_combatant_conditions is the point — the isIncapacitated gate reads it.
 */
export const INCAPACITATED_CONDITION_DEF: ConditionDefinition = {
  name: 'Incapacitated',

  // Placeholder — Incapacitated's action/reaction denial is enforced by the pure
  // `isIncapacitated` predicate at the use-case gate, NOT by this mod.
  // selfMod is intentionally never registered (ADR-5, engine-incapacitated-gating).
  selfMod: {
    kind: 'advantage',
    mode: 'impose',
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

/**
 * Grappled condition definition — hardcoded for this slice.
 *
 * PHB p.290, Appendix A — Grappled:
 *   "A grappled creature's speed becomes 0, and it can't benefit from any bonus
 *    to its speed."
 *   "The condition ends if the grappler is incapacitated (see the condition)."
 *   "The condition also ends if an effect removes the grappled creature from the
 *    reach of the grappler or grappling effect."
 *
 * REQ-COND-01..04 (engine-contested-checks/spec).
 *
 * Speed=0: PHB p.290 says the grappled creature's speed becomes 0. This is NOT
 *   expressible via the AdvantageMod shape — there is no movement subsystem in
 *   the engine. selfMod is a PLACEHOLDER that is intentionally never registered
 *   in the modifier registry (same ADR-5 stance as INCAPACITATED_CONDITION_DEF).
 *
 * // TODO #513: Grappled condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 *
 * Expiry: "Ends if grappler incapacitated or removed from reach" (PHB p.290).
 * Enforcement is OUT OF SCOPE for B9 — no condition-expiry engine exists.
 * The `appliedByCombatantId` column in encounter_combatant_conditions records the
 * grappler so a FUTURE expiry sweep can read it. The escape action reads it to
 * identify the grappler for the contest.
 */

import type { ConditionDefinition } from './prone.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── GRAPPLED_CONDITION_DEF ────────────────────────────────────────────────────

/**
 * The Grappled condition definition (PHB p.290).
 *
 * Self: speed becomes 0 — deferred (no movement subsystem; AdvantageMod cannot
 *       express speed). selfMod is a placeholder, never registered (ADR-5, same
 *       as INCAPACITATED_CONDITION_DEF).
 * Outgoing (attackers-of axis): PHB p.290 is SILENT on attacker rolls.
 *   Being grappled does NOT grant advantage to attackers (unlike Stunned/Petrified),
 *   and does NOT impose disadvantage either. Both predicates are inert:
 *   - grantPredicate: alwaysTrue() — structurally present, never registered
 *   - imposePredicate: not(alwaysTrue()) — dead predicate, never fires
 */
export const GRAPPLED_CONDITION_DEF: ConditionDefinition = {
  name: 'Grappled',

  // Placeholder — speed=0 is NOT expressible via AdvantageMod.
  // selfMod is intentionally never registered in the modifier registry (ADR-5).
  // // TODO #513: speed enforcement deferred to catalog→DB migration.
  selfMod: {
    kind: 'advantage',
    mode: 'impose',
    rollType: 'attack',
  },

  outgoingMod: {
    // PHB p.290: no attacker advantage against grappled creatures.
    // grantPredicate is vacuous (alwaysTrue()) but this mod is never registered
    // in the 3a modifier registry — predicates are inert placeholders.
    grantPredicate: alwaysTrue(), // No attacker advantage (PHB p.290 silent on attack rolls)

    // PHB p.290: no disadvantage on attackers either.
    // Dead predicate = not(alwaysTrue()) = always-false — never fires.
    imposePredicate: { op: 'not', node: alwaysTrue() }, // Never true — no disadvantage
  },
};

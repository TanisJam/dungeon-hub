/**
 * Prone condition definition — hardcoded for this slice.
 *
 * // PHB 292 (Appendix A — Conditions, Prone):
 * // "A prone creature's only movement option is to crawl, unless it stands up...
 * // The creature has disadvantage on attack rolls. An attack roll against the
 * // creature has advantage if the attacker is within 5 feet of the creature.
 * // Otherwise, the attack roll has disadvantage."
 *
 * REQ-PRONE-01: AdvantageMod self-disadvantage + outgoing-aware grant/impose.
 *
 * // TODO #513: Prone condition record hardcoded for this slice; conditions
 * //            catalog → DB per §1.2. When the runtime catalog lands, this
 * //            module is replaced by a ConditionResolver that reads the DB.
 */
import type { AdvantageMod } from '../types.js';
import type { Predicate } from '../predicate/types.js';
import { and, attackerWithin, not, weaponKind } from '../predicate/ast.js';

// ── ConditionDefinition ───────────────────────────────────────────────────────

/**
 * Minimal ConditionDefinition shape for this slice.
 * The full catalog shape is deferred to the conditions catalog SDD.
 */
export interface ConditionDefinition {
  name: string;
  /**
   * Self modifier: applied to the prone creature's OWN rolls.
   * PHB 292: disadvantage on attack rolls.
   */
  selfMod: AdvantageMod;
  /**
   * Outgoing modifier: applied to attack rolls AGAINST the prone creature.
   * Predicated — grant (advantage) within 5ft melee, impose (disadvantage) ranged/far.
   */
  outgoingMod: {
    grantPredicate: Predicate;  // attacker gets advantage when this is true
    imposePredicate: Predicate; // attacker gets disadvantage when this is true
  };
}

// ── PRONE_CONDITION_DEF ───────────────────────────────────────────────────────

/**
 * The Prone condition definition (PHB 292).
 *
 * Self: disadvantage on own attack rolls.
 * Outgoing (attackers-of axis):
 *   - advantage when attacker is melee AND within 5ft  (PHB 292)
 *   - disadvantage when ranged OR beyond 5ft            (PHB 292)
 */
export const PRONE_CONDITION_DEF: ConditionDefinition = {
  name: 'Prone',

  selfMod: {
    kind: 'advantage',
    mode: 'impose',    // disadvantage on prone creature's own attacks
    rollType: 'attack',
  },

  outgoingMod: {
    // Advantage for attackers: melee weapon AND within 5ft
    grantPredicate: and(attackerWithin(5), weaponKind('melee')),

    // Disadvantage for attackers: NOT (within 5ft AND melee)
    // i.e. ranged attackers, or melee attackers farther than 5ft
    imposePredicate: not(and(attackerWithin(5), weaponKind('melee'))),
  },
};

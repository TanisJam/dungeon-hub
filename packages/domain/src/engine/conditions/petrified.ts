/**
 * Petrified condition definition — domain layer.
 *
 * PHB p.291 — Petrified:
 *   "A petrified creature is transformed, along with any nonmagical objects
 *    it is wearing or carrying, into a solid inanimate substance (usually stone)."
 *   "The creature's weight increases by a factor of ten, and it ceases aging."
 *   "The creature is incapacitated (see the condition), can't move or speak,
 *    and is unaware of its surroundings."
 *   "Attack rolls against the creature have advantage."
 *   "The creature automatically fails Strength and Dexterity saving throws."
 *   "The creature has resistance to all damage."
 *   "The creature is immune to poison and disease, although a poison or disease
 *    already in its system is suspended, not neutralized."
 *
 * Implementation notes:
 * - `selfMod` STAYS `AdvantageMod` — NO ConditionDefinition type change (ADR-5).
 *   The resistance/immunity is emitted by buildPetrifiedModifiers as ResistMod[],
 *   NOT through selfMod (mirrors how poisoned emits a second instance outside def).
 * - outgoingMod grants advantage unconditionally (alwaysTrue) — mirror Stunned.
 * - Auto-fail STR/DEX saves: READ-PATH check in performForcedCheck (ADR-5/ADR-6),
 *   NOT a ConditionDefinition mod.
 * - Can't move / can't speak / unaware / weight×10 / aging: UNMODELED (ADR-8).
 *
 * // TODO #513: conditions catalog → DB per §1.2.
 * // TODO (action-economy): selfMod action gate deferred (parallel to Stunned 3b).
 */
import type { ConditionDefinition } from './prone.js';
import { alwaysTrue } from '../predicate/ast.js';

// ── PETRIFIED_CONDITION_DEF ───────────────────────────────────────────────────

/**
 * The Petrified condition definition (PHB p.291).
 *
 * Self: creature is incapacitated (can't take actions/reactions).
 *       selfMod placeholder; enforcement deferred to action-economy slice.
 * Outgoing (attackers-of axis):
 *   - advantage for ALL attackers UNCONDITIONALLY (PHB p.291)
 *   - grantPredicate = alwaysTrue() — mirror Stunned (no range/weapon gate)
 *   - no imposePredicate (Petrified never imposes disadvantage on attackers)
 *
 * ADR-5: selfMod stays AdvantageMod. ResistMods live in buildPetrifiedModifiers.
 */
export const PETRIFIED_CONDITION_DEF: ConditionDefinition = {
  name: 'Petrified',

  // PHB p.291: Petrified creature is incapacitated — inert mod; deferred to
  // action-economy slice (parallel to Stunned 3b+).
  selfMod: {
    kind: 'advantage',
    mode: 'impose', // Placeholder: Petrified prevents actions (TODO action-economy)
    rollType: 'attack',
  },

  outgoingMod: {
    // PHB p.291: "Attack rolls against the creature have advantage."
    // UNCONDITIONAL — no range or weapon-kind gate (same as Stunned, PHB p.291).
    // alwaysTrue() = { op: 'and', nodes: [] } = vacuous truth.
    grantPredicate: alwaysTrue(),

    // No impose predicate — Petrified never disadvantages attackers.
    // Dead predicate = not(alwaysTrue()) = always-false.
    imposePredicate: { op: 'not', node: alwaysTrue() },
  },
};

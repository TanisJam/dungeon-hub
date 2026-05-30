/**
 * buildSneakAttackRider — Sneak Attack conditional on-hit damage rider factory.
 *
 * PHB p.96 — Sneak Attack:
 *   "Beginning at 1st level, you know how to strike subtly and exploit a foe's
 *   distraction. Once per turn, you can deal an extra 1d6 damage to one creature
 *   you hit with an attack if you have advantage on the attack roll. The attack
 *   must use a finesse or a ranged weapon.
 *
 *   You don't need advantage on the attack roll if another enemy of the target
 *   is within 5 feet of it, that enemy isn't incapacitated, and you don't have
 *   disadvantage on the attack roll.
 *
 *   The amount of the extra damage increases as you gain levels in this class,
 *   as shown in the Sneak Attack column of the Rogue table."
 *
 * PHB p.147 — Finesse property.
 * PHB p.173 — Advantage/Disadvantage roll mode mechanics.
 *
 * ---
 *
 * CALLER CONTRACT (engine is stateless):
 *   The engine does NOT verify:
 *     - Whether this is actually the first Sneak Attack this turn.
 *     - Whether an ally is adjacent to the target and not incapacitated.
 *   These are the CALLER's responsibility:
 *     - Assert `sneakAttackFirstThisTurn: true` in runtimeDecisions only when
 *       it is the first Sneak Attack this turn (PHB p.96: "Once per turn").
 *     - Assert `sneakAttackSpatialAssert: true` in runtimeDecisions only when
 *       an enemy of the target is within 5ft and not incapacitated (PHB p.96).
 *   PHB p.96. Cooperative DM-mediated application; no positional/turn state.
 *
 * ---
 *
 * Design ref: sdd/engine-sneak-attack/design — ADR-3, ADR-6, Option A1.
 * Mirrors buildOnHitDamageRider (on-hit-damage-rider.ts) with an instance predicate.
 */
import type { EntityId, DiceExpr } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import { and, or, not, hasRollMode, runtimeDecision, hasWeaponProperty, weaponKind } from '../predicate/ast.js';
import type { Predicate } from '../predicate/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Predicate ─────────────────────────────────────────────────────────────────

/**
 * Full Sneak Attack eligibility predicate (PHB p.96/p.147/p.173):
 *
 * AND(
 *   OR(hasWeaponProperty('finesse'), weaponKind('ranged')),  // PHB p.96/p.147
 *   runtimeDecision('sneakAttackFirstThisTurn', true),       // PHB p.96 once-per-turn
 *   OR(
 *     hasRollMode('advantage'),                              // PHB p.173 advantage branch
 *     AND(
 *       runtimeDecision('sneakAttackSpatialAssert', true),  // PHB p.96 ally-within-5ft
 *       NOT(hasRollMode('disadvantage')),                    // PHB p.96 no disadvantage
 *     ),
 *   ),
 * )
 *
 * All leaves return false (NOT throw) when ctx data is absent — REQ-SA-WQ-01.
 * The caller-asserted leaves (sneakAttackFirstThisTurn, sneakAttackSpatialAssert)
 * are engine-side opt-ins enforced by caller trust. See CALLER CONTRACT above.
 */
const SNEAK_ATTACK_PREDICATE: Predicate = and(
  // Weapon gate: finesse OR ranged — PHB p.96, PHB p.147
  or(
    hasWeaponProperty('finesse'),
    weaponKind('ranged'),
  ),
  // Once-per-turn gate — PHB p.96 (caller-asserted)
  runtimeDecision('sneakAttackFirstThisTurn', true),
  // Eligibility branch: advantage OR (spatial ally + no disadvantage)
  or(
    // Advantage branch — PHB p.173
    hasRollMode('advantage'),
    // Spatial branch — PHB p.96
    and(
      runtimeDecision('sneakAttackSpatialAssert', true), // ally within 5ft, not incapacitated
      not(hasRollMode('disadvantage')),                   // must NOT have disadvantage
    ),
  ),
);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a single conditional on-hit Sneak Attack damage modifier instance.
 *
 * The rider fires ONLY when the full eligibility predicate passes (weapon gate +
 * once-per-turn + advantage OR spatial branch). It is STATELESS — no usage
 * counting, no turn tracking.
 *
 * @param attackerId  - Entity ID of the Rogue attacker (scopes the rider on the attacker).
 * @param targetId    - Entity ID of the target (embedded in instance ID for bookkeeping).
 * @param dice        - Pre-computed dice expression: `${Math.ceil(rogueLevel / 2)}d6`.
 *                      Caller (use-case) computes rogueLevel and passes the result.
 * @returns Array of 1 ModifierInstance (on-hit NumMod, axis='entities', trigger='on-hit').
 *
 * scope.target.ids = [attackerId]: the rider is owned by and queried via the
 * ATTACKER, so `registry.query({trigger:'on-hit', self:attackerId})` finds it.
 * This mirrors buildOnHitDamageRider (on-hit-damage-rider.ts:62: ids:[attackerId]).
 * targetId is embedded only in the id for bookkeeping / future target-tracking.
 */
export function buildSneakAttackRider(
  attackerId: EntityId,
  targetId: EntityId,
  dice: DiceExpr,
): ModifierInstance[] {
  return [
    {
      id: iid(`sneak-attack-${attackerId}-${targetId}-${dice}`),
      label: 'Sneak Attack',
      def: {
        kind: 'num',
        op: 'add',
        value: dice,
        stat: 'damage',
        category: 'untyped',
      },
      scope: {
        owner: attackerId,
        target: { axis: 'entities', ids: [attackerId] },
        trigger: 'on-hit',
      },
      predicate: SNEAK_ATTACK_PREDICATE,
    },
  ];
}

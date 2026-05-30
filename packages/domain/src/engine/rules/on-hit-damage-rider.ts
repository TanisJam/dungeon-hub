/**
 * buildOnHitDamageRider — on-hit damage modifier factory.
 *
 * // PHB p.251 — Hunter's Mark: "deal an extra 1d6 damage to the target
 * // whenever you hit it with a weapon attack." (+1d6 on-hit damage exemplar)
 *
 * This factory is the ON_HIT damage-hook mechanism exemplar for Slice 2 of the
 * action pipeline. It does NOT implement full Hunter's Mark target-tracking or
 * concentration — those are explicitly out of scope (Slice 2b / later).
 *
 * Mirrors buildBlessModifiers (bless.ts) in structure: pure fn, no IO,
 * returns plain JSON-serializable ModifierInstance[].
 *
 * Design ref: sdd/engine-action-pipeline-onhit/design — "Rider factory" section.
 * ADR-7: domain-only, zero api change.
 */
import type { EntityId, DiceExpr } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a single on-hit damage modifier instance.
 *
 * @param attackerId  - Entity ID of the attacker who owns this modifier.
 * @param targetId    - Entity ID of the target this rider applies to.
 * @param dice        - Dice expression for the extra damage (e.g. '1d6', '2d6').
 * @param label       - Human-readable label surfaced in damage.breakdown provenance.
 * @param damageType  - Optional damage type (e.g. 'piercing'). Not yet consumed by
 *                      breakdown assembly; reserved for future typed-damage filtering.
 * @returns Array of 1 ModifierInstance (on-hit NumMod, axis='entities', trigger='on-hit').
 */
export function buildOnHitDamageRider(
  attackerId: EntityId,
  targetId: EntityId,
  dice: DiceExpr,
  label: string,
  _damageType?: string,
): ModifierInstance[] {
  // The mod is owned by and scoped TO the attacker (axis='entities', ids=[attackerId]).
  // This ensures registry.query({trigger:'on-hit', self:attackerId, ...}) finds it.
  // targetId is embedded in the instance id for bookkeeping (future target-tracking).
  return [
    {
      id: iid(`on-hit-rider-${attackerId}-${targetId}-${dice}`),
      label,
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
    },
  ];
}

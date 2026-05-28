/**
 * buildBlessModifiers — Bless rule encoding.
 *
 * // PHB 219: "Up to three creatures of your choice that you can see within
 * // range are blessed until the spell ends. Whenever a target makes an attack
 * // roll or a saving throw before the spell ends, the target can roll a d4
 * // and add the number rolled to the attack roll or saving throw."
 * // Concentration, 1 minute.
 *
 * REQ-BLESS-01: cross-entity NumMod '1d4', concentration cleanup via
 * concentrationToken, round-trip serializable (plain JSON instances).
 *
 * Design:
 *   - Emits 2 ModifierInstance entries PER target (attack-roll + saving-throw).
 *   - Each instance is OWNED by the caster but scoped to the individual target
 *     via axis='entities' (the cross-entity case — design §"Bless trace").
 *   - All instances carry the same concentrationToken in their DurationSpec so
 *     registry.removeByConcentrationToken(token) cleans them all atomically.
 *   - Each instance carries a human-readable label `Bless (<casterId>)` which
 *     applyStacking surfaces in Source.label for breakdown traceability.
 *   - Pure: no IO, no registry access. Returns plain ModifierInstance[].
 *
 * // TODO #513: ConcentrationResolver (tracking which spells are active)
 * //            will replace the caller supplying the raw token; this is the
 * //            intermediate hardcoded-token form per §1.2.
 */
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Bless spell.
 *
 * @param casterId          - Entity ID of the caster who cast Bless.
 * @param targetIds         - IDs of the blessed targets (up to 3, PHB 219).
 * @param concentrationToken - Stable token linking all instances to this
 *                            concentration slot. Caller generates it once
 *                            (e.g. UUID) and passes to registry.removeByConcentrationToken
 *                            when concentration ends.
 * @returns Array of ModifierInstance to register (2 per target: attack-roll +
 *          saving-throw).
 */
export function buildBlessModifiers(
  casterId: EntityId,
  targetIds: EntityId[],
  concentrationToken: string,
): ModifierInstance[] {
  const instances: ModifierInstance[] = [];

  // Human-readable label — used in Source.label via inst.label field.
  const label = `Bless (${casterId})`;

  for (const targetId of targetIds) {
    // ── Attack-roll instance ─────────────────────────────────────────────────
    // ID is unique per target; label is shared (human-readable for breakdown).
    instances.push({
      id: iid(`bless-attack-${casterId}-${targetId}`),
      label,
      def: {
        kind: 'num',
        op: 'add',
        value: '1d4',
        stat: 'attack-roll',
        category: 'untyped',
      },
      scope: {
        owner: casterId,
        target: { axis: 'entities', ids: [targetId] },
        trigger: 'always',
      },
      duration: {
        unit: 'minute',
        amount: 1,
        endsOn: ['concentration-ends'],
        concentrationToken,
      },
    });

    // ── Saving-throw instance ─────────────────────────────────────────────────
    instances.push({
      id: iid(`bless-save-${casterId}-${targetId}`),
      label,
      def: {
        kind: 'num',
        op: 'add',
        value: '1d4',
        stat: 'saving-throw',
        category: 'untyped',
      },
      scope: {
        owner: casterId,
        target: { axis: 'entities', ids: [targetId] },
        trigger: 'always',
      },
      duration: {
        unit: 'minute',
        amount: 1,
        endsOn: ['concentration-ends'],
        concentrationToken,
      },
    });
  }

  return instances;
}

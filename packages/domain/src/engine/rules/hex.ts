/**
 * buildHexRider — Hex on-hit necrotic damage rider factory.
 *
 * PHB p.251 — Hex:
 *   "You place a curse on a creature that you can see within range. Until the spell ends,
 *   you deal an extra 1d6 necrotic damage to the target whenever you hit it with an attack."
 *
 * Not melee-restricted (PHB p.251: "whenever you hit it with an attack" — no weapon kind gate).
 * Not level-scaled (fixed 1d6, no table; contrast Sneak Attack which scales per level).
 * Fires on EVERY qualifying hit — no once-per-turn gate (contrast Sneak Attack's PHB p.96 restriction).
 *
 * On critical hits, the 1d6 doubles to 2d6 automatically via rollDamageBreakdown's
 * standard crit path. PHB p.196: "Roll all of the attack's damage dice twice."
 *
 * The hasEffectFromSelf('Hex') predicate reads ctx.attackerCombatantId (combatant UUID)
 * vs effect.sourceCombatantId — NOT the character EntityId. Identity-space separation
 * per ADR-2 in the engine-hex design.
 *
 * TODO #513: effect definition hardcoded pending DB-owned reference data.
 *
 * Design ref: sdd/engine-hex/design — ADR-1, ADR-2, ADR-4.
 * Mirrors buildSneakAttackRider (sneak-attack.ts) with hasEffectFromSelf predicate.
 */
import { hasEffectFromSelf } from '../predicate/ast.js';
import { buildOnHitDamageRider } from './on-hit-damage-rider.js';
import type { EntityId, DiceExpr } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Predicate ─────────────────────────────────────────────────────────────────

/**
 * Hex predicate — Slice A leaf: reads ctx.targetCombatantEffects + ctx.attackerCombatantId.
 * Returns false (NOT throws) when those context fields are absent (non-attack contexts).
 * null !== any UUID → always false for null-source effects (ON DELETE SET NULL semantics).
 * PHB p.251 — only the CASTER's own Hex damages; this prevents B firing A's Hex.
 */
const HEX_PREDICATE = hasEffectFromSelf('Hex');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a single conditional on-hit Hex necrotic damage modifier instance.
 *
 * The rider fires ONLY when the target has a Hex effect sourced from this exact
 * attacker's combatant UUID (PHB p.251). Unconditionally registered in
 * buildAttackContext — the predicate, not a class gate, decides firing.
 *
 * @param attackerId - Character EntityId of the attacker (scopes the rider to the attacker).
 * @param targetId   - Character EntityId of the target (embedded in id for bookkeeping).
 * @returns Array of 1 ModifierInstance (on-hit NumMod, 1d6 necrotic, trigger='on-hit').
 */
export function buildHexRider(attackerId: EntityId, targetId: EntityId): ModifierInstance[] {
  // PHB p.251 — +1d6 necrotic, NOT level-scaled. TODO #513: effect definition hardcoded pending DB-owned reference data.
  // buildOnHitDamageRider always returns exactly 1 element; we override id and attach the predicate.
  // Explicit construction (not spread) required by exactOptionalPropertyTypes.
  const base = buildOnHitDamageRider(attackerId, targetId, '1d6' as DiceExpr, 'Hex', 'necrotic')[0]!;
  const inst: ModifierInstance = {
    id: `hex-${attackerId}-${targetId}-1d6` as import('../registry/types.js').ModifierInstanceId,
    def: base.def,
    scope: base.scope,
    label: 'Hex',
    predicate: HEX_PREDICATE,
  };
  return [inst];
}

/**
 * Rage condition — domain layer.
 *
 * PHB p.48 — Rage:
 *   Starting at 1st level, you can go into a rage as a bonus action. While raging,
 *   you gain the following benefits if you aren't wearing heavy armor:
 *   - You have advantage on Strength checks and Strength saving throws.
 *   - When you make a melee weapon attack using Strength, you gain a bonus to the
 *     damage roll that increases as you gain levels as a barbarian.
 *   - You have resistance to bludgeoning, piercing, and slashing damage.
 *   - You can't cast spells or concentrate on them while raging.
 *   Your rage lasts for 1 minute.
 *
 * Implementation notes:
 * - 'Raging' is an open-string condition, NOT a ConditionDefinition (ADR-2:
 *   RAGING_CONDITION_DEF is intentionally skipped — Rage has no outgoing attackers-of
 *   mod that needs a def; all mods are emitted directly by buildRageModifiers).
 * - isRaging: pure gate predicate matching literal 'Raging' (case-sensitive).
 *   Mirrors isIncapacitated in packages/domain/src/engine/conditions/incapacitated.ts.
 * - Action-economy gate (can't cast while raging) is enforced at the use-case layer
 *   via isRaging check, NOT through a ConditionDefinition selfMod.
 *
 * REQ-RAGE-04, REQ-RAGE-06, REQ-RAGE-08, REQ-RAGE-09
 * // TODO #513: conditions catalog → DB per §1.2.
 */
import type { ConditionRef } from '../types.js';

// ── isRaging predicate (REQ-RAGE-06) ─────────────────────────────────────────

/**
 * Returns true if and only if the given condition set contains an entry whose
 * name equals 'Raging' (case-sensitive, PHB p.48).
 *
 * PHB p.48: A barbarian is raging only while the 'Raging' condition is active.
 * The condition is self-applied by the activate-rage use-case and persists until
 * one of the end-early conditions fires (attacked hostile, took damage, 10 rounds,
 * 0 HP, or voluntary deactivation).
 *
 * Pure domain predicate — no IO, no DB, no side effects.
 * Cast-spell denial is enforced at the use-case gate by calling THIS function,
 * NOT by a selfMod on a ConditionDefinition (ADR-2).
 */
export function isRaging(conditions: ConditionRef[]): boolean {
  return conditions.some((c) => c.name === 'Raging');
}

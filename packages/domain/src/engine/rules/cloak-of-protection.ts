/**
 * buildCloakOfProtectionModifiers — Cloak of Protection magic item.
 *
 * // DMG 159 (Magic Items — Cloak of Protection): "+1 bonus to AC and saving throws
 * // while you wear this cloak."
 *
 * REQ-RULE-CLOAK-01: authored via the DSL pipeline (parseRule → compileRule).
 *
 * Emits 2 ModifierInstance entries:
 *   - NumMod{stat:'ac', value:1, category:'item'}      — AC bonus
 *   - NumMod{stat:'saving-throw', value:1, category:'item'}  — all-saves bonus
 *
 * Item stacking: two cloaks only apply one AC bonus and one save bonus each
 * (keep-highest within the 'item' category — REQ-RESOLVE-01 stacking rules).
 *
 * The flat 'saving-throw' stat applies to all saving throws via the T2.6 all-saves
 * semantic: when resolving a per-ability save ('saving-throw.con', etc.), the engine
 * also includes flat 'saving-throw' num mods.
 *
 * Pure: no IO, no registry access. Returns plain ModifierInstance[].
 */
import { compileRule } from '../authoring/compile.js';
import { cloakOfProtectionRuleDoc } from '../rules-authored/cloak-of-protection.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Compile once (pure; no IO) ─────────────────────────────────────────────────

const compiled = compileRule(cloakOfProtectionRuleDoc);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for a Cloak of Protection item.
 *
 * @param charId - Entity ID of the character wearing the cloak.
 * @param itemId - Unique instance ID for this cloak (use item instance UUID in production).
 *                 Distinguishes two copies of the same item so they can be registered
 *                 separately; the item stacking (keep-highest) is applied by the engine.
 * @returns Array of ModifierInstance to register (2: AC + saving-throw bonuses).
 */
export function buildCloakOfProtectionModifiers(
  charId: EntityId,
  itemId: string,
): ModifierInstance[] {
  // DMG 159: +1 AC + +1 saving throws (all saves — flat 'saving-throw' category:item).
  return compiled.build({ charId, itemId });
}

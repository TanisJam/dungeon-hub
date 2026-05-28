/**
 * buildResilientConModifiers — Resilient (Constitution) feat save proficiency.
 *
 * // PHB 168 (Feats — Resilient): "Choose one ability score. You gain proficiency
 * // in saving throws using the chosen ability."
 * // SCOPE: Only the save-proficiency grant. The +1 CON ASI is a separate
 * // composition and is explicitly OUT OF SCOPE for this rule.
 *
 * REQ-RULE-RESILIENT-01: authored via the DSL pipeline (parseRule → compileRule).
 *
 * DEDUP NOTE: The "already proficient" dedup is read-time / final-validation only.
 * This builder always produces and emits the ProficiencyMod instance regardless of
 * whether the character already has Con-save proficiency from another source.
 * The dedup gate (PROFICIENCY_ALREADY_GRANTED) runs in engine/validate/character-final.ts.
 *
 * Pure: no IO, no registry access. Returns plain ModifierInstance[].
 */
import { compileRule } from '../authoring/compile.js';
import { resilientConRuleDoc } from '../rules-authored/resilient-con.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Compile once (pure; no IO) ─────────────────────────────────────────────────

const compiled = compileRule(resilientConRuleDoc);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for Resilient (Constitution).
 *
 * Produces ONE ProficiencyMod{domain:'save', ref:'con'} instance scoped to charId.
 * Included in breakdown when resolveStat(charId, 'saving-throw.con', ..., pb) is called.
 *
 * @param charId - Entity ID of the character with the Resilient (Con) feat.
 * @returns Array of ModifierInstance to register (1: Con-save proficiency).
 */
export function buildResilientConModifiers(charId: EntityId): ModifierInstance[] {
  // PHB 168: Resilient (Constitution) — save proficiency grant (scope: self).
  return compiled.build({ charId });
}

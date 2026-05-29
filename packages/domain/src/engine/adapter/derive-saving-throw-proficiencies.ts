/**
 * derive-saving-throw-proficiencies — class save proficiencies → ProficiencyMod[] adapter.
 *
 * Pure domain helper. No IO, no registry access.
 *
 * Converts the primary class's saving throw proficiency list into
 * ProficiencyMod ModifierInstance[] ready for registry.register().
 *
 * One ProficiencyMod{domain:'save', ref:ability} per ability in the input.
 * Multiclass filtering (PHB p.164: first class only) lives at the CALL SITE
 * in the route — this adapter's contract is PRIMARY-CLASS saves only.
 *
 * §4b guardrail: label uses ability slug only ("Class save (STR)"),
 * NOT a hardcoded class display name. Display name resolution is the
 * presentation layer's responsibility.
 *
 * REQ-DSTP-01, REQ-DSTP-02, REQ-DSTP-03
 */

import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives ProficiencyMod instances from a class's saving throw proficiency list.
 *
 * @param primaryClassSavingThrows - AbilityKey[] from classes[0].savingThrows.
 *   PHB p.164: only the first class grants saving throw proficiencies on multiclass.
 *   Route is responsible for passing only classes[0].savingThrows.
 * @param charId - EntityId of the owning character.
 * @returns Flat array of ModifierInstances ready for registry.register().
 *   Empty input ([] or undefined) → [].
 */
export function deriveSavingThrowProficiencies(
  primaryClassSavingThrows: string[],
  charId: EntityId,
): ModifierInstance[] {
  // Guard: tolerate-read for legacy snapshots missing classes/savingThrows (REQ-TOLREAD-01)
  return (primaryClassSavingThrows ?? []).map((ability) => ({
    id: `save-prof-${ability}` as ModifierInstanceId,
    def: {
      kind: 'proficiency' as const,
      domain: 'save' as const,
      ref: ability,
    },
    scope: {
      owner: charId,
      target: { axis: 'self' as const },
      trigger: 'always' as const,
    },
    // §4b guardrail: slug-only label, NO hardcoded class display name (PHB name lives in compendium DB)
    label: `Class save (${ability.toUpperCase()})`,
  }));
}

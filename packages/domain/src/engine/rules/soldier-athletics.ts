/**
 * buildSoldierAthleticsModifiers — Soldier background Athletics proficiency.
 *
 * // PHB 140 (Backgrounds — Soldier): "Skill Proficiencies: Athletics, Intimidation."
 *
 * REQ-RULE-SOLDIER-01: authored via the DSL pipeline (parseRule → compileRule).
 * The RuleDoc is defined in rules-authored/soldier-athletics.ts and compiled
 * here to produce the ModifierInstance[] builder.
 *
 * Design ref: sdd/authoring-dsl/design — Worked example A, Decision 5 (module layout).
 *
 * This is the Slice 2 exemplar demonstrating the authoring pipeline:
 *   1. Author a RuleDoc (plain object, equivalent to a YAML file parsed at use-case layer)
 *   2. Run it through compileRule to get a CompiledRule
 *   3. The builder function (build) is the public API callers use
 *
 * Pure: no IO, no registry access. Returns plain ModifierInstance[].
 *
 * // TODO #513: once DB-injected resolver lands, the RuleDoc will be loaded from
 *   the modifier_definition table rather than a static file.
 */
import { compileRule } from '../authoring/compile.js';
import { soldierAthleticsRuleDoc } from '../rules-authored/soldier-athletics.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Compile once (pure; no IO) ─────────────────────────────────────────────────

const compiled = compileRule(soldierAthleticsRuleDoc);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Soldier background Athletics proficiency.
 *
 * Produces ONE ProficiencyMod instance scoped to charId (axis='self').
 * This grants proficiency in Athletics — included in breakdown when
 * resolveStat(charId, 'skill.athletics', base, ctx, registry, proficiencyBonus)
 * is called.
 *
 * @param charId - Entity ID of the character with the Soldier background.
 * @returns Array of ModifierInstance to register (1: Athletics proficiency).
 */
export function buildSoldierAthleticsModifiers(charId: EntityId): ModifierInstance[] {
  // Run through the compiled rule with resolved params.
  // PHB 140: Soldier (background) grants Skill Proficiency: Athletics.
  return compiled.build({ charId });
}

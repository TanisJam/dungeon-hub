/**
 * buildFrightenedModifiers — Frightened condition.
 *
 * // PHB 290 (Appendix A — Frightened): "A frightened creature has disadvantage
 * // on ability checks and attack rolls while the source of its fear is within
 * // its line of sight."
 * // SCOPE: movement restriction ("can't move closer") is out of scope.
 * // Only the roll-disadvantage half is encoded.
 *
 * REQ-RULE-FRIGHTENED-01: authored via the DSL pipeline (parseRule → compileRule).
 *
 * Emits 2 ModifierInstance entries (disadvantage on attack + check), each carrying
 * a predicate: {op:'query', q:{kind:'canSee', entity:'self', of:'caster'}} —
 * the disadvantage applies ONLY while the fear source is visible.
 *
 * REUSES the existing `canSee` WorldQuery leaf — NO new primitive added.
 *
 * The engine's canSee evaluator uses:
 *   - ctx.currentAction.id as the casterId (fear source ID)
 *   - ctx.visibility.selfCanSee.includes(casterId) to resolve visibility
 * Callers MUST populate ctx.currentAction.id with the fear source ID and
 * ctx.visibility.selfCanSee appropriately.
 *
 * Pure: no IO, no registry access. Returns plain ModifierInstance[].
 */
import { compileRule } from '../authoring/compile.js';
import { frightenedRuleDoc } from '../rules-authored/frightened.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Compile once (pure; no IO) ─────────────────────────────────────────────────

const compiled = compileRule(frightenedRuleDoc);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Frightened condition.
 *
 * Produces 2 AdvantageMod{mode:'impose'} instances:
 *   - rollType:'attack' — disadvantage on attack rolls
 *   - rollType:'check'  — disadvantage on ability checks
 * Both carry a `canSee` predicate — disadvantage only while fear source is visible.
 *
 * Callers must set ctx.currentAction.id = fearSourceId and
 * ctx.visibility.selfCanSee appropriately when calling resolveRollMode/resolveStat.
 *
 * @param charId       - Entity ID of the frightened character.
 * @param fearSourceId - Entity ID of the fear source (the entity causing Frightened).
 *                       Must match ctx.currentAction.id at evaluation time.
 * @returns Array of ModifierInstance to register (2: attack + check disadvantage).
 */
export function buildFrightenedModifiers(
  charId: EntityId,
  fearSourceId: EntityId,
): ModifierInstance[] {
  // PHB 290: Frightened — disadvantage on attacks + checks while fear source visible.
  // fearSourceId is stored as a param but the actual canSee check uses ctx.currentAction.id.
  // The param is passed but not used in the template (scope is 'self', predicate is static).
  return compiled.build({ charId, fearSourceId });
}

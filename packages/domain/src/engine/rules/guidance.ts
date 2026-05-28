/**
 * buildGuidanceModifiers — Guidance cantrip.
 *
 * // PHB 248 (Cantrips — Guidance): "You touch one willing creature. Once before the
 * // spell ends, the target can roll a d4 and add the number rolled to one ability
 * // check of its choice. It can roll the die before or after making the ability check."
 * // Concentration, 1 minute.
 *
 * REQ-RULE-GUIDANCE-01: authored via the DSL pipeline (parseRule → compileRule).
 *
 * DESIGN (LOCKED per sdd/authoring-dsl/design): Cross-entity NumMod{value:'1d4'} scoped
 * to the target via axis:'entities'. The stat key is a parameter (the specific ability
 * check the target is making), mirroring PHB "one ability check of its choice".
 * Concentration token wires the duration/removal — mirrors Bless's pattern.
 *
 * The "once per cast / one check of its choice" usage-tracking:
 * // TODO: choice-runtime — track which check was chosen + usage state.
 *
 * Pure: no IO, no registry access. Returns plain ModifierInstance[].
 */
import { compileRule } from '../authoring/compile.js';
import type { EntityId, StatKey } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Inline RuleDoc (equivalent to reading guidance.yaml at use-case layer) ────
// We construct the RuleDoc directly rather than importing from rules-authored/
// to avoid TypeScript issues with the template slot in stat field. The rules-authored/
// file documents the shape; this builder resolves the template at call time.

import { guidanceRuleDoc } from '../rules-authored/guidance.js';

// ── Compile once (pure; no IO) ─────────────────────────────────────────────────

const compiled = compileRule(guidanceRuleDoc);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Guidance cantrip.
 *
 * The +1d4 is scoped to the target via axis:'entities' (cross-entity, mirroring Bless).
 * The concentration token wires all instances to this cast for cleanup via
 * registry.removeByConcentrationToken(token).
 *
 * NOTE: The default stat key is 'skill.athletics' as a representative ability check.
 * In production, the caller passes the specific stat key the target has chosen to apply
 * the Guidance to (deferred tracking: // TODO: choice-runtime).
 *
 * @param casterId  - Entity ID of the caster.
 * @param targetId  - Entity ID of the target receiving +1d4.
 * @param token     - Concentration token (stable; caller generates it, e.g. UUID).
 * @param statKey   - The specific stat key to apply +1d4 to (default: 'skill.athletics').
 *                    PHB 248: "one ability check of its choice".
 *                    // TODO: choice-runtime — track the choice + usage.
 * @returns Array of ModifierInstance to register (1: +1d4 to the chosen ability check).
 */
export function buildGuidanceModifiers(
  casterId: EntityId,
  targetId: EntityId,
  token: string,
  statKey: StatKey = 'skill.athletics' as StatKey,
): ModifierInstance[] {
  // PHB 248: Guidance — +1d4 to one ability check of target's choice, concentration 1 min.
  return compiled.build({ casterId, targetId, token, statKey });
}

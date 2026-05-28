/**
 * validateCharacterFinal — read-time / final-validation gate for character state.
 *
 * Design ref: sdd/authoring-dsl/design — Decision 3 (Resilient already-proficient dedup),
 *   CLAUDE.md §11 (cross-step skill dedup / validate-write / tolerate-read).
 *
 * This module implements the "duplicate proficiency" gate:
 *   - REQ-RULE-RESILIENT-01: when a character has two proficiency grants for the
 *     SAME (domain, ref) pair, validateCharacterFinal returns PROFICIENCY_ALREADY_GRANTED.
 *   - The modifier always emits; this gate runs at character-final-validation,
 *     NOT inside the modifier itself.
 *   - The read path (resolveStat) DOES NOT call this; it tolerates duplicates.
 *
 * Issue codes follow §6 naming convention (single-value mismatches: expected/got;
 * proficiency dedup: domain/ref rather than expected/got because it's a uniqueness
 * constraint, not a value mismatch).
 *
 * PURE: accepts an EntityId and a ModifierRegistry (read-only query), returns
 * { ok: true } | { ok: false, issues: [...] }. No IO.
 */
import type { EntityId } from '../types.js';
import type { ModifierRegistry } from '../registry/types.js';
import { isProficiencyMod } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Issue types ───────────────────────────────────────────────────────────────

export interface ProficiencyAlreadyGrantedIssue {
  code: 'PROFICIENCY_ALREADY_GRANTED';
  domain: string;
  ref: string;
}

export type CharacterFinalIssue = ProficiencyAlreadyGrantedIssue;

export type CharacterFinalResult =
  | { ok: true }
  | { ok: false; issues: CharacterFinalIssue[] };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate the final state of a character's modifier registry.
 *
 * Currently checks:
 *   - PROFICIENCY_ALREADY_GRANTED: duplicate (domain, ref) proficiency pairs.
 *     PHB: proficiency is granted once per domain/ref regardless of source count.
 *     Multiple sources for the same proficiency are flagged — the DM or UI should
 *     surface the redundancy. The modifier remains in the registry (read-tolerance).
 *
 * @param charId   - Entity ID of the character to validate.
 * @param registry - The modifier registry to query (read-only).
 * @returns CharacterFinalResult — ok:true if valid, ok:false with issues otherwise.
 */
export function validateCharacterFinal(
  charId: EntityId,
  registry: ModifierRegistry,
): CharacterFinalResult {
  // Build a minimal evaluation context for the query (trigger='always' gathers all mods).
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: [] },
    activeConditions: [],
  };

  // Gather all modifier instances for this entity.
  const allInstances = registry.query({
    trigger: 'always',
    self: charId,
    ctx,
  });

  // ── Dedup check: find duplicate (domain, ref) proficiency pairs ───────────
  // Two ProficiencyMod instances with the same (domain, ref) = redundant grant.
  // PHB: a creature either has proficiency or doesn't — stacking grants are meaningless.
  const seen = new Map<string, true>();
  const issues: CharacterFinalIssue[] = [];

  for (const inst of allInstances) {
    if (!isProficiencyMod(inst.def)) continue;
    const def = inst.def;
    const key = `${def.domain}:${def.ref}`;

    if (seen.has(key)) {
      // Already seen this (domain, ref) pair — this is a duplicate grant.
      issues.push({
        code: 'PROFICIENCY_ALREADY_GRANTED',
        domain: def.domain,
        ref: def.ref,
      });
    } else {
      seen.set(key, true);
    }
  }

  if (issues.length === 0) {
    return { ok: true };
  }

  return { ok: false, issues };
}

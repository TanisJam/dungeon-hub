/**
 * Predicate AST + WorldQuery types for the Resolution Engine.
 *
 * Predicates are pure data (plain JSON) — no methods, no closures.
 * Evaluation lives in evaluate.ts.
 *
 * Design ref: sdd/resolution-engine/design — Predicate AST section.
 */

// ── WorldQuery leaves ─────────────────────────────────────────────────────────

/**
 * Ctx/world query leaves evaluated against an EvaluationContext at resolve time.
 * See evaluatePredicate in evaluate.ts.
 */
export type WorldQuery =
  /** Prone melee-range gate: is attacker within N feet? (PHB 292) */
  | { kind: 'attackerWithin'; ft: number }
  /** Is weapon of the specified kind? (melee/ranged) */
  | { kind: 'weaponKind'; is: 'melee' | 'ranged' }
  /** Does the specified entity currently have a condition active? */
  | { kind: 'hasCondition'; entity: 'self' | 'attacker' | 'target'; condition: string }
  /** Can the resolving entity see the caster? (Counterspell range/visibility) */
  | { kind: 'canSee'; entity: 'self'; of: 'caster' }
  /** Is the in-flight spell at most N levels? */
  | { kind: 'spellLevelAtMost'; n: number };

// ── Predicate AST ─────────────────────────────────────────────────────────────

/**
 * Boolean predicate — composable AND/OR/NOT tree + WorldQuery leaves.
 * All nodes are plain objects (JSON-serializable).
 */
export type Predicate =
  | { op: 'and'; nodes: Predicate[] }
  | { op: 'or'; nodes: Predicate[] }
  | { op: 'not'; node: Predicate }
  | { op: 'query'; q: WorldQuery };

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Runtime type guard for Predicate.
 * Checks the `op` discriminant — sufficient for the closed union in this slice.
 */
export function isPredicate(value: unknown): value is Predicate {
  if (typeof value !== 'object' || value === null) return false;
  const op = (value as Record<string, unknown>)['op'];
  return op === 'and' || op === 'or' || op === 'not' || op === 'query';
}

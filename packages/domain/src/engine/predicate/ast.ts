/**
 * Predicate AST builder helpers.
 *
 * These factory functions create plain-object Predicate nodes. They produce
 * JSON-serializable values (no closures, no class instances).
 *
 * Design ref: sdd/resolution-engine/design — Predicate AST section.
 */
import type { Predicate, WorldQuery } from './types.js';

// ── Composite node builders ───────────────────────────────────────────────────

/** AND gate: all nodes must be true. */
export function and(...nodes: Predicate[]): Predicate {
  return { op: 'and', nodes };
}

/** OR gate: at least one node must be true. */
export function or(...nodes: Predicate[]): Predicate {
  return { op: 'or', nodes };
}

/** NOT gate: inverts the inner predicate. */
export function not(node: Predicate): Predicate {
  return { op: 'not', node };
}

/** Leaf: world query evaluated against EvaluationContext. */
export function query(q: WorldQuery): Predicate {
  return { op: 'query', q };
}

// ── WorldQuery leaf builders ──────────────────────────────────────────────────

/** Is the attacker within `ft` feet? (Prone melee-range gate, PHB 292) */
export function attackerWithin(ft: number): Predicate {
  return query({ kind: 'attackerWithin', ft });
}

/** Is the weapon of the given kind? */
export function weaponKind(is: 'melee' | 'ranged'): Predicate {
  return query({ kind: 'weaponKind', is });
}

/** Does the specified entity have the named condition? */
export function hasCondition(
  entity: 'self' | 'attacker' | 'target',
  condition: string,
): Predicate {
  return query({ kind: 'hasCondition', entity, condition });
}

/** Can the resolving entity see the caster? (Counterspell visibility check) */
export function canSee(of: 'caster'): Predicate {
  return query({ kind: 'canSee', entity: 'self', of });
}

/** Is the in-flight spell at most `n` levels? */
export function spellLevelAtMost(n: number): Predicate {
  return query({ kind: 'spellLevelAtMost', n });
}

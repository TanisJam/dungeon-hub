/**
 * Pure recursive predicate evaluator for the Resolution Engine.
 *
 * evaluatePredicate(p, ctx) → boolean
 *
 * Missing ctx fields required by a WorldQuery leaf throw a
 * PredicateMissingCtxFieldError (carries code 'PREDICATE_MISSING_CTX_FIELD'
 * following §6 expected/got naming convention).
 *
 * All evaluation is at call-time against the provided ctx (never cached).
 * REQ-PREDICATE-01.
 */
import type { Predicate, WorldQuery } from './types.js';
import type { EvaluationContext } from '../context.js';

// ── Error type ────────────────────────────────────────────────────────────────

export interface PredicateMissingCtxFieldError {
  code: 'PREDICATE_MISSING_CTX_FIELD';
  expected: string;
  got: undefined;
}

/**
 * Thrown (as a plain object) when a WorldQuery leaf requires a ctx field that
 * is absent. Follows the §6 expected/got naming convention.
 */
export class PredicateError extends Error {
  readonly code: 'PREDICATE_MISSING_CTX_FIELD';
  readonly expected: string;
  readonly got: undefined;

  constructor(expected: string) {
    super(`PREDICATE_MISSING_CTX_FIELD: ctx.${expected} is required but absent`);
    this.code = 'PREDICATE_MISSING_CTX_FIELD';
    this.expected = expected;
    this.got = undefined;
  }
}

// ── Main evaluator ────────────────────────────────────────────────────────────

/**
 * Recursively evaluates a Predicate against the given EvaluationContext.
 *
 * @throws {PredicateError} if a WorldQuery leaf references a ctx field that
 *   is absent (PREDICATE_MISSING_CTX_FIELD with the field path as `expected`).
 */
export function evaluatePredicate(p: Predicate, ctx: EvaluationContext): boolean {
  switch (p.op) {
    case 'and':
      // Short-circuit: stop at first false node.
      for (const node of p.nodes) {
        if (!evaluatePredicate(node, ctx)) return false;
      }
      return true;

    case 'or':
      // Short-circuit: stop at first true node.
      for (const node of p.nodes) {
        if (evaluatePredicate(node, ctx)) return true;
      }
      return false;

    case 'not':
      return !evaluatePredicate(p.node, ctx);

    case 'query':
      return evaluateWorldQuery(p.q, ctx);
  }
}

// ── WorldQuery leaf evaluator ─────────────────────────────────────────────────

function evaluateWorldQuery(q: WorldQuery, ctx: EvaluationContext): boolean {
  switch (q.kind) {
    case 'attackerWithin': {
      // Requires ctx.weaponInUse.rangeFt to be present.
      const rangeFt = ctx.weaponInUse?.rangeFt;
      if (rangeFt === undefined) {
        throw new PredicateError('weaponInUse.rangeFt');
      }
      return rangeFt <= q.ft;
    }

    case 'weaponKind': {
      // weaponInUse absent → no weapon → kind check fails (not an error).
      const kind = ctx.weaponInUse?.kind;
      if (kind === undefined) return false;
      return kind === q.is;
    }

    case 'hasCondition': {
      // Look up the relevant entity's condition list.
      const conditions = resolveEntityConditions(q.entity, ctx);
      return conditions.some((c) => c.name === q.condition);
    }

    case 'canSee': {
      // q.entity === 'self', q.of === 'caster'.
      // v1: resolve caster ID from currentAction (in-flight spell).
      // If no action in flight, treat as not-visible (predicate fails).
      const casterId = ctx.currentAction?.id;
      if (!casterId) return false;
      return ctx.visibility?.selfCanSee.includes(casterId as import('../types.js').EntityId) ?? true;
    }

    case 'spellLevelAtMost': {
      // Requires an in-flight spell action with a spell level.
      const level = ctx.currentAction?.spellLevel;
      if (level === undefined) return false;
      return level <= q.n;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveEntityConditions(
  entity: 'self' | 'attacker' | 'target',
  ctx: EvaluationContext,
): Array<{ name: string }> {
  switch (entity) {
    case 'self':
      // Use activeConditions on the context (covers self's conditions) plus
      // ctx.self.conditions for entity-level conditions.
      return [...ctx.activeConditions, ...(ctx.self.conditions ?? [])];
    case 'attacker':
      return ctx.attacker?.conditions ?? [];
    case 'target':
      return ctx.target?.conditions ?? [];
  }
}

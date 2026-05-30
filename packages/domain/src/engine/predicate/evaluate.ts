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

    case 'hasRollMode': {
      // resolvedRollMode absent pre-ON_HIT → false (not an error).
      // Returns false when ctx.resolvedRollMode absent — REQ-SA-WQ-01.1.
      // PHB p.173 — advantage/disadvantage roll mode.
      if (ctx.resolvedRollMode === undefined) return false;
      return ctx.resolvedRollMode === q.mode;
    }

    case 'runtimeDecision': {
      // Caller-asserted opt-in; absent runtimeDecisions or missing key → false.
      // Returns false when ctx.runtimeDecisions absent — REQ-SA-WQ-01.2.
      // PHB p.96 — Sneak Attack once-per-turn and spatial-ally (caller-asserted).
      return ctx.runtimeDecisions?.[q.key] === q.equals;
    }

    case 'hasWeaponProperty': {
      // weaponInUse absent → no weapon → property check fails (not an error).
      // Returns false when ctx.weaponInUse absent — REQ-SA-WQ-01.3.
      // PHB p.147 — finesse; PHB p.96 — Sneak Attack weapon gate.
      const props = ctx.weaponInUse?.properties;
      if (props === undefined) return false;
      return props.includes(q.property);
    }

    case 'hasEffectFromSelf': {
      // Returns false (NOT throws) when effects or attackerCombatantId absent — non-attack context.
      // REQ-CEF-02: read-tolerant; REQ-CEF-03: compare combatant UUID, NOT character EntityId.
      //
      // ⚠️ IDENTITY-SPACE: ctx.attackerCombatantId is the COMBATANT UUID (encounter_combatants.id).
      // ctx.attacker.id is the CHARACTER EntityId (charId) — a different namespace entirely.
      // effect.sourceCombatantId is stored as a combatant UUID → compare against attackerCombatantId.
      //
      // PHB p.251 — Hex caster-sourced, concentration; PHB p.203 — concentration rules.
      const effects = ctx.targetCombatantEffects;
      const attackerCombatantId = ctx.attackerCombatantId;
      if (!effects || attackerCombatantId === undefined) return false;
      return effects.some(
        (e) => e.effectName === q.effectName && e.sourceCombatantId === attackerCombatantId,
      );
    }

    default: {
      // Exhaustiveness guard — future WorldQuery leaves added without a case
      // will cause a compile-time error here. REQ-SA-WQ-01.4.
      const _exhaustive: never = q;
      return _exhaustive;
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

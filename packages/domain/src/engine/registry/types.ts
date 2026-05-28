/**
 * ModifierRegistry interface, ModifierInstance, and TargetScope types.
 *
 * The registry is the central store for live modifier instances. It supports
 * a bidirectional actor/target axis:
 *   - axis='self': modifier affects only its owner.
 *   - axis='entities': modifier lives in owner but applies to listed entities
 *     (e.g. Bless — owned by caster, scoped to allies).
 *   - axis='attackers-of': modifier on entity B affects rolls made BY attackers
 *     against B (e.g. Prone — owned by prone target, affects incoming attacks).
 *
 * All types are plain JSON — serializable for round-trip persistence.
 *
 * Design ref: sdd/resolution-engine/design — ModifierRegistry section.
 */
import type { EntityId, Modifier, StatKey, Trigger, RollType } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { Predicate } from '../predicate/types.js';
import type { DurationSpec } from '../types.js';

// ── TargetScope ───────────────────────────────────────────────────────────────

/**
 * Defines which entities a modifier applies to.
 *
 * - `self`: only the owning entity is affected.
 * - `entities`: cross-entity (e.g. Bless chosen allies).
 * - `attackers-of`: outgoing-aware (e.g. Prone — applies to attackers).
 */
export type TargetScope =
  | { axis: 'self' }
  | { axis: 'entities'; ids: EntityId[] }
  | { axis: 'attackers-of'; ids: EntityId[] };

// ── ModifierInstance ──────────────────────────────────────────────────────────

/**
 * A live, emitted modifier instance bound to a specific (owner, scope, trigger).
 *
 * `def`: the modifier payload (kind-specific data).
 * `scope`: who owns it and who it targets.
 * `predicate`: optional contextual condition — evaluated at resolution time.
 * `duration`: optional lifetime spec with end conditions.
 */
export interface ModifierInstance {
  id: ModifierInstanceId;
  def: Modifier;
  scope: {
    owner: EntityId;
    target: TargetScope;
    trigger: Trigger;
  };
  predicate?: Predicate;
  duration?: DurationSpec;
  /**
   * Human-readable label for provenance breakdown (e.g. "Bless (caster: Aria)").
   * When present, applyStacking and resolveRollMode use this as Source.label
   * instead of the raw instance ID.
   * This keeps the ID unique in the registry while the label stays readable.
   */
  label?: string;
}

/** Branded string ID for a live modifier instance. */
export type ModifierInstanceId = string & { readonly _brand: 'ModifierInstanceId' };

// ── Registry query input ──────────────────────────────────────────────────────

export interface RegistryQueryInput {
  /** Stat being resolved (optional — absent = gather all triggers). */
  stat?: StatKey;
  /** Roll type (optional — for advantage/disadvantage gather). */
  rollType?: RollType;
  /** Event trigger to match against. */
  trigger: Trigger;
  /** The entity whose resolution is being computed. */
  self: EntityId;
  /** Full evaluation context (used for predicate evaluation). */
  ctx: EvaluationContext;
}

// ── ModifierRegistry interface ────────────────────────────────────────────────

/**
 * Central store + query interface for modifier instances.
 *
 * The engine calls `query(...)` at the start of every resolution to gather
 * all applicable instances across the bidirectional actor/target axis.
 *
 * Implementations (in-memory, DB-backed, etc.) live outside domain per §3
 * (use-case layer). The domain only consumes this interface.
 */
export interface ModifierRegistry {
  /**
   * Gather all modifier instances applicable to the given (stat, trigger, self, ctx).
   *
   * Bidirectional gather:
   *   (a) instances scoped `self` or `entities` whose ids include `self` → included
   *   (b) instances scoped `attackers-of` whose ids include `ctx.attacker.id` → included
   *       (these live on the target and affect the attacker's rolls)
   *
   * Predicate filtering is applied by the caller (evaluatePredicate).
   */
  query(input: RegistryQueryInput): ModifierInstance[];

  /** Register a new instance. Returns the instance ID for later removal. */
  register(instance: ModifierInstance): ModifierInstanceId;

  /** Remove a specific instance by ID. No-op if not found. */
  remove(id: ModifierInstanceId): void;

  /** Remove all instances sharing a concentration token. */
  removeByConcentrationToken(token: string): void;
}

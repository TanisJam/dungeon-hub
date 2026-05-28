/**
 * EvaluationContext and related input types for the Resolution Engine.
 *
 * The context is built per-resolution at the use-case layer (loads character +
 * active modifier instances + encounter state), passed pure into the engine.
 * Lifecycle: ephemeral — one per resolveStat / pipeline-phase call; never persisted.
 *
 * exactOptionalPropertyTypes is active: all optional fields are TRULY ABSENT
 * (not assigned `undefined`). Never assign `foo: undefined` to these fields;
 * use a conditional spread or omit the key entirely.
 *
 * Design ref: sdd/resolution-engine/design — EvaluationContext shape.
 */
import type { EntityId, EntityRef, ConditionRef, StatKey } from './types.js';

export type { ConditionRef };

// ── ActionInFlight ────────────────────────────────────────────────────────────

/**
 * An action currently progressing through the pipeline state machine.
 * Carried on EvaluationContext.currentAction during pipeline phases.
 */
export interface ActionInFlight {
  id: string;
  /** Attack or spell pipeline. */
  type: 'attack' | 'spell';
  /** Current phase name — managed by the state machine. */
  phase: string;
  /** Present for spell actions; absent for attacks. */
  spellLevel?: number;
}

// ── EvaluationContext ─────────────────────────────────────────────────────────

/**
 * Full context available during stat/roll resolution.
 *
 * Optional fields use exactOptionalPropertyTypes — they must be either present
 * with a defined value OR absent entirely. Never include them as `undefined`.
 */
export interface EvaluationContext {
  /** Entity whose stat is being resolved (the "self" in the modifier axis). */
  self: EntityRef;

  /** Named conditions active on relevant entities (Prone, Bless, …). */
  activeConditions: ConditionRef[];

  /** Present during pipeline phases (attack/spell in-flight). */
  currentAction?: ActionInFlight;

  /** Actor axis — populated for "attack AGAINST self" resolutions. */
  attacker?: EntityRef;

  /** Target axis — populated when resolving from the attacker's perspective. */
  target?: EntityRef;

  /** Weapon the acting entity is currently using, if relevant. */
  weaponInUse?: WeaponInUse;

  /**
   * Visibility information (Counterspell "see a creature" predicate).
   * v1 assumption: creature is visible unless listed absent.
   */
  visibility?: { selfCanSee: EntityId[] };

  /**
   * Ephemeral per-action opt-ins (Sharpshooter, Great Weapon Master, etc.).
   * Keyed by decision name; typed as unknown — callers narrow per use-case.
   */
  runtimeDecisions?: Record<string, unknown>;
}

// ── WeaponInUse ───────────────────────────────────────────────────────────────

export interface WeaponInUse {
  kind: 'melee' | 'ranged';
  /** Effective range in feet; for melee this is reach (typically 5 or 10 ft). */
  rangeFt?: number;
  /** PHB property strings: 'finesse', 'heavy', 'thrown', etc. */
  properties: string[];
}

// ── Helper: distance to attacker ─────────────────────────────────────────────

/**
 * Resolves the distance from ctx.attacker to the resolving entity.
 * Returns undefined if no attacker or no weapon range context is available.
 *
 * Note: v1 derives distance from weaponInUse.rangeFt (the attacker's weapon
 * reach). Full positional tracking is a later enhancement.
 */
export function attackerDistanceFt(ctx: EvaluationContext): number | undefined {
  return ctx.weaponInUse?.rangeFt;
}

// Re-export EntityRef and EntityId so consumers only need to import from context.
export type { EntityId, EntityRef, StatKey };

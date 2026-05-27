/**
 * ClassResource — per-class limited-use resource tracking.
 *
 * Closes the structural blocker of audit R-07 (engram #812): the sheet now
 * exposes Ki Points, Second Wind, etc. with `used / max` counters and a
 * recovery trigger consumed by `/rest/{short,long}`.
 *
 * Origin: SDD `rules-audit-class-features` (engram #815).
 * Foundation extended in SDD `class-resource-bardic-inspiration` (engram #931)
 * with uniform `ResourceCtx` callbacks for ability-mod max, level-gated
 * recovery transitions, and dynamic `extra` emission.
 */
import type { AbilityKey } from '../stats/types.js';

/** When a resource's `used` counter resets. */
export type RecoveryTrigger = 'short' | 'long' | 'both';

/**
 * Context passed to every ClassResourceDef callback.
 *
 * Carries the matching class's level on the character + their effective
 * ability modifiers (post-ASI/feat/race). Defs that don't need ability
 * mods simply ignore them (Fighter Second Wind, Monk Ki Points).
 */
export interface ResourceCtx {
  classLevel: number;
  abilityMods: Readonly<Record<AbilityKey, number>>;
}

/**
 * Sheet view of a single class resource.
 *
 * Storage is `Record<slug, number>` (slug → used) on `character.data`; the
 * `max` + `recoveryTrigger` are derived by domain from the class registry.
 */
export interface ClassResource {
  /** Class-prefixed slug, e.g. 'fighter:second-wind', 'monk:ki-points'. */
  slug: string;
  /** Class slug that owns the resource, e.g. 'fighter'. */
  classSlug: string;
  /** Uses currently consumed (clamped to [0, max] at derive time). */
  used: number;
  /** Maximum uses at the character's current class level (+ ability mods). */
  max: number;
  recoveryTrigger: RecoveryTrigger;
  /**
   * Optional feature-specific metadata. Emitted by `def.extraFor(ctx)` when
   * the def declares one and it returns non-undefined.
   *   - Bardic Inspiration: `{ dieSize: 'd6' | 'd8' | 'd10' | 'd12' }`
   *   - Future: Lay on Hands pool shape, etc.
   */
  extra?: unknown;
}

/**
 * Definition of a class resource — the PHB-RAW rules that produce
 * `max` + `recoveryTrigger` (and optional `extra`) from a resource ctx.
 *
 * Registry entries live in `./registry.ts`. Future SDDs may promote this to
 * the compendium (per-row flags on classes/subclasses) — see proposal #813
 * § Out of Scope. Until then, the registry is the source of truth.
 */
export interface ClassResourceDef {
  slug: string;
  classSlug: string;
  /**
   * Optional subclass gate. When set, the resource is only emitted/reset
   * when the character's class instance has a matching subclass slug.
   * Example: Druid Natural Recovery requires Circle of the Land (PHB p.68).
   */
  subclassSlug?: string;
  /**
   * Returns max uses at the given context, or `null` if the resource is
   * not yet unlocked at that level (e.g. Ki unlocks at Monk L2).
   */
  maxFor(ctx: ResourceCtx): number | null;
  /**
   * Returns the recovery trigger at the given context. Allows level-gated
   * transitions like Bardic Inspiration (long L1-4 → short L5+ per Font of
   * Inspiration, PHB p.54).
   */
  recoveryTriggerFor(ctx: ResourceCtx): RecoveryTrigger;
  /**
   * Optional: emit a feature-specific extra payload. Returns `undefined`
   * to omit the `extra` field from the derived `ClassResource`.
   */
  extraFor?(ctx: ResourceCtx): unknown | undefined;
}

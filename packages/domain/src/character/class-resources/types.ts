/**
 * ClassResource — per-class limited-use resource tracking.
 *
 * Closes the structural blocker of audit R-07 (engram #812): the sheet now
 * exposes Ki Points, Second Wind, etc. with `used / max` counters and a
 * recovery trigger consumed by `/rest/{short,long}`.
 *
 * Origin: SDD `rules-audit-class-features` (engram #815).
 */

/** When a resource's `used` counter resets. */
export type RecoveryTrigger = 'short' | 'long' | 'both';

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
  /** Maximum uses at the character's current class level. */
  max: number;
  recoveryTrigger: RecoveryTrigger;
  /**
   * Optional feature-specific metadata. Forward-compat slot for:
   *   - Bardic Inspiration die size (`{ dieSize: 'd6' | 'd8' | ... }`)
   *   - Lay on Hands HP pool (`{ shape: 'pool', poolMax: number }`)
   * Empty for the canonical Second Wind + Ki implementations.
   */
  extra?: unknown;
}

/**
 * Definition of a class resource — the PHB-RAW rules that produce
 * `max` + `recoveryTrigger` from a class level.
 *
 * Registry entries live in `./registry.ts`. Future SDDs may promote this to
 * the compendium (per-row flags on classes/subclasses) — see proposal #813
 * § Out of Scope. Until then, the registry is the source of truth.
 */
export interface ClassResourceDef {
  slug: string;
  classSlug: string;
  recoveryTrigger: RecoveryTrigger;
  /**
   * Returns max uses at the given class level, or `null` if the resource is
   * not yet unlocked at that level (e.g. Ki unlocks at Monk L2).
   */
  maxFor(classLevel: number): number | null;
}

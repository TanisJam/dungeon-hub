/**
 * Pure helpers to mutate the persisted `classResourcesUsed` map in response
 * to rest events (`/rest/short`, `/rest/long`) or play-time resource events
 * (`/resources/use`, `/resources/restore`).
 *
 * Domain stays pure: returns a NEW map; the caller persists.
 *
 * Origin: SDD `rules-audit-class-features` (engram #815).
 * Foundation extended in SDD `class-resource-bardic-inspiration` (#931):
 * resolves recovery trigger per-class-level via `def.recoveryTriggerFor(ctx)`.
 */
import type { AppliedClass } from '../class/types.js';
import type { AbilityKey } from '../stats/types.js';
import { CLASS_RESOURCES } from './registry.js';

/**
 * Resets the `used` counter to 0 for every class-resource whose recovery
 * trigger (at the character's current class level + ability mods) matches
 * the given rest event AND whose owning class the character has at non-zero
 * level.
 *
 * Rest semantics (PHB p.186):
 *   - 'short' rest: clears resources with trigger ∈ { 'short', 'both' }.
 *   - 'long'  rest: clears ALL resources (per PHB, every short-rest feature
 *                   also recovers on long rest; long-rest features clearly
 *                   recover too). Pass `'long'` and we ignore triggers.
 *
 * Resources NOT in the character's class set are passed through unchanged
 * (legacy data tolerance — matches `deriveClassResources`).
 */
export function resetClassResourcesForRest(
  used: Readonly<Record<string, number>>,
  classes: readonly AppliedClass[],
  rest: 'short' | 'long',
  abilityMods: Readonly<Record<AbilityKey, number>>,
): Record<string, number> {
  const ownedByClass = new Map(classes.map((c) => [c.slug, c.level]));
  const next: Record<string, number> = { ...used };

  for (const def of CLASS_RESOURCES) {
    const classLevel = ownedByClass.get(def.classSlug);
    if (classLevel === undefined) continue;
    const trigger = def.recoveryTriggerFor({ classLevel, abilityMods });
    if (rest === 'long' || trigger === 'short' || trigger === 'both') {
      next[def.slug] = 0;
    }
  }

  return next;
}

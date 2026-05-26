/**
 * Pure helpers to mutate the persisted `classResourcesUsed` map in response
 * to rest events (`/rest/short`, `/rest/long`) or play-time resource events
 * (`/resources/use`, `/resources/restore`).
 *
 * Domain stays pure: returns a NEW map; the caller persists.
 *
 * Origin: SDD `rules-audit-class-features` (engram #815).
 */
import type { AppliedClass } from '../class/types.js';
import { CLASS_RESOURCES } from './registry.js';
import type { RecoveryTrigger } from './types.js';

/**
 * Resets the `used` counter to 0 for every class-resource whose recovery
 * trigger matches the given rest event AND whose owning class the character
 * has at non-zero level.
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
): Record<string, number> {
  const ownedClassSlugs = new Set(classes.map((c) => c.slug));
  const next: Record<string, number> = { ...used };

  for (const def of CLASS_RESOURCES) {
    if (!ownedClassSlugs.has(def.classSlug)) continue;
    if (rest === 'long' || matchesShort(def.recoveryTrigger)) {
      next[def.slug] = 0;
    }
  }

  return next;
}

function matchesShort(trigger: RecoveryTrigger): boolean {
  return trigger === 'short' || trigger === 'both';
}

/**
 * Derives the `ClassResource` sheet view from a character's classes + stored
 * `used` counters.
 *
 * For each class in the character's `classes[]`, we look up every
 * `ClassResourceDef` whose `classSlug` matches and whose `maxFor(level)`
 * returns non-null. The persisted `used` counter is clamped to `[0, max]` —
 * read-path tolerance for legacy data where a level-down might leave a
 * stored value above the current max.
 *
 * Storage format on `character.data.classResourcesUsed: Record<slug, number>`.
 *
 * Origin: SDD `rules-audit-class-features` (engram #815).
 */
import type { AppliedClass } from '../class/types.js';
import { CLASS_RESOURCES } from './registry.js';
import type { ClassResource } from './types.js';

export function deriveClassResources(
  classes: readonly AppliedClass[],
  used: Readonly<Record<string, number>>,
): Record<string, ClassResource> {
  const out: Record<string, ClassResource> = {};

  for (const klass of classes) {
    for (const def of CLASS_RESOURCES) {
      if (def.classSlug !== klass.slug) continue;
      const max = def.maxFor(klass.level);
      if (max == null) continue;

      const stored = used[def.slug] ?? 0;
      const clamped = Math.max(0, Math.min(stored, max));

      out[def.slug] = {
        slug: def.slug,
        classSlug: def.classSlug,
        used: clamped,
        max,
        recoveryTrigger: def.recoveryTrigger,
      };
    }
  }

  return out;
}

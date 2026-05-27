/**
 * Derives the `ClassResource` sheet view from a character's classes + stored
 * `used` counters + effective ability modifiers.
 *
 * For each class in the character's `classes[]`, we look up every
 * `ClassResourceDef` whose `classSlug` matches and whose `maxFor(ctx)`
 * returns non-null. The persisted `used` counter is clamped to `[0, max]` —
 * read-path tolerance for legacy data where a level-down might leave a
 * stored value above the current max.
 *
 * Storage format on `character.data.classResourcesUsed: Record<slug, number>`.
 *
 * Origin: SDD `rules-audit-class-features` (engram #815).
 * Foundation extended in SDD `class-resource-bardic-inspiration` (#931):
 * accepts ability mods and emits dynamic `extra` payload when def declares it.
 */
import type { AppliedClass } from '../class/types.js';
import type { AbilityKey } from '../stats/types.js';
import { CLASS_RESOURCES } from './registry.js';
import type { ClassResource } from './types.js';

export function deriveClassResources(
  classes: readonly AppliedClass[],
  used: Readonly<Record<string, number>>,
  abilityMods: Readonly<Record<AbilityKey, number>>,
): Record<string, ClassResource> {
  const out: Record<string, ClassResource> = {};

  for (const klass of classes) {
    for (const def of CLASS_RESOURCES) {
      if (def.classSlug !== klass.slug) continue;
      const ctx = { classLevel: klass.level, abilityMods };
      const max = def.maxFor(ctx);
      if (max == null) continue;

      const stored = used[def.slug] ?? 0;
      const clamped = Math.max(0, Math.min(stored, max));
      const recoveryTrigger = def.recoveryTriggerFor(ctx);
      const extra = def.extraFor?.(ctx);

      const resource: ClassResource = {
        slug: def.slug,
        classSlug: def.classSlug,
        used: clamped,
        max,
        recoveryTrigger,
      };
      if (extra !== undefined) resource.extra = extra;
      out[def.slug] = resource;
    }
  }

  return out;
}

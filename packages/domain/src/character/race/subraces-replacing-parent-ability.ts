/**
 * Subraces whose Ability Score Increase REPLACES the parent race's, per RAW.
 * Keyed by `slug|SOURCE` to match the entityKey() convention.
 *
 * Source of truth: PHB 2014 p.31 sidebar (Variant Human):
 *   "all of which replace the human's Ability Score Increase trait"
 *
 * Without this flag, picking Variant Human would stack +1×2 (subrace) on top of
 * +1-to-all (parent), totalling +3 across 4 stats and +1 across 2 — not RAW.
 *
 * Tech debt: hardcoded reference data accepted per CLAUDE.md §1.2 until DI #513
 * migrates these lookups to a runtime registry.
 */
export const SUBRACES_REPLACING_PARENT_ABILITY: ReadonlySet<string> = new Set([
  // Variant Human — PHB p.31 sidebar.
  // Importer produces compound slugs: `${slugify(raceName)}--${slugify(subraceName)}`
  // → for "Variant" subrace under "Human" race → 'human--variant'.
  'human--variant|PHB',
]);

/**
 * True when the given subrace's ASI fully REPLACES the parent race's ASI per RAW.
 * Callers must drop the parent race's `ability` slots when this returns true.
 */
export function subraceReplacesParentAbility(subrace: { slug: string; source: string }): boolean {
  return SUBRACES_REPLACING_PARENT_ABILITY.has(`${subrace.slug}|${subrace.source}`);
}

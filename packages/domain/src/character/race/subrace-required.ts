/**
 * Races from PHB 2014 that REQUIRE a subrace selection.
 * Keyed by `slug|SOURCE` to match the entityKey() convention used in validate.ts
 * for disabledEntities lookups.
 *
 * Source of truth: PHB 2014 (Dwarf p.18, Elf p.21, Halfling p.26, Gnome p.35).
 *
 * Tech debt: when reference data migrates to DB+DI (see #513), this set moves
 * alongside STANDARD_LANGUAGES / EXOTIC_LANGUAGES in
 * packages/domain/src/character/language/pools.ts.
 */
export const RACES_REQUIRING_SUBRACE: ReadonlySet<string> = new Set([
  'dwarf|PHB',
  'elf|PHB',
  'gnome|PHB',
  'halfling|PHB',
]);

/**
 * True if the given race REQUIRES a subrace to be selected for the character
 * to be considered mechanically complete per PHB 2014.
 *
 * Custom Lineage (TCE) is a separate entry — its slug is `custom-lineage` and
 * is NOT in this set, even though it is a base-race-shaped entry.
 */
export function requiresSubrace(race: { slug: string; source: string }): boolean {
  return RACES_REQUIRING_SUBRACE.has(`${race.slug}|${race.source}`);
}

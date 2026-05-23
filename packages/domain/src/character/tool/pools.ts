/**
 * PHB Chapter 5 — Tools
 * Source of truth: data/5etools/data/book/book-phb.json
 * Slugs are lowercase, hyphenated (matching the app's convention).
 */

export const ARTISANS_TOOLS: readonly string[] = [
  'alchemists-supplies',
  'brewers-supplies',
  'calligraphers-supplies',
  'carpenters-tools',
  'cartographers-tools',
  'cobblers-tools',
  'cooks-utensils',
  'glassblowers-tools',
  'jewelers-tools',
  'leatherworkers-tools',
  'masons-tools',
  'painters-supplies',
  'potters-tools',
  'smiths-tools',
  'tinkers-tools',
  'weavers-tools',
  'woodcarvers-tools',
];

export const GAMING_SETS: readonly string[] = [
  'dice-set',
  'dragonchess-set',
  'playing-card-set',
  'three-dragon-ante-set',
];

export const MUSICAL_INSTRUMENTS: readonly string[] = [
  'bagpipes',
  'drum',
  'dulcimer',
  'flute',
  'horn',
  'lute',
  'lyre',
  'pan-flute',
  'shawm',
  'viol',
];

/**
 * Maps both camelCase (5etools block-key style) and spaced (5etools choose.from style)
 * category labels to their pool arrays.
 *
 * Verified against backgrounds.json — actual `choose.from` entries use:
 *   - "anyArtisansTool" (camelCase)
 *   - "musical instrument" (spaced)
 *   - "gaming set" (spaced)
 *
 * camelCase variants for musical/gaming are included for symmetry and forward-compat.
 */
export const TOOL_CATEGORY_MAP: Readonly<Record<string, readonly string[]>> = {
  anyArtisansTool: ARTISANS_TOOLS,
  "artisan's tools": ARTISANS_TOOLS,
  anyMusicalInstrument: MUSICAL_INSTRUMENTS,
  'musical instrument': MUSICAL_INSTRUMENTS,
  anyGamingSet: GAMING_SETS,
  'gaming set': GAMING_SETS,
};

/**
 * Expands an array of tool `from` entries (as they appear in 5etools backgrounds.json)
 * into a flat array of concrete tool slugs.
 *
 * - Category labels (both camelCase and spaced forms) → replaced by their pool
 * - Literal slugs not in the map → passed through as-is
 * - Order is preserved; no deduplication (caller is responsible if needed)
 */
export function expandToolFrom(from: readonly string[]): string[] {
  return from.flatMap((entry) => {
    const pool = TOOL_CATEGORY_MAP[entry];
    return pool ? [...pool] : [entry];
  });
}

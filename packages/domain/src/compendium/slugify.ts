/**
 * Shared slug utilities for domain compendium refs.
 *
 * Used by:
 * - character/class/features.ts  (class feature slugs)
 * - character/starting-equipment/  (item grant resolution, REQ-SEQUIP-00, ADR-2)
 *
 * CRITICAL INVARIANT (ADR-2): this formula MUST be byte-identical to the one used
 * in `packages/compendium-import/src/normalize.ts` that produced the slugs stored
 * in `compendium_items.slug`.  Any drift in normalisation means grant resolution
 * silently looks up the wrong (or missing) item row.
 *
 * The "arrows (20)" gotcha:
 *   5etools encodes "arrows (20)" as the item name.  The importer produces slug
 *   "arrows-20".  When we parse `defaultData`, the same formula must produce the
 *   same slug — parentheses become hyphens, trailing hyphens are stripped, result
 *   is "arrows-20".  Verified against compendium_items.slug = 'arrows-20' (PHB).
 */

/**
 * Converts a compendium item name to a URL-safe kebab-case slug.
 *
 * Formula (mirrors compendium-import normalize.ts — keep in sync):
 *   1. Lowercase
 *   2. NFD normalise + strip combining accent marks
 *   3. Remove curly/straight apostrophes
 *   4. Replace any run of non-alphanumeric chars with a single hyphen
 *   5. Trim leading/trailing hyphens
 *
 * Examples:
 *   "chain mail"     → "chain-mail"
 *   "arrows (20)"    → "arrows-20"      (the quantity-in-name gotcha)
 *   "dungeoneer's pack" → "dungeoneers-pack"
 *   "épée"           → "epee"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accent marks
    .replace(/['']/g, '')             // remove apostrophes (curly + straight)
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumeric runs → single hyphen
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

/** Parsed result from a 5etools item ref string. */
export interface ParsedItemRef {
  /** Slugified item name, e.g. "chain-mail", "arrows-20". */
  slug: string;
  /**
   * Source key in uppercase, e.g. "PHB".
   * Empty string when no source segment is present in the ref.
   */
  source: string;
}

/**
 * Parses a 5etools item ref string of the form `"name|SOURCE"` or plain `"name"`.
 *
 * - The name segment is slugified with `slugify()`.
 * - The source segment (if present) is uppercased; absent → empty string.
 *
 * Examples:
 *   "chain mail|phb"      → { slug: "chain-mail", source: "PHB" }
 *   "arrows (20)|PHB"     → { slug: "arrows-20",  source: "PHB" }
 *   "spellbook"           → { slug: "spellbook",  source: "" }
 *
 * The `displayName` field that some 5etools item objects carry is NOT passed to
 * this function — callers must always use the `item` ref string for the slug and
 * keep `displayName` for rendering only (ADR-7).
 */
export function parseItemRef(refString: string): ParsedItemRef {
  const pipeIdx = refString.indexOf('|');
  if (pipeIdx === -1) {
    return { slug: slugify(refString), source: '' };
  }
  const namePart = refString.slice(0, pipeIdx);
  const sourcePart = refString.slice(pipeIdx + 1).toUpperCase();
  return { slug: slugify(namePart), source: sourcePart };
}

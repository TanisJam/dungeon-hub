/**
 * Slug helper for character export filenames.
 * Lowercase → NFD accent-strip → non-alphanumeric → hyphen → trim leading/trailing hyphens.
 * Returns '' for blank/all-symbol input so the caller can fall back to `character-<id>`.
 * REQ-EXP-SLUG-01/02/03.
 */
export function slugifyForFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // non-ASCII and symbols → single hyphen (REQ-EXP-SLUG-01/02)
    .replace(/^-+|-+$/g, '');     // trim leading/trailing hyphens (REQ-EXP-SLUG-01)
}

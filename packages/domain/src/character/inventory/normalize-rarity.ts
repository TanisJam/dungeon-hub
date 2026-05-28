/**
 * Rarity normalization for 5etools rarity strings.
 *
 * Reqs: DIRN-DMG-01 (spec #1063)
 * DMG p.135 — Rarity table: common, uncommon, rare, very rare, legendary, artifact.
 *
 * 5etools ships "very rare" with a space; we normalize to hyphenated slug
 * for use as CSS class names (`.rarity-very-rare`).
 */

/** Canonical rarity tiers per DMG p.135. */
export type RarityClass = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact';

const VALID_RARITIES: ReadonlySet<string> = new Set<RarityClass>([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
]);

/**
 * Normalizes a raw 5etools rarity string to a canonical `RarityClass` slug,
 * or `null` for missing/unrecognized values.
 *
 * Normalization steps:
 * 1. Lowercase + trim
 * 2. Replace one or more internal whitespace characters with `-`
 * 3. Exact match against the closed `RarityClass` set
 * 4. Unrecognized values (including `"none"`, `"varies"`, empty) → `null`
 *
 * DMG p.135 — "Very Rare" ships as `"very rare"` in 5etools; we normalize to `"very-rare"`.
 */
export function normalizeRarity(raw: string | null | undefined): RarityClass | null {
  if (raw == null || raw.length === 0) return null;

  const normalized = raw.toLowerCase().trim().replace(/\s+/g, '-');

  if (VALID_RARITIES.has(normalized)) return normalized as RarityClass;

  return null;
}

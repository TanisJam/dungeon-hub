/**
 * Spanish class label map for D&D 5e classes.
 * REQ-SP07-SPANISH-CLASS-LABELS: multiclass tab bar shows Spanish labels.
 *
 * Extracted from page.tsx to a pure module so it can be unit-tested
 * without the server environment (supabase, env vars, etc.).
 *
 * Inline in page.tsx was the original design (SP07-D1: single consumer).
 * Extracted here to satisfy testability; page.tsx re-exports classLabel.
 */

export const CLASS_LABEL_ES: Record<string, string> = {
  bard: 'Bardo',
  cleric: 'Clérigo',
  druid: 'Druida',
  paladin: 'Paladín',
  ranger: 'Explorador',
  sorcerer: 'Hechicero',
  warlock: 'Brujo',
  wizard: 'Mago',
  artificer: 'Artífice',
  fighter: 'Guerrero',
  rogue: 'Pícaro',
  barbarian: 'Bárbaro',
  monk: 'Monje',
};

/**
 * Returns the Spanish display name for a D&D 5e class slug.
 * Falls back to capitalized slug for unknown/homebrew classes (SP07-D7: read-path tolerance).
 */
export function classLabel(slug: string): string {
  return CLASS_LABEL_ES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Spell school decoder — maps 5etools single-char codes to full PHB school names.
 *
 * REQ-SP02-WEB-SCHOOL-DECODE (spec #680):
 * School codes STAY as single chars in DB (design D-01).
 * Decode at web layer only — never decode in API or domain.
 *
 * PHB Chapter 10: Eight schools of magic:
 * Abjuration, Conjuration, Divination, Enchantment, Evocation,
 * Illusion, Necromancy, Transmutation.
 *
 * CRITICAL: E → Enchantment, V → Evocation.
 * These are single-char codes from 5etools for all imported PHB sources.
 * Do NOT use En/Ev (that was a bug in proposal D-05, corrected by spec #680).
 *
 * Robustness: decodeSchool returns raw code as fallback for unknown codes.
 * Future i18n can swap SCHOOL_NAMES with a locale-specific map.
 */

export const SCHOOL_NAMES: Record<string, string> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
  V: 'Evocation',
} as const;

/**
 * Decode a single-char school code to the full PHB school name.
 * Returns the raw code as fallback for unknown codes (+ console.warn in dev).
 */
export function decodeSchool(code: string): string {
  return SCHOOL_NAMES[code] ?? code;
}

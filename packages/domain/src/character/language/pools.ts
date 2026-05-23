/**
 * PHB Chapter 1 — Languages
 * Standard and exotic language pools, mirroring the PHB language table.
 * Source of truth: PHB p. 123.
 *
 * anyLanguage: full union of standard + exotic (PHB Custom Background rule).
 * anyStandard: standard only (most common language-proficiency blocks).
 * anyExotic:   exotic only (rare, e.g. Aberrant Mind sorcerer).
 * any:         synonym for anyLanguage in legacy blocks.
 */

export const STANDARD_LANGUAGES: readonly string[] = [
  'common',
  'dwarvish',
  'elvish',
  'giant',
  'gnomish',
  'goblin',
  'halfling',
  'orc',
];

export const EXOTIC_LANGUAGES: readonly string[] = [
  'abyssal',
  'celestial',
  'deep-speech',
  'draconic',
  'infernal',
  'primordial',
  'sylvan',
  'undercommon',
];

/**
 * Full union of standard and exotic languages.
 * This is the pool resolved by the `anyLanguage` key in
 * `skillToolLanguageProficiencies` (Custom Background, PHB p. 125).
 */
export const ALL_LANGUAGES_INCLUDING_EXOTIC: readonly string[] = [
  ...STANDARD_LANGUAGES,
  ...EXOTIC_LANGUAGES,
];

/**
 * All valid `choose` key names for language blocks.
 * Includes `anyLanguage` for the Custom Background mixed-pool shape.
 */
export const LANG_CHOOSE_KEYS: readonly string[] = [
  'anyStandard',
  'anyExotic',
  'any',
  'anyLanguage',
];

/**
 * phbDefaultPools() — PHB-only WorldRefData fixture.
 *
 * Returns the resolved reference data for a world whose `rulesProfile.sources`
 * has only PHB enabled. Used as:
 *   - the API loader's default (when no world-specific data overrides apply)
 *   - the test fixture in `packages/domain` unit tests
 *
 * Data anchors:
 *   - languages — PHB p.123 (Standard + Exotic tables)
 *   - subraces required per RAW — PHB Dwarf p.18, Elf p.21, Gnome p.35,
 *     Halfling p.26, Dragonborn p.32–34 (ancestry-required pattern from SDD
 *     `race-dragonborn-ancestry`)
 *   - subraces replacing parent ASI — PHB p.31 Variant Human sidebar
 *
 * Origin: SDD `domain-reference-data-runtime-source` (engram #807).
 */
import type { WorldRefData } from './ref-data.js';

const PHB_STANDARD_LANGUAGES: readonly string[] = [
  'common',
  'dwarvish',
  'elvish',
  'giant',
  'gnomish',
  'goblin',
  'halfling',
  'orc',
];

const PHB_EXOTIC_LANGUAGES: readonly string[] = [
  'abyssal',
  'celestial',
  'deep-speech',
  'draconic',
  'infernal',
  'primordial',
  'sylvan',
  'undercommon',
];

const PHB_SUBRACE_REQUIRED_KEYS: readonly string[] = [
  'dwarf|PHB',
  'elf|PHB',
  'gnome|PHB',
  'halfling|PHB',
  'dragonborn|PHB',
];

const PHB_SUBRACE_REPLACING_ABILITY_KEYS: readonly string[] = [
  // Variant Human — PHB p.31 sidebar: "all of which replace the human's
  // Ability Score Increase trait".
  'human--variant|PHB',
];

/**
 * Returns a fresh `WorldRefData` populated with PHB defaults. Returns a new
 * object on each call so callers can mutate the Sets (e.g. when extending with
 * homebrew entries) without affecting other consumers.
 */
export function phbDefaultPools(): WorldRefData {
  return {
    languagePool: {
      standard: [...PHB_STANDARD_LANGUAGES],
      exotic: [...PHB_EXOTIC_LANGUAGES],
    },
    subraceRequiredSet: new Set(PHB_SUBRACE_REQUIRED_KEYS),
    subraceReplacingAbilitySet: new Set(PHB_SUBRACE_REPLACING_ABILITY_KEYS),
  };
}

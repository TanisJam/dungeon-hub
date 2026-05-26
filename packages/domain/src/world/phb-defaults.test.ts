/**
 * Tests for phbDefaultPools() — PHB-only WorldRefData fixture.
 * Covers REQ-DRD-PHB-PARITY from sdd/domain-reference-data-runtime-source/spec.
 *
 * Counts are anchored to PHB p.123 (languages) and PHB p.31 (Variant Human ASI
 * sidebar) — the same data the pre-SDD hardcoded constants encoded.
 */
import { describe, expect, it } from 'vitest';
import { phbDefaultPools } from './phb-defaults.js';

describe('phbDefaultPools() — PHB language pool', () => {
  it('returns exactly 8 PHB standard languages (PHB p.123)', () => {
    const { languagePool } = phbDefaultPools();
    expect(languagePool.standard).toHaveLength(8);
    expect([...languagePool.standard].sort()).toEqual(
      ['common', 'dwarvish', 'elvish', 'giant', 'gnomish', 'goblin', 'halfling', 'orc'].sort(),
    );
  });

  it('returns exactly 8 PHB exotic languages (PHB p.123)', () => {
    const { languagePool } = phbDefaultPools();
    expect(languagePool.exotic).toHaveLength(8);
    expect([...languagePool.exotic].sort()).toEqual(
      [
        'abyssal',
        'celestial',
        'deep-speech',
        'draconic',
        'infernal',
        'primordial',
        'sylvan',
        'undercommon',
      ].sort(),
    );
  });
});

describe('phbDefaultPools() — subrace registries', () => {
  it('subraceRequiredSet contains all 5 PHB races that require a subrace per RAW', () => {
    const { subraceRequiredSet } = phbDefaultPools();
    // PHB: Dwarf p.18, Elf p.21, Gnome p.35, Halfling p.26, Dragonborn p.32–34
    // (the ancestry-required pattern was codified in race-dragonborn-ancestry SDD).
    expect(subraceRequiredSet.size).toBe(5);
    expect(subraceRequiredSet.has('dwarf|PHB')).toBe(true);
    expect(subraceRequiredSet.has('elf|PHB')).toBe(true);
    expect(subraceRequiredSet.has('gnome|PHB')).toBe(true);
    expect(subraceRequiredSet.has('halfling|PHB')).toBe(true);
    expect(subraceRequiredSet.has('dragonborn|PHB')).toBe(true);
  });

  it('subraceRequiredSet does NOT include PHB races without RAW subrace requirement', () => {
    const { subraceRequiredSet } = phbDefaultPools();
    expect(subraceRequiredSet.has('human|PHB')).toBe(false);
    expect(subraceRequiredSet.has('half-elf|PHB')).toBe(false);
    expect(subraceRequiredSet.has('half-orc|PHB')).toBe(false);
    expect(subraceRequiredSet.has('tiefling|PHB')).toBe(false);
  });

  it('subraceReplacingAbilitySet contains Variant Human (PHB p.31 sidebar)', () => {
    const { subraceReplacingAbilitySet } = phbDefaultPools();
    expect(subraceReplacingAbilitySet.has('human--variant|PHB')).toBe(true);
  });

  it('subraceReplacingAbilitySet does NOT include other PHB subraces (additive ASI)', () => {
    const { subraceReplacingAbilitySet } = phbDefaultPools();
    expect(subraceReplacingAbilitySet.has('dwarf--hill|PHB')).toBe(false);
    expect(subraceReplacingAbilitySet.has('elf--high|PHB')).toBe(false);
  });
});

/**
 * Tests for SUBRACES_REPLACING_PARENT_ABILITY domain constant + helper.
 *
 * PHB 2014 p.31 sidebar (Variant Human): "all of which replace the human's
 * Ability Score Increase trait". The variant's ASI REPLACES the base race's,
 * it does NOT stack. We encode this via a small constant lookup.
 */
import { describe, expect, it } from 'vitest';
import {
  SUBRACES_REPLACING_PARENT_ABILITY,
  subraceReplacesParentAbility,
} from './subraces-replacing-parent-ability.js';

describe('SUBRACES_REPLACING_PARENT_ABILITY — domain constant', () => {
  it('contains human--variant|PHB (Variant Human, PHB p.31 sidebar — compound importer slug)', () => {
    expect(SUBRACES_REPLACING_PARENT_ABILITY.has('human--variant|PHB')).toBe(true);
  });
});

describe('subraceReplacesParentAbility — lookup helper', () => {
  it('returns true for Variant Human (slug=human--variant, source=PHB)', () => {
    expect(subraceReplacesParentAbility({ slug: 'human--variant', source: 'PHB' })).toBe(true);
  });

  it('returns false for Hill Dwarf (subrace stacks per PHB p.20)', () => {
    expect(subraceReplacesParentAbility({ slug: 'dwarf--hill', source: 'PHB' })).toBe(false);
  });

  it('returns false for High Elf (subrace stacks per PHB p.23)', () => {
    expect(subraceReplacesParentAbility({ slug: 'elf--high', source: 'PHB' })).toBe(false);
  });

  it('returns false for unknown subraces', () => {
    expect(subraceReplacesParentAbility({ slug: 'foo--bar', source: 'XYZ' })).toBe(false);
  });
});

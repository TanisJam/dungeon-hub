/**
 * Tests for resetClassResourcesForRest().
 * Covers REQ-RAC-REST-SHORT + REQ-RAC-REST-LONG from
 * sdd/rules-audit-class-features/spec (#814).
 */
import { describe, expect, it } from 'vitest';
import type { AppliedClass } from '../class/types.js';
import { resetClassResourcesForRest } from './reset.js';

const FIGHTER_L1: AppliedClass = {
  slug: 'fighter', source: 'PHB', level: 1, subclass: null, hitDie: 'd10',
  savingThrows: ['str', 'con'], armorProficiencies: [], weaponProficiencies: [],
  toolProficiencies: [], skillChoices: [],
};
const MONK_L5: AppliedClass = {
  slug: 'monk', source: 'PHB', level: 5, subclass: null, hitDie: 'd8',
  savingThrows: ['str', 'dex'], armorProficiencies: [], weaponProficiencies: [],
  toolProficiencies: [], skillChoices: [],
};

describe('resetClassResourcesForRest — short rest', () => {
  it('clears Ki and Second Wind (both short-trigger)', () => {
    const used = { 'monk:ki-points': 3, 'fighter:second-wind': 1 };
    const next = resetClassResourcesForRest(used, [MONK_L5, FIGHTER_L1], 'short');
    expect(next['monk:ki-points']).toBe(0);
    expect(next['fighter:second-wind']).toBe(0);
  });

  it('does NOT touch unrelated slugs (legacy data passes through)', () => {
    const used = { 'monk:ki-points': 3, 'paladin:lay-on-hands': 10 };
    const next = resetClassResourcesForRest(used, [MONK_L5], 'short');
    expect(next['monk:ki-points']).toBe(0);
    expect(next['paladin:lay-on-hands']).toBe(10);
  });

  it('does NOT touch resources of classes the character does NOT have', () => {
    // Solo monk; fighter slug NOT in classes → not reset.
    const used = { 'fighter:second-wind': 1 };
    const next = resetClassResourcesForRest(used, [MONK_L5], 'short');
    expect(next['fighter:second-wind']).toBe(1);
  });
});

describe('resetClassResourcesForRest — long rest', () => {
  it('clears all class resources for owned classes regardless of trigger', () => {
    const used = { 'monk:ki-points': 3, 'fighter:second-wind': 1 };
    const next = resetClassResourcesForRest(used, [MONK_L5, FIGHTER_L1], 'long');
    expect(next['monk:ki-points']).toBe(0);
    expect(next['fighter:second-wind']).toBe(0);
  });
});

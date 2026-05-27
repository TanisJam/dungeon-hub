/**
 * Tests for resetClassResourcesForRest().
 * Covers REQ-RAC-REST-SHORT + REQ-RAC-REST-LONG from
 * sdd/rules-audit-class-features/spec (#814)
 * + REQ-BRD-FND-RESET-SIGNATURE from sdd/class-resource-bardic-inspiration/spec (#930).
 */
import { describe, expect, it } from 'vitest';
import type { AppliedClass } from '../class/types.js';
import { resetClassResourcesForRest } from './reset.js';
import type { ResourceCtx } from './types.js';

const ZERO_MODS: ResourceCtx['abilityMods'] = {
  str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0,
};

function mods(overrides: Partial<ResourceCtx['abilityMods']> = {}): ResourceCtx['abilityMods'] {
  return { ...ZERO_MODS, ...overrides };
}

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
    const next = resetClassResourcesForRest(used, [MONK_L5, FIGHTER_L1], 'short', mods());
    expect(next['monk:ki-points']).toBe(0);
    expect(next['fighter:second-wind']).toBe(0);
  });

  it('does NOT touch unrelated slugs (legacy data passes through)', () => {
    const used = { 'monk:ki-points': 3, 'paladin:lay-on-hands': 10 };
    const next = resetClassResourcesForRest(used, [MONK_L5], 'short', mods());
    expect(next['monk:ki-points']).toBe(0);
    expect(next['paladin:lay-on-hands']).toBe(10);
  });

  it('does NOT touch resources of classes the character does NOT have', () => {
    // Solo monk; fighter slug NOT in classes → not reset.
    const used = { 'fighter:second-wind': 1 };
    const next = resetClassResourcesForRest(used, [MONK_L5], 'short', mods());
    expect(next['fighter:second-wind']).toBe(1);
  });
});

describe('resetClassResourcesForRest — long rest', () => {
  it('clears all class resources for owned classes regardless of trigger', () => {
    const used = { 'monk:ki-points': 3, 'fighter:second-wind': 1 };
    const next = resetClassResourcesForRest(used, [MONK_L5, FIGHTER_L1], 'long', mods());
    expect(next['monk:ki-points']).toBe(0);
    expect(next['fighter:second-wind']).toBe(0);
  });
});

describe('resetClassResourcesForRest — Bard Bardic Inspiration (PHB p.53-54)', () => {
  const BARD_L4: AppliedClass = {
    slug: 'bard', source: 'PHB', level: 4, subclass: null, hitDie: 'd8',
    savingThrows: ['dex', 'cha'], armorProficiencies: [], weaponProficiencies: [],
    toolProficiencies: [], skillChoices: [],
  };
  const BARD_L5: AppliedClass = { ...BARD_L4, level: 5 };
  const BARD_L20: AppliedClass = { ...BARD_L4, level: 20 };

  it('Bard L4 short rest → bardic-inspiration NOT restored (still "long" trigger)', () => {
    const used = { 'bard:bardic-inspiration': 1 };
    const next = resetClassResourcesForRest(used, [BARD_L4], 'short', mods({ cha: 2 }));
    expect(next['bard:bardic-inspiration']).toBe(1);
  });

  it('Bard L4 long rest → bardic-inspiration restored', () => {
    const used = { 'bard:bardic-inspiration': 1 };
    const next = resetClassResourcesForRest(used, [BARD_L4], 'long', mods({ cha: 2 }));
    expect(next['bard:bardic-inspiration']).toBe(0);
  });

  it('Bard L5 short rest → bardic-inspiration restored (Font of Inspiration)', () => {
    const used = { 'bard:bardic-inspiration': 2 };
    const next = resetClassResourcesForRest(used, [BARD_L5], 'short', mods({ cha: 3 }));
    expect(next['bard:bardic-inspiration']).toBe(0);
  });

  it('Bard L20 short rest → bardic-inspiration restored', () => {
    const used = { 'bard:bardic-inspiration': 5 };
    const next = resetClassResourcesForRest(used, [BARD_L20], 'short', mods({ cha: 5 }));
    expect(next['bard:bardic-inspiration']).toBe(0);
  });

  it('Bard L4 + Monk L2 short rest → ki cleared, bardic preserved', () => {
    const used = { 'bard:bardic-inspiration': 1, 'monk:ki-points': 1 };
    const monkL2 = { ...MONK_L5, level: 2 };
    const next = resetClassResourcesForRest(used, [BARD_L4, monkL2], 'short', mods({ cha: 2 }));
    expect(next['bard:bardic-inspiration']).toBe(1);
    expect(next['monk:ki-points']).toBe(0);
  });
});

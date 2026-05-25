import { describe, expect, it } from 'vitest';
import { computeSpellSlots } from '../../../src/character/spellcasting/compute.js';
import {
  classifyCaster,
  casterContribution,
} from '../../../src/character/spellcasting/caster-type.js';
import type { AppliedClass } from '../../../src/character/class/types.js';

function makeClass(slug: string, level: number, subclassSlug: string | null = null): AppliedClass {
  return {
    slug,
    source: 'PHB',
    level,
    subclass: subclassSlug ? { slug: subclassSlug, source: 'PHB' } : null,
    hitDie: 'd8',
    savingThrows: [],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    skillChoices: [],
  };
}

describe('classifyCaster', () => {
  it.each([
    ['bard', 'full'],
    ['cleric', 'full'],
    ['druid', 'full'],
    ['sorcerer', 'full'],
    ['wizard', 'full'],
    ['paladin', 'half'],
    ['ranger', 'half'],
    ['artificer', 'artificer'],
    ['warlock', 'warlock'],
    ['barbarian', 'none'],
    ['monk', 'none'],
  ])('%s → %s', (slug, expected) => {
    expect(classifyCaster(makeClass(slug, 1))).toBe(expected);
  });

  it('fighter sin EK → none', () => {
    expect(classifyCaster(makeClass('fighter', 5))).toBe('none');
  });

  it('fighter con Eldritch Knight → third', () => {
    expect(classifyCaster(makeClass('fighter', 5, 'eldritch-knight'))).toBe('third');
  });

  it('rogue con Arcane Trickster → third', () => {
    expect(classifyCaster(makeClass('rogue', 5, 'arcane-trickster'))).toBe('third');
  });

  it('rogue con otra subclass → none', () => {
    expect(classifyCaster(makeClass('rogue', 5, 'thief'))).toBe('none');
  });
});

describe('casterContribution (multiclass)', () => {
  it('full = level entero', () => {
    expect(casterContribution(makeClass('wizard', 5))).toBe(5);
  });

  it('half = floor(level / 2)', () => {
    expect(casterContribution(makeClass('paladin', 5))).toBe(2);
    expect(casterContribution(makeClass('ranger', 1))).toBe(0);
  });

  it('artificer = ceil(level / 2) — TCE clarification', () => {
    expect(casterContribution(makeClass('artificer', 1))).toBe(1);
    expect(casterContribution(makeClass('artificer', 3))).toBe(2);
    expect(casterContribution(makeClass('artificer', 6))).toBe(3);
  });

  it('third = floor(level / 3)', () => {
    expect(casterContribution(makeClass('fighter', 5, 'eldritch-knight'))).toBe(1);
    expect(casterContribution(makeClass('fighter', 9, 'eldritch-knight'))).toBe(3);
  });

  it('warlock = 0 (Pact Magic separado)', () => {
    expect(casterContribution(makeClass('warlock', 5))).toBe(0);
  });
});

describe('computeSpellSlots — single class full caster', () => {
  it('Wizard L5 = [4,3,2,0,...]', () => {
    const r = computeSpellSlots([makeClass('wizard', 5)]);
    expect(r.slots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(r.pactMagic).toBeNull();
  });

  it('Cleric L11 = [4,3,3,3,2,1,0,...]', () => {
    const r = computeSpellSlots([makeClass('cleric', 11)]);
    expect(r.slots).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0]);
  });

  it('Sorcerer L20 tiene el set completo', () => {
    const r = computeSpellSlots([makeClass('sorcerer', 20)]);
    expect(r.slots).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });
});

describe('computeSpellSlots — half / third / artificer single class', () => {
  it('Paladin L1 sin slots', () => {
    const r = computeSpellSlots([makeClass('paladin', 1)]);
    expect(r.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Paladin L5 = [4,2,0,...]', () => {
    const r = computeSpellSlots([makeClass('paladin', 5)]);
    expect(r.slots).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Ranger L20 = [4,3,3,3,2,0,...]', () => {
    const r = computeSpellSlots([makeClass('ranger', 20)]);
    expect(r.slots).toEqual([4, 3, 3, 3, 2, 0, 0, 0, 0]);
  });

  it('Artificer L1 = [2,0,...] (a diferencia de Paladin/Ranger)', () => {
    const r = computeSpellSlots([makeClass('artificer', 1)]);
    expect(r.slots).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Eldritch Knight L3 = [2,0,...]', () => {
    const r = computeSpellSlots([makeClass('fighter', 3, 'eldritch-knight')]);
    expect(r.slots).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Eldritch Knight L1 sin slots (todavía no eligió subclass técnicamente, pero ya marcada)', () => {
    const r = computeSpellSlots([makeClass('fighter', 1, 'eldritch-knight')]);
    expect(r.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Arcane Trickster L13 = [4,3,2,0,...]', () => {
    const r = computeSpellSlots([makeClass('rogue', 13, 'arcane-trickster')]);
    expect(r.slots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('Fighter L10 sin EK → 0 slots', () => {
    const r = computeSpellSlots([makeClass('fighter', 10)]);
    expect(r.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('computeSpellSlots — Warlock Pact Magic', () => {
  // SP-07: L1 and L3 were missing from prior coverage
  it('SP-07 REQ-SP07-WARLOCK-PACT-L1: Warlock L1 — 1 pact slot de nivel 1 (PHB p.107)', () => {
    // PHB p.107: Warlock L1 has 1 pact slot at level 1
    const r = computeSpellSlots([makeClass('warlock', 1)]);
    expect(r.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.pactMagic).toEqual({ slotCount: 1, slotLevel: 1 });
  });

  it('SP-07 REQ-SP07-WARLOCK-PACT-L3: Warlock L3 — 2 pact slots de nivel 2 (PHB p.107)', () => {
    // PHB p.107: Warlock L3 has 2 pact slots at level 2
    const r = computeSpellSlots([makeClass('warlock', 3)]);
    expect(r.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.pactMagic).toEqual({ slotCount: 2, slotLevel: 2 });
  });

  it('Warlock L5: 2 slots de nivel 3, slots regulares vacíos', () => {
    const r = computeSpellSlots([makeClass('warlock', 5)]);
    expect(r.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.pactMagic).toEqual({ slotCount: 2, slotLevel: 3 });
  });

  it('Warlock L17: 4 slots de nivel 5', () => {
    const r = computeSpellSlots([makeClass('warlock', 17)]);
    expect(r.pactMagic).toEqual({ slotCount: 4, slotLevel: 5 });
  });

  it('Warlock L11: 3 slots de nivel 5', () => {
    const r = computeSpellSlots([makeClass('warlock', 11)]);
    expect(r.pactMagic).toEqual({ slotCount: 3, slotLevel: 5 });
  });
});

describe('computeSpellSlots — Multiclass', () => {
  it('Wizard 3 / Cleric 2 → effective 5 → [4,3,2,0,...]', () => {
    const r = computeSpellSlots([makeClass('wizard', 3), makeClass('cleric', 2)]);
    expect(r.slots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('Paladin 4 / Wizard 1 → effective floor(4/2)+1 = 3 → [4,2,0,...]', () => {
    const r = computeSpellSlots([makeClass('paladin', 4), makeClass('wizard', 1)]);
    expect(r.slots).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Wizard 5 / Warlock 3: slots = Wiz5 single (los Warlock slots son pact aparte)', () => {
    const r = computeSpellSlots([makeClass('wizard', 5), makeClass('warlock', 3)]);
    expect(r.slots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(r.pactMagic).toEqual({ slotCount: 2, slotLevel: 2 });
  });

  it('EK Fighter 9 / Wizard 3 → floor(9/3)+3 = 6 → [4,3,3,0,...]', () => {
    const r = computeSpellSlots([
      makeClass('fighter', 9, 'eldritch-knight'),
      makeClass('wizard', 3),
    ]);
    expect(r.slots).toEqual([4, 3, 3, 0, 0, 0, 0, 0, 0]);
  });

  it('Artificer 3 / Wizard 1 → ceil(3/2)+1 = 3 → [4,2,0,...]', () => {
    const r = computeSpellSlots([makeClass('artificer', 3), makeClass('wizard', 1)]);
    expect(r.slots).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Barbarian solo → sin slots ni pact', () => {
    const r = computeSpellSlots([makeClass('barbarian', 10)]);
    expect(r.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.pactMagic).toBeNull();
  });

  it('SP-07 REQ-SP07-MULTICLASS-COMPUTE-SLOTS: Cleric 1 + Wizard 1 → effective level 2 → PHB p.165 table row 2', () => {
    // PHB p.165: multiclass spell slot table — effective caster level 2 = 3 L1 slots
    // Full-caster Cleric (contributes 1) + Full-caster Wizard (contributes 1) = 2
    const r = computeSpellSlots([makeClass('cleric', 1), makeClass('wizard', 1)]);
    expect(r.slots).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.pactMagic).toBeNull();
  });

  it('SP-07 REQ-SP07-MULTICLASS-COMPUTE-SLOTS: Warlock L5 + Cleric L1 — pact reflects Warlock L5, regular slots from Cleric L1 only', () => {
    // PHB p.164-165: Warlock pact slots are independent; regular multiclass slots
    // only count non-warlock caster contributions. Cleric L1 contributes 1 full-caster level.
    const r = computeSpellSlots([makeClass('warlock', 5), makeClass('cleric', 1)]);
    // pactMagic = Warlock L5: 2 slots of level 3
    expect(r.pactMagic).toEqual({ slotCount: 2, slotLevel: 3 });
    // regularSlots = Cleric L1 only (effective level 1 → 2 L1 slots per PHB p.165 row 1)
    expect(r.slots).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

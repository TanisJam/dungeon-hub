/**
 * Tests for SpellSlotsView.slotsUsed + pactSlotsUsed surfaces via computeCharacterSheet.
 * SP-05 — REQ-SP05-SHEET-EXPOSES-USED + REQ-SP05-READ-PATH-TOLERANCE.
 */
import { describe, expect, it } from 'vitest';
import { computeCharacterSheet } from '../../../src/character/sheet/compute.js';
import type { CharacterSnapshot } from '../../../src/character/sheet/types.js';

/** Minimal wizard L1 snapshot. */
function makeWizardSnapshot(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    name: 'Gandalf',
    baseStats: { str: 10, dex: 14, con: 12, int: 18, wis: 14, cha: 10 },
    classes: [
      {
        slug: 'wizard',
        source: 'PHB',
        level: 1,
        hitDie: 'd6',
        subclass: null,
        savingThrows: ['int', 'wis'],
        armorProficiencies: [],
        weaponProficiencies: [],
        toolProficiencies: [],
        skillChoices: [],
      },
    ],
    ...overrides,
  };
}

/** Call computeCharacterSheet with minimal required inputs. */
function computeSheet(snapshot: CharacterSnapshot) {
  return computeCharacterSheet({
    character: snapshot,
    raceData: { racialTraits: [] },
    itemWeights: new Map(),
    encumbranceVariant: 'standard',
  });
}

describe('SpellSlotsView — slotsUsed from CharacterSnapshot', () => {
  it('exposes spellSlotsUsed[0] when set to 1 (REQ-SP05-SHEET-EXPOSES-USED)', () => {
    const sheet = computeSheet(
      makeWizardSnapshot({ spellSlotsUsed: [1, 0, 0, 0, 0, 0, 0, 0, 0] }),
    );
    expect(sheet.spellSlots.slotsUsed[0]).toBe(1);
  });

  it('exposes warlockSlotsUsed when set to 2 (REQ-SP05-SHEET-EXPOSES-USED)', () => {
    const sheet = computeSheet(
      makeWizardSnapshot({
        classes: [
          {
            slug: 'warlock',
            source: 'PHB',
            level: 5,
            hitDie: 'd8',
            subclass: null,
            savingThrows: ['wis', 'cha'],
            armorProficiencies: [],
            weaponProficiencies: [],
            toolProficiencies: [],
            skillChoices: [],
          },
        ],
        warlockSlotsUsed: 2,
      }),
    );
    expect(sheet.spellSlots.pactSlotsUsed).toBe(2);
  });

  it('defaults slotsUsed to [0×9] when spellSlotsUsed absent (REQ-SP05-READ-PATH-TOLERANCE)', () => {
    const sheet = computeSheet(makeWizardSnapshot()); // no spellSlotsUsed field
    expect(sheet.spellSlots.slotsUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('defaults pactSlotsUsed to 0 when warlockSlotsUsed absent (REQ-SP05-READ-PATH-TOLERANCE)', () => {
    const sheet = computeSheet(makeWizardSnapshot()); // no warlockSlotsUsed field
    expect(sheet.spellSlots.pactSlotsUsed).toBe(0);
  });
});

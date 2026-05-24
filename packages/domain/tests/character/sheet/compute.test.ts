import { describe, expect, it } from 'vitest';
import {
  computeCharacterSheet,
  proficiencyBonus,
} from '../../../src/character/sheet/compute.js';
import type {
  CharacterSnapshot,
  RaceSheetData,
} from '../../../src/character/sheet/types.js';

describe('proficiencyBonus por nivel total', () => {
  it.each([
    [1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4],
    [13, 5], [16, 5], [17, 6], [20, 6],
  ])('level %i → PB +%i', (level, expected) => {
    expect(proficiencyBonus(level)).toBe(expected);
  });
});

// Personaje de prueba: High Elf Wizard 1 con stats point-buy 27 + Sage background.
const HIGH_ELF_WIZARD: CharacterSnapshot = {
  name: 'Aldric Vane',
  baseStats: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
  asisApplied: [
    { ability: 'dex', bonus: 2, source: 'race' },
    { ability: 'int', bonus: 1, source: 'subrace' },
  ],
  race: { slug: 'elf', source: 'PHB' },
  subrace: { slug: 'elf--high', source: 'PHB' },
  classes: [
    {
      slug: 'wizard',
      source: 'PHB',
      level: 1,
      subclass: null,
      hitDie: 'd6',
      savingThrows: ['int', 'wis'],
      armorProficiencies: [],
      weaponProficiencies: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
      toolProficiencies: [],
      skillChoices: ['arcana', 'investigation'],
    },
  ],
  background: {
    slug: 'sage',
    source: 'PHB',
    skills: ['arcana', 'history'],
    languages: ['draconic', 'elvish'],
    tools: [],
  },
  feats: [],
};

const ELF_RACE_DATA: RaceSheetData = {
  speed: 30,
  size: ['M'],
  languageProficiencies: [{ common: true, elvish: true }],
};

describe('computeCharacterSheet — High Elf Wizard 1', () => {
  const sheet = computeCharacterSheet({
    character: HIGH_ELF_WIZARD,
    raceData: ELF_RACE_DATA,
  });

  it('total level y proficiency bonus', () => {
    expect(sheet.identity.totalLevel).toBe(1);
    expect(sheet.proficiencyBonus).toBe(2);
  });

  it('ability scores con ASIs aplicados', () => {
    // base 14 dex + 2 race = 16
    expect(sheet.abilityScores.dex.score).toBe(16);
    expect(sheet.abilityScores.dex.modifier).toBe(3);
    // base 15 int + 1 subrace = 16
    expect(sheet.abilityScores.int.score).toBe(16);
    expect(sheet.abilityScores.int.modifier).toBe(3);
    // unchanged
    expect(sheet.abilityScores.str.score).toBe(8);
    expect(sheet.abilityScores.str.modifier).toBe(-1);
  });

  it('saves: INT y WIS proficient con +PB', () => {
    const intSave = sheet.savingThrows.find((s) => s.ability === 'int')!;
    expect(intSave.proficient).toBe(true);
    expect(intSave.modifier).toBe(3 + 2); // mod + pb
    const strSave = sheet.savingThrows.find((s) => s.ability === 'str')!;
    expect(strSave.proficient).toBe(false);
    expect(strSave.modifier).toBe(-1);
  });

  it('skills: arcana proficient (class + background), history proficient (background)', () => {
    const arcana = sheet.skills.find((s) => s.name === 'arcana')!;
    expect(arcana.proficient).toBe(true);
    expect(arcana.modifier).toBe(3 + 2); // INT mod + PB
    const history = sheet.skills.find((s) => s.name === 'history')!;
    expect(history.proficient).toBe(true);
    const athletics = sheet.skills.find((s) => s.name === 'athletics')!;
    expect(athletics.proficient).toBe(false);
    expect(athletics.modifier).toBe(-1); // STR mod
  });

  it('AC: unarmored 10 + DEX(3) = 13', () => {
    expect(sheet.armorClass.value).toBe(13);
    expect(sheet.armorClass.formula).toContain('DEX(3)');
  });

  it('HP: max d6 (6) + CON(2) = 8 al nivel 1', () => {
    expect(sheet.hitPoints.max).toBe(8);
  });

  it('initiative = DEX mod', () => {
    expect(sheet.initiative).toBe(3);
  });

  it('passive perception = 10 + WIS mod (sin profic) = 11', () => {
    expect(sheet.passivePerception).toBe(11);
  });

  it('carrying capacity = STR × 15', () => {
    expect(sheet.carryingCapacity).toBe(8 * 15);
  });

  it('spellcasting: Wizard con INT', () => {
    expect(sheet.spellcasting).toHaveLength(1);
    const sc = sheet.spellcasting[0]!;
    expect(sc.classSlug).toBe('wizard');
    expect(sc.ability).toBe('int');
    expect(sc.saveDC).toBe(8 + 2 + 3); // 8 + PB + INT mod = 13
    expect(sc.attackBonus).toBe(2 + 3); // PB + INT mod = 5
  });

  it('hit dice: d6 → 1', () => {
    expect(sheet.hitDice.d6).toBe(1);
  });

  it('languages: race + background', () => {
    expect(sheet.proficiencies.languages).toEqual(
      expect.arrayContaining(['common', 'elvish', 'draconic']),
    );
  });

  it('speed walk = 30 desde raceData', () => {
    expect(sheet.speed.walk).toBe(30);
  });
});

describe('computeCharacterSheet — Barbarian Unarmored Defense', () => {
  const BARB: CharacterSnapshot = {
    name: 'Grok',
    baseStats: { str: 15, dex: 14, con: 16, int: 8, wis: 10, cha: 8 },
    asisApplied: [],
    classes: [
      {
        slug: 'barbarian',
        source: 'PHB',
        level: 1,
        subclass: null,
        hitDie: 'd12',
        savingThrows: ['str', 'con'],
        armorProficiencies: ['light', 'medium', 'shield'],
        weaponProficiencies: ['simple', 'martial'],
        toolProficiencies: [],
        skillChoices: ['athletics', 'intimidation'],
      },
    ],
    feats: [],
  };

  const sheet = computeCharacterSheet({ character: BARB });

  it('AC Unarmored Defense = 10 + DEX(2) + CON(3) = 15', () => {
    expect(sheet.armorClass.value).toBe(15);
    expect(sheet.armorClass.formula).toContain('Barbarian Unarmored Defense');
  });

  it('HP: d12 max (12) + CON(3) = 15', () => {
    expect(sheet.hitPoints.max).toBe(15);
  });
});

describe('computeCharacterSheet — multiclass HP y saves', () => {
  const WIZ_FIGHTER: CharacterSnapshot = {
    name: 'Multi',
    baseStats: { str: 14, dex: 13, con: 14, int: 15, wis: 10, cha: 8 },
    classes: [
      {
        slug: 'wizard', source: 'PHB', level: 3, subclass: null, hitDie: 'd6',
        savingThrows: ['int', 'wis'],
        armorProficiencies: [], weaponProficiencies: [], toolProficiencies: [],
        skillChoices: ['arcana', 'investigation'],
      },
      {
        // Multiclass — no da saves
        slug: 'fighter', source: 'PHB', level: 1, subclass: null, hitDie: 'd10',
        savingThrows: [], // ← multiclass reduced
        armorProficiencies: ['light', 'medium', 'shield'],
        weaponProficiencies: ['simple', 'martial'],
        toolProficiencies: [],
        skillChoices: [],
      },
    ],
    feats: [],
  };

  const sheet = computeCharacterSheet({ character: WIZ_FIGHTER });

  it('totalLevel = 4, PB = 2', () => {
    expect(sheet.identity.totalLevel).toBe(4);
    expect(sheet.proficiencyBonus).toBe(2);
  });

  it('saves de Wizard (clase 1ª) presentes, los de Fighter (multiclass) ausentes', () => {
    expect(sheet.savingThrows.find((s) => s.ability === 'int')?.proficient).toBe(true);
    expect(sheet.savingThrows.find((s) => s.ability === 'wis')?.proficient).toBe(true);
    expect(sheet.savingThrows.find((s) => s.ability === 'str')?.proficient).toBe(false);
    expect(sheet.savingThrows.find((s) => s.ability === 'con')?.proficient).toBe(false);
  });

  it('HP: 6 + CON(2) [Wiz L1] + 2×(4+2) [Wiz L2-3] + 1×(6+2) [Fighter L1] = 28', () => {
    // 6+2 = 8 (L1 max wizard)
    // 2 × (4+2) = 12 (avg wizard L2, L3)
    // 1 × (6+2) = 8 (fighter mc L1 avg)
    // Total 28
    expect(sheet.hitPoints.max).toBe(28);
  });

  it('hit dice: d6 × 3 + d10 × 1', () => {
    expect(sheet.hitDice.d6).toBe(3);
    expect(sheet.hitDice.d10).toBe(1);
  });
});

describe('sheet: inventory views (1.6c)', () => {
  it('defaults: currency en 0, encumbrance ok con peso 0, attunement 0/3', () => {
    const sheet = computeCharacterSheet({ character: { name: 'Empty' } });
    expect(sheet.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
    expect(sheet.encumbrance.status).toBe('ok');
    expect(sheet.encumbrance.weight).toBe(0);
    expect(sheet.attunement).toEqual({ used: 0, max: 3 });
  });

  it('encumbrance.status = "over" cuando weight > STR × 15', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Heavy',
        baseStats: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [
          {
            instanceId: 'i1',
            itemSlug: 'plate-armor',
            itemSource: 'PHB',
            quantity: 2,
            state: 'stowed',
            attuned: false,
            customName: null,
            notes: '',
          },
        ],
      },
      itemWeights: [
        { slug: 'plate-armor', source: 'PHB', name: 'Plate', type: 'HA', weight: 65 },
      ],
    });
    expect(sheet.encumbrance.max).toBe(120);
    expect(sheet.encumbrance.weight).toBe(130);
    expect(sheet.encumbrance.status).toBe('over');
  });

  it('attunement.used cuenta solo los ítems con attuned=true', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Attuner',
        inventory: [
          {
            instanceId: 'a',
            itemSlug: 'ring',
            itemSource: 'DMG',
            quantity: 1,
            state: 'carried',
            attuned: true,
            customName: null,
            notes: '',
          },
          {
            instanceId: 'b',
            itemSlug: 'cloak',
            itemSource: 'DMG',
            quantity: 1,
            state: 'carried',
            attuned: false,
            customName: null,
            notes: '',
          },
        ],
      },
    });
    expect(sheet.attunement.used).toBe(1);
  });

  it('spellSlots: Wizard L5 → [4,3,2,0,...], pactMagic null', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Wiz5',
        baseStats: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
        classes: [{
          slug: 'wizard', source: 'PHB', level: 5,
          subclass: null, hitDie: 'd6',
          savingThrows: ['int', 'wis'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
      },
    });
    expect(sheet.spellSlots.slots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(sheet.spellSlots.pactMagic).toBeNull();
    expect(sheet.spellsByClass[0]?.spellsPrepared?.max).toBe(7); // INT mod 2 + level 5
  });

  it('spellSlots: Warlock L5 → pactMagic 2 slots level 3', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Wlock5',
        baseStats: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
        classes: [{
          slug: 'warlock', source: 'PHB', level: 5,
          subclass: null, hitDie: 'd8',
          savingThrows: ['wis', 'cha'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
      },
    });
    expect(sheet.spellSlots.pactMagic).toEqual({ slotCount: 2, slotLevel: 3 });
    expect(sheet.spellSlots.slots).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  // ---- Encumbrance variant ---------------------------------------------
  it('encumbrance variant: sin peso → status ok, speedPenalty 0', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Light',
        baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      },
      encumbranceVariant: true,
    });
    expect(sheet.encumbrance.status).toBe('ok');
    expect(sheet.encumbrance.speedPenalty).toBe(0);
    expect(sheet.speed.walk).toBe(30);
  });

  it('encumbrance variant: weight > STR×5 → encumbered, speed -10', () => {
    // STR 10 → encumbered en 50, heavy en 100, max en 150.
    const sheet = computeCharacterSheet({
      character: {
        name: 'Carrying',
        baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [{
          instanceId: 'a', itemSlug: 'plate-armor', itemSource: 'PHB',
          quantity: 1, state: 'stowed', attuned: false, customName: null, notes: '',
        }],
      },
      itemWeights: [{ slug: 'plate-armor', source: 'PHB', name: 'Plate', type: 'HA', weight: 65 }],
      encumbranceVariant: true,
    });
    expect(sheet.encumbrance.status).toBe('encumbered');
    expect(sheet.encumbrance.speedPenalty).toBe(10);
    expect(sheet.speed.walk).toBe(20); // 30 - 10
  });

  it('encumbrance variant: weight > STR×10 → heavily, speed -20', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Burdened',
        baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [{
          instanceId: 'a', itemSlug: 'plate-armor', itemSource: 'PHB',
          quantity: 2, state: 'stowed', attuned: false, customName: null, notes: '',
        }],
      },
      itemWeights: [{ slug: 'plate-armor', source: 'PHB', name: 'Plate', type: 'HA', weight: 65 }],
      encumbranceVariant: true,
    });
    expect(sheet.encumbrance.status).toBe('heavily-encumbered');
    expect(sheet.speed.walk).toBe(10); // 30 - 20
  });

  it('sin variant: weight grande pero < STR×15 → ok, sin penalty', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Carrying',
        baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [{
          instanceId: 'a', itemSlug: 'plate-armor', itemSource: 'PHB',
          quantity: 1, state: 'stowed', attuned: false, customName: null, notes: '',
        }],
      },
      itemWeights: [{ slug: 'plate-armor', source: 'PHB', name: 'Plate', type: 'HA', weight: 65 }],
      encumbranceVariant: false,
    });
    expect(sheet.encumbrance.status).toBe('ok');
    expect(sheet.speed.walk).toBe(30);
  });

  it('encumbrance variant + exhaustion: penalties stackean (encumbered -10 + halved)', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Worst Day',
        baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [{
          instanceId: 'a', itemSlug: 'plate-armor', itemSource: 'PHB',
          quantity: 1, state: 'stowed', attuned: false, customName: null, notes: '',
        }],
        exhaustion: 2,
      },
      itemWeights: [{ slug: 'plate-armor', source: 'PHB', name: 'Plate', type: 'HA', weight: 65 }],
      encumbranceVariant: true,
    });
    // (30 - 10) / 2 = 10
    expect(sheet.speed.walk).toBe(10);
  });

  // ---- Exhaustion (PHB p.291) -----------------------------------------
  it('exhaustion 0: sin efectos, speed/HP intactos', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Fresh',
        baseStats: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        classes: [{
          slug: 'fighter', source: 'PHB', level: 3,
          subclass: null, hitDie: 'd10',
          savingThrows: ['str', 'con'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
      },
    });
    expect(sheet.exhaustion).toEqual({ level: 0, effects: [] });
    expect(sheet.speed.walk).toBe(30);
  });

  it('exhaustion 1: disadvantage ability checks (flag, sin mutar números)', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Tired',
        baseStats: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        classes: [{
          slug: 'fighter', source: 'PHB', level: 3,
          subclass: null, hitDie: 'd10',
          savingThrows: ['str', 'con'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
        exhaustion: 1,
      },
    });
    expect(sheet.exhaustion.effects).toContain('disadvantage-ability-checks');
    expect(sheet.speed.walk).toBe(30);
    expect(sheet.hitPoints.max).toBeGreaterThan(0);
  });

  it('exhaustion 2: speed halved', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Slow',
        baseStats: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        classes: [{
          slug: 'fighter', source: 'PHB', level: 3,
          subclass: null, hitDie: 'd10',
          savingThrows: ['str', 'con'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
        exhaustion: 2,
      },
    });
    expect(sheet.exhaustion.effects).toContain('speed-halved');
    expect(sheet.speed.walk).toBe(15);
  });

  it('exhaustion 4: HP max halved (round down)', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Broken',
        baseStats: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        classes: [{
          slug: 'fighter', source: 'PHB', level: 3,
          subclass: null, hitDie: 'd10',
          savingThrows: ['str', 'con'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
        exhaustion: 4,
      },
    });
    // Fighter L3 CON 14: 10+2 + 2×(6+2) = 28. /2 = 14
    expect(sheet.hitPoints.max).toBe(14);
    expect(sheet.exhaustion.effects).toContain('hp-max-halved');
    // 4 incluye 1, 2, 3, 4
    expect(sheet.exhaustion.effects).toContain('speed-halved');
    expect(sheet.speed.walk).toBe(15);
  });

  it('exhaustion 5: speed forzado a 0', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Frozen',
        baseStats: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        classes: [{
          slug: 'fighter', source: 'PHB', level: 3,
          subclass: null, hitDie: 'd10',
          savingThrows: ['str', 'con'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
        exhaustion: 5,
      },
    });
    expect(sheet.speed.walk).toBe(0);
    expect(sheet.exhaustion.effects).toContain('speed-zero');
  });

  it('exhaustion 6: incluye dead flag', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Dead',
        baseStats: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        classes: [{
          slug: 'fighter', source: 'PHB', level: 3,
          subclass: null, hitDie: 'd10',
          savingThrows: ['str', 'con'],
          armorProficiencies: [], weaponProficiencies: [],
          toolProficiencies: [], skillChoices: [],
        }],
        exhaustion: 6,
      },
    });
    expect(sheet.exhaustion.effects).toContain('dead');
  });

  it('exhaustion clamp: 9 → 6', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Cheat',
        exhaustion: 9,
      },
    });
    expect(sheet.exhaustion.level).toBe(6);
  });

  it('currency: pasa los valores tal cual desde character.currency', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Rich',
        currency: { cp: 0, sp: 5, ep: 0, gp: 100, pp: 2 },
      },
    });
    expect(sheet.currency).toEqual({ cp: 0, sp: 5, ep: 0, gp: 100, pp: 2 });
  });
});

// ============================================================
// S-1..S-4: raceSkillChoices merged into proficientSkills
// ============================================================
describe('computeCharacterSheet — raceSkillChoices merged into proficientSkills', () => {
  it('S-1: raceSkillChoices=[perception,stealth], no class skills → both proficient', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Test',
        raceSkillChoices: ['perception', 'stealth'],
      },
    });
    const perception = sheet.skills.find((s) => s.name === 'perception');
    const stealth = sheet.skills.find((s) => s.name === 'stealth');
    expect(perception?.proficient).toBe(true);
    expect(stealth?.proficient).toBe(true);
  });

  it('S-2: raceSkillChoices=[perception] + class has perception → proficient once (Set dedup)', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Test',
        raceSkillChoices: ['perception'],
        classes: [
          {
            slug: 'fighter',
            source: 'PHB',
            level: 1,
            subclass: null,
            hitDie: 'd10',
            savingThrows: ['str', 'con'],
            armorProficiencies: ['light', 'medium', 'heavy', 'shields'],
            weaponProficiencies: ['simple', 'martial'],
            toolProficiencies: [],
            skillChoices: ['perception', 'athletics'],
          },
        ],
      },
    });
    const perceptionSkills = sheet.skills.filter((s) => s.name === 'perception');
    expect(perceptionSkills).toHaveLength(1);
    expect(perceptionSkills[0]!.proficient).toBe(true);
  });

  it('S-3: raceSkillChoices=[] → no race skills added', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Test',
        raceSkillChoices: [],
      },
    });
    // All skills should be non-proficient (no class/bg either)
    const proficientSkills = sheet.skills.filter((s) => s.proficient);
    expect(proficientSkills).toHaveLength(0);
  });

  it('S-4: raceSkillChoices undefined (legacy) → no crash, no race skill added', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Legacy Variant Human',
        // No raceSkillChoices field at all
      },
    });
    expect(sheet.skills).toHaveLength(18); // all 18 PHB skills
    const proficientSkills = sheet.skills.filter((s) => s.proficient);
    expect(proficientSkills).toHaveLength(0);
  });
});

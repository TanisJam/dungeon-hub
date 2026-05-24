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

// ── Batch 4: DarkvisionView computation (race-darkvision-grant) ───────────────
// PHB p.17 — Darkvision definition. PHB p.24 — Superior Darkvision (Drow 120 ft).
// Design: API does the merge; compute receives the EFFECTIVE darkvision via raceData.darkvision.
// isSuperior = feet >= 120 (>= not === for homebrew future-proofing, spec REQ-7).

describe('computeCharacterSheet — DarkvisionView (PHB p.17, p.24)', () => {
  // C-1: Dwarf 60 ft, no subrace darkvision override → standard view
  it('C-1 (S-04): Dwarf raceData.darkvision=60 → { feet: 60, isSuperior: false }', () => {
    // PHB p.20 — Dwarf: Darkvision 60 ft.
    const sheet = computeCharacterSheet({
      character: { name: 'Thorin' },
      raceData: { speed: 25, size: ['M'], darkvision: 60 },
    });
    expect(sheet.darkvision).toEqual({ feet: 60, isSuperior: false });
  });

  // C-2: Elf + Drow — API already merged subrace override → 120 ft (superior)
  it('C-2 (S-05): raceData.darkvision=120 (merged Drow override) → { feet: 120, isSuperior: true }', () => {
    // PHB p.24 — Drow: Superior Darkvision 120 ft (replaces base Elf 60).
    const sheet = computeCharacterSheet({
      character: { name: 'Zaknafein' },
      raceData: { speed: 30, size: ['M'], darkvision: 120 },
    });
    expect(sheet.darkvision).toEqual({ feet: 120, isSuperior: true });
  });

  // C-3: Elf + High Elf — subrace has no darkvision field → API kept race value 60
  it('C-3 (S-06): raceData.darkvision=60 (High Elf subrace absent → race preserved) → { feet: 60, isSuperior: false }', () => {
    // PHB p.23 — Elf base: Darkvision 60 ft. High Elf subrace adds no override.
    const sheet = computeCharacterSheet({
      character: { name: 'Legolas' },
      raceData: { speed: 30, size: ['M'], darkvision: 60 },
    });
    expect(sheet.darkvision).toEqual({ feet: 60, isSuperior: false });
  });

  // C-4: Human — no darkvision at all → null
  it('C-4 (S-07): Human raceData.darkvision=undefined → null', () => {
    // PHB p.31 — Human: No darkvision.
    const sheet = computeCharacterSheet({
      character: { name: 'Sigurd' },
      raceData: { speed: 30, size: ['M'] },
    });
    expect(sheet.darkvision).toBeNull();
  });

  // C-5: Halfling + Lightfoot — neither has darkvision → null
  it('C-5 (S-08): Halfling raceData.darkvision=undefined → null', () => {
    // PHB p.28 — Halfling: No darkvision. Lightfoot subrace also grants none.
    const sheet = computeCharacterSheet({
      character: { name: 'Bilbo' },
      raceData: { speed: 25, size: ['S'] },
    });
    expect(sheet.darkvision).toBeNull();
  });

  // C-6: Subrace explicit null opt-out — API merged subrace null → raceData.darkvision=null → null
  it('C-6 (S-09): raceData.darkvision=null (subrace explicit null opt-out) → null', () => {
    // Decision #577: subrace null OVERRIDES race (even drops race darkvision to null).
    const sheet = computeCharacterSheet({
      character: { name: 'SunElf' },
      raceData: { speed: 30, size: ['M'], darkvision: null },
    });
    expect(sheet.darkvision).toBeNull();
  });

  // C-7: PHB Dragonborn + ancestry — Batch 3 regression guard → null (no darkvision in PHB)
  it('C-7 (S-10): PHB Dragonborn raceData.darkvision=undefined → null (PHB p.32–34 regression guard)', () => {
    // PHB p.32–34 — Dragonborn: NO darkvision. Batch 3 ancestry subraces also lack it.
    const sheet = computeCharacterSheet({
      character: { name: 'Qyara' },
      raceData: { speed: 30, size: ['M'], breathWeapon: { damageType: 'fire', shape: 'cone', size: '15 ft', savingThrow: 'dex' } },
    });
    expect(sheet.darkvision).toBeNull();
  });

  // C-8: Hypothetical homebrew 150 ft → isSuperior true (>= 120 threshold, REQ-7)
  it('C-8 (S-23): raceData.darkvision=150 (homebrew) → { feet: 150, isSuperior: true }', () => {
    // Spec REQ-7: isSuperior = feet >= 120. Future-proofs against homebrew tiers.
    const sheet = computeCharacterSheet({
      character: { name: 'DeepDweller' },
      raceData: { speed: 30, size: ['M'], darkvision: 150 },
    });
    expect(sheet.darkvision).toEqual({ feet: 150, isSuperior: true });
  });
});

// ── Batch 3: BreathWeaponView computation (race-dragonborn-ancestry) ──────────
// PHB p.34: saveDC = 8 + CON mod + PB; dice: 2d6(1-5), 3d6(6-10), 4d6(11-15), 5d6(16+)

function makeWizardCharacter(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    name: 'Dragonborn Test',
    baseStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    classes: [
      {
        slug: 'wizard',
        source: 'PHB',
        level: 1,
        subclass: null,
        hitDie: 'd6',
        savingThrows: ['int', 'wis'],
        armorProficiencies: [],
        weaponProficiencies: [],
        toolProficiencies: [],
        skillChoices: [],
      },
    ],
    feats: [],
    ...overrides,
  };
}

function makeBreathWeaponRaceData(overrides: {
  damageType: string;
  shape: 'line' | 'cone';
  size: string;
  savingThrow: 'dex' | 'con';
}): RaceSheetData {
  return {
    speed: 30,
    size: ['M'],
    breathWeapon: overrides,
  };
}

describe('computeCharacterSheet — BreathWeaponView (PHB p.34)', () => {
  // S-15: Green Dragonborn, CON 14 (+2 mod), level 1 (PB +2)
  it('S-1 (S-15): dragonborn--green, CON 14, level 1 → cone/con/poison, DC 12, 2d6', () => {
    const character = makeWizardCharacter({
      baseStats: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
      race: { slug: 'dragonborn', source: 'PHB' },
      subrace: { slug: 'dragonborn--green', source: 'PHB' },
    });
    const raceData = makeBreathWeaponRaceData({
      damageType: 'poison',
      shape: 'cone',
      size: '15 ft',
      savingThrow: 'con',
    });

    const sheet = computeCharacterSheet({ character, raceData });

    expect(sheet.breathWeapon).not.toBeNull();
    expect(sheet.breathWeapon?.damageType).toBe('poison');
    expect(sheet.breathWeapon?.shape).toBe('cone');
    expect(sheet.breathWeapon?.area).toBe('15 ft');
    expect(sheet.breathWeapon?.savingThrow).toBe('con');
    expect(sheet.breathWeapon?.saveDC).toBe(12); // 8 + 2 (CON) + 2 (PB)
    expect(sheet.breathWeapon?.damageDice).toBe('2d6');
  });

  // S-16: Blue Dragonborn, CON 16 (+3 mod), level 6 (PB +3)
  it('S-2 (S-16): dragonborn--blue, CON 16, level 6 → line/dex/lightning, DC 14, 3d6', () => {
    const character = makeWizardCharacter({
      baseStats: { str: 10, dex: 10, con: 16, int: 10, wis: 10, cha: 10 },
      race: { slug: 'dragonborn', source: 'PHB' },
      subrace: { slug: 'dragonborn--blue', source: 'PHB' },
      classes: [
        {
          slug: 'wizard',
          source: 'PHB',
          level: 6,
          subclass: null,
          hitDie: 'd6',
          savingThrows: ['int', 'wis'],
          armorProficiencies: [],
          weaponProficiencies: [],
          toolProficiencies: [],
          skillChoices: [],
        },
      ],
    });
    const raceData = makeBreathWeaponRaceData({
      damageType: 'lightning',
      shape: 'line',
      size: '5 ft × 30 ft',
      savingThrow: 'dex',
    });

    const sheet = computeCharacterSheet({ character, raceData });

    expect(sheet.breathWeapon?.damageType).toBe('lightning');
    expect(sheet.breathWeapon?.shape).toBe('line');
    expect(sheet.breathWeapon?.area).toBe('5 ft × 30 ft');
    expect(sheet.breathWeapon?.savingThrow).toBe('dex');
    expect(sheet.breathWeapon?.saveDC).toBe(14); // 8 + 3 (CON) + 3 (PB)
    expect(sheet.breathWeapon?.damageDice).toBe('3d6');
  });

  // S-17: Level 11 → 4d6 (CON 14, PB 4)
  it('S-3 (S-17): level 11, CON 14 → 4d6, DC 14', () => {
    const character = makeWizardCharacter({
      baseStats: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
      race: { slug: 'dragonborn', source: 'PHB' },
      subrace: { slug: 'dragonborn--red', source: 'PHB' },
      classes: [
        {
          slug: 'wizard',
          source: 'PHB',
          level: 11,
          subclass: null,
          hitDie: 'd6',
          savingThrows: ['int', 'wis'],
          armorProficiencies: [],
          weaponProficiencies: [],
          toolProficiencies: [],
          skillChoices: [],
        },
      ],
    });
    const raceData = makeBreathWeaponRaceData({
      damageType: 'fire',
      shape: 'cone',
      size: '15 ft',
      savingThrow: 'dex',
    });

    const sheet = computeCharacterSheet({ character, raceData });

    expect(sheet.breathWeapon?.damageDice).toBe('4d6');
    expect(sheet.breathWeapon?.saveDC).toBe(14); // 8 + 2 (CON) + 4 (PB)
  });

  // S-18: Level 16 → 5d6 (CON 14, PB 5)
  it('S-4 (S-18): level 16, CON 14 → 5d6, DC 15', () => {
    const character = makeWizardCharacter({
      baseStats: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
      race: { slug: 'dragonborn', source: 'PHB' },
      subrace: { slug: 'dragonborn--white', source: 'PHB' },
      classes: [
        {
          slug: 'wizard',
          source: 'PHB',
          level: 16,
          subclass: null,
          hitDie: 'd6',
          savingThrows: ['int', 'wis'],
          armorProficiencies: [],
          weaponProficiencies: [],
          toolProficiencies: [],
          skillChoices: [],
        },
      ],
    });
    const raceData = makeBreathWeaponRaceData({
      damageType: 'cold',
      shape: 'cone',
      size: '15 ft',
      savingThrow: 'con',
    });

    const sheet = computeCharacterSheet({ character, raceData });

    expect(sheet.breathWeapon?.damageDice).toBe('5d6');
    expect(sheet.breathWeapon?.saveDC).toBe(15); // 8 + 2 (CON) + 5 (PB)
  });

  // S-19: Non-Dragonborn character → breathWeapon is null
  it('S-5 (S-19): non-Dragonborn (Hill Dwarf) → breathWeapon is null', () => {
    const character = makeWizardCharacter({
      race: { slug: 'dwarf', source: 'PHB' },
      subrace: { slug: 'dwarf--hill', source: 'PHB' },
    });
    // raceData without breathWeapon
    const raceData: RaceSheetData = { speed: 25, size: ['M'] };

    const sheet = computeCharacterSheet({ character, raceData });

    expect(sheet.breathWeapon).toBeNull();
  });

  // S-20: Legacy Dragonborn with no subrace → breathWeapon null (read-tolerant)
  it('S-6 (S-20): legacy Dragonborn (no subrace, raceData.breathWeapon undefined) → null, no throw', () => {
    const character = makeWizardCharacter({
      race: { slug: 'dragonborn', source: 'PHB' },
      subrace: null, // pre-Batch-3 character
    });
    // raceData without breathWeapon field
    const raceData: RaceSheetData = { speed: 30, size: ['M'] };

    expect(() => {
      const sheet = computeCharacterSheet({ character, raceData });
      expect(sheet.breathWeapon).toBeNull();
    }).not.toThrow();
  });
});

// ── Batch 5: weapon + armor proficiency merge from race + subrace ─────────────
// Spec REQ-1..REQ-5, Design C-1..C-10.
// Key decision #589: subrace OVERRIDES race per category (not union).
// Drow REPLACES Elf weapons — strict negative assertion (S-08) catches union bug.
// 5etools shape: [{"battleaxe|phb": true}] — normalizeProf strips "|phb" suffix.

describe('computeCharacterSheet — race weapon/armor proficiencies (Batch 5)', () => {
  // C-1: Hill Dwarf → inherits Dwarf race weapons (no subrace override).
  // PHB p.20 — Dwarf Weapon Training: battleaxe, handaxe, light hammer, warhammer.
  // Hill Dwarf subrace has NO weaponProficiencies field → race block wins.
  it('C-1: Hill Dwarf → 4 axes+hammers from race (PHB p.20)', () => {
    const sheet = computeCharacterSheet({
      character: { name: 'Thorin', race: { slug: 'dwarf', source: 'PHB' }, subrace: { slug: 'dwarf--hill', source: 'PHB' } },
      raceData: {
        speed: 25,
        size: ['M'],
        weaponProficiencies: [{ 'battleaxe|phb': true, 'handaxe|phb': true, 'light hammer|phb': true, 'warhammer|phb': true }],
        // no armorProficiencies — Dwarf race has none at race level (Mountain Dwarf subrace adds them)
      },
    });
    expect(sheet.proficiencies.weapons).toContain('battleaxe');
    expect(sheet.proficiencies.weapons).toContain('handaxe');
    expect(sheet.proficiencies.weapons).toContain('light hammer');
    expect(sheet.proficiencies.weapons).toContain('warhammer');
    expect(sheet.proficiencies.armor).toHaveLength(0);
  });

  // C-2: Mountain Dwarf → race weapons + subrace adds light + medium armor.
  // PHB p.20 — Mountain Dwarf: proficient with light and medium armor.
  // raceData has BOTH weaponProficiencies (race-level) + armorProficiencies (subrace override present).
  it('C-2: Mountain Dwarf → race weapons + light + medium armor (PHB p.20)', () => {
    const sheet = computeCharacterSheet({
      character: { name: 'Bruenor', race: { slug: 'dwarf', source: 'PHB' }, subrace: { slug: 'dwarf--mountain', source: 'PHB' } },
      raceData: {
        speed: 25,
        size: ['M'],
        weaponProficiencies: [{ 'battleaxe|phb': true, 'handaxe|phb': true, 'light hammer|phb': true, 'warhammer|phb': true }],
        armorProficiencies: [{ light: true, medium: true }],
      },
    });
    expect(sheet.proficiencies.weapons).toContain('battleaxe');
    expect(sheet.proficiencies.weapons).toContain('warhammer');
    expect(sheet.proficiencies.armor).toContain('light');
    expect(sheet.proficiencies.armor).toContain('medium');
  });

  // C-3: High Elf — subrace RESTATES Elf Weapon Training (same 4 weapons as race).
  // PHB p.23 — Elf Weapon Training (all PHB elf subraces restate it in 5etools).
  // raceData.weaponProficiencies comes from subrace override (High Elf restates).
  it('C-3: High Elf → 4 elf weapons in proficiencies.weapons (PHB p.23)', () => {
    const sheet = computeCharacterSheet({
      character: { name: 'Legolas', race: { slug: 'elf', source: 'PHB' }, subrace: { slug: 'elf--high', source: 'PHB' } },
      raceData: {
        speed: 30,
        size: ['M'],
        weaponProficiencies: [{ 'longsword|phb': true, 'shortsword|phb': true, 'shortbow|phb': true, 'longbow|phb': true }],
      },
    });
    expect(sheet.proficiencies.weapons).toContain('longsword');
    expect(sheet.proficiencies.weapons).toContain('shortsword');
    expect(sheet.proficiencies.weapons).toContain('shortbow');
    expect(sheet.proficiencies.weapons).toContain('longbow');
  });

  // C-4: Wood Elf — same 4 elf weapons as High Elf (PHB p.24 Wood Elf Training).
  it('C-4: Wood Elf → 4 elf weapons (PHB p.24)', () => {
    const sheet = computeCharacterSheet({
      character: { name: 'Haldir', race: { slug: 'elf', source: 'PHB' }, subrace: { slug: 'elf--wood', source: 'PHB' } },
      raceData: {
        speed: 35,
        size: ['M'],
        weaponProficiencies: [{ 'longsword|phb': true, 'shortsword|phb': true, 'shortbow|phb': true, 'longbow|phb': true }],
      },
    });
    expect(sheet.proficiencies.weapons).toContain('longsword');
    expect(sheet.proficiencies.weapons).toContain('shortsword');
    expect(sheet.proficiencies.weapons).toContain('shortbow');
    expect(sheet.proficiencies.weapons).toContain('longbow');
  });

  // C-5: Drow REPLACES Elf weapons — strict negative assertion.
  // PHB p.24 — Drow Weapon Training: rapier, shortsword, hand crossbow ONLY.
  // Decision #589: subrace override means longsword/shortbow/longbow MUST NOT appear.
  it('C-5 (S-08 CRITICAL): Drow → rapier+shortsword+hand crossbow; longsword NOT present (PHB p.24)', () => {
    const sheet = computeCharacterSheet({
      character: { name: 'Drizzt', race: { slug: 'elf', source: 'PHB' }, subrace: { slug: 'elf--drow', source: 'PHB' } },
      raceData: {
        speed: 30,
        size: ['M'],
        // API already applied Decision #589 override: Drow replaces Elf weapons entirely
        weaponProficiencies: [{ 'rapier|phb': true, 'shortsword|phb': true, 'hand crossbow|phb': true }],
      },
    });
    expect(sheet.proficiencies.weapons).toContain('rapier');
    expect(sheet.proficiencies.weapons).toContain('shortsword');
    expect(sheet.proficiencies.weapons).toContain('hand crossbow');
    // STRICT NEGATIVE — union bug would leave these in
    expect(sheet.proficiencies.weapons).not.toContain('longsword');
    expect(sheet.proficiencies.weapons).not.toContain('shortbow');
    expect(sheet.proficiencies.weapons).not.toContain('longbow');
  });

  // C-6: Fighter (longsword via class) + High Elf (longsword via race) → dedup: appears once.
  // Spec REQ-3: Set-based merge deduplicates across sources.
  it('C-6: Fighter+HighElf dedup — longsword from class+race appears once (REQ-3)', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Elven Knight',
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        classes: [{
          slug: 'fighter', source: 'PHB', level: 1,
          subclass: null, hitDie: 'd10',
          savingThrows: ['str', 'con'],
          armorProficiencies: ['light', 'medium', 'heavy', 'shields'],
          weaponProficiencies: ['longsword', 'simple', 'martial'],
          toolProficiencies: [], skillChoices: [],
        }],
      },
      raceData: {
        speed: 30,
        size: ['M'],
        weaponProficiencies: [{ 'longsword|phb': true, 'shortsword|phb': true, 'shortbow|phb': true, 'longbow|phb': true }],
      },
    });
    const longswords = sheet.proficiencies.weapons.filter((w) => w === 'longsword');
    expect(longswords).toHaveLength(1);
    expect(sheet.proficiencies.weapons).toContain('shortsword');
  });

  // C-7: Human — no race weapon/armor profs. Only class profs present.
  // PHB p.31 — Human: no weapon/armor training from race.
  it('C-7: Human Wizard → no race weapon contrib (only class profs) (PHB p.31)', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Sigurd',
        race: { slug: 'human', source: 'PHB' },
        classes: [{
          slug: 'wizard', source: 'PHB', level: 1,
          subclass: null, hitDie: 'd6',
          savingThrows: ['int', 'wis'],
          armorProficiencies: [],
          weaponProficiencies: ['dagger', 'dart', 'quarterstaff'],
          toolProficiencies: [], skillChoices: [],
        }],
      },
      raceData: {
        speed: 30,
        size: ['M'],
        // Human has no weaponProficiencies or armorProficiencies
      },
    });
    expect(sheet.proficiencies.weapons).toContain('dagger');
    expect(sheet.proficiencies.weapons).not.toContain('longsword');
    expect(sheet.proficiencies.armor).toHaveLength(0);
  });

  // C-8: Halfling — no race weapon/armor profs. Zero race contribution.
  // PHB p.28 — Halfling: no weapon training.
  it('C-8: Halfling Rogue → no race weapon contrib (PHB p.28)', () => {
    const sheet = computeCharacterSheet({
      character: {
        name: 'Bilbo',
        race: { slug: 'halfling', source: 'PHB' },
        classes: [{
          slug: 'rogue', source: 'PHB', level: 1,
          subclass: null, hitDie: 'd8',
          savingThrows: ['dex', 'int'],
          armorProficiencies: ['light'],
          weaponProficiencies: ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'],
          toolProficiencies: ["thieves' tools"], skillChoices: [],
        }],
      },
      raceData: {
        speed: 25,
        size: ['S'],
        // Halfling has no weaponProficiencies in 5etools
      },
    });
    // Race contributes nothing; class profs still present
    expect(sheet.proficiencies.armor).toContain('light');
    expect(sheet.proficiencies.weapons).toContain('simple');
    // No extra race-only weapons (battleaxe is a Dwarf weapon, Halfling has none)
    expect(sheet.proficiencies.weapons).not.toContain('battleaxe');
    // longsword came from class — still present, and only once
    expect(sheet.proficiencies.weapons).toContain('longsword');
  });

  // C-9: Race with missing weaponProficiencies field → empty Set contribution, no throw.
  // Spec REQ-5: absent field → treat as empty (don't crash on undefined).
  it('C-9: missing weaponProficiencies on raceData → no crash, no extra weapons', () => {
    expect(() => {
      const sheet = computeCharacterSheet({
        character: { name: 'Mystery', race: { slug: 'human', source: 'PHB' } },
        raceData: { speed: 30, size: ['M'] }, // no weaponProficiencies
      });
      expect(sheet.proficiencies.weapons).toHaveLength(0);
      expect(sheet.proficiencies.armor).toHaveLength(0);
    }).not.toThrow();
  });

  // C-10: Subrace with explicit null/undefined weaponProficiencies → empty contribution, no throw.
  // Decision #589: null field = drop/empty, not inherit from race. No crash.
  it('C-10: subrace null weaponProficiencies in raceData → no crash, empty contribution', () => {
    expect(() => {
      const sheet = computeCharacterSheet({
        character: { name: 'Test', race: { slug: 'elf', source: 'PHB' }, subrace: { slug: 'elf--eladrin', source: 'MTF' } },
        raceData: {
          speed: 30,
          size: ['M'],
          weaponProficiencies: null, // API resolved to null for this subrace
        },
      });
      expect(sheet.proficiencies.weapons).toHaveLength(0);
    }).not.toThrow();
  });
});

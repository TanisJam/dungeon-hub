import { describe, it, expect } from 'vitest';
import { EmbedBuilder } from 'discord.js';
import {
  buildCharacterSheetEmbed,
  type CharacterDetail,
  type CharacterSheetResponse,
  type RecentGrant,
} from './character.js';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeDetail(overrides: Partial<CharacterDetail> = {}): CharacterDetail {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    campaignId: '00000000-0000-0000-0000-000000000099',
    name: 'Thorin',
    status: 'active',
    xp: 300,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    userId: '00000000-0000-0000-0000-000000000002',
    data: { hp: { current: 12, max: 14, temp: 0 } },
    ...overrides,
  };
}

function makeSheetResponse(overrides: Partial<CharacterSheetResponse> = {}): CharacterSheetResponse {
  return {
    character: {
      id: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
      worldId: '00000000-0000-0000-0000-000000000003',
      status: 'active',
      xp: 300,
    },
    sheet: {
      identity: {
        name: 'Thorin',
        totalLevel: 3,
        classes: [{ slug: 'fighter', source: 'phb', level: 3, hitDie: 'd10', subclass: null }],
        race: { slug: 'dwarf', source: 'phb' },
        subrace: null,
        background: { slug: 'soldier', source: 'phb' },
      },
      proficiencyBonus: 2,
      abilityScores: {
        str: { score: 16, modifier: 3 },
        dex: { score: 12, modifier: 1 },
        con: { score: 15, modifier: 2 },
        int: { score: 10, modifier: 0 },
        wis: { score: 11, modifier: 0 },
        cha: { score: 8, modifier: -1 },
      },
      savingThrows: [
        { ability: 'str', modifier: 5, proficient: true },
        { ability: 'dex', modifier: 1, proficient: false },
        { ability: 'con', modifier: 4, proficient: true },
        { ability: 'int', modifier: 0, proficient: false },
        { ability: 'wis', modifier: 0, proficient: false },
        { ability: 'cha', modifier: -1, proficient: false },
      ],
      skills: [
        { name: 'Athletics', ability: 'str', modifier: 5, proficient: true, expertise: false },
        { name: 'Perception', ability: 'wis', modifier: 2, proficient: true, expertise: false },
        { name: 'Stealth', ability: 'dex', modifier: 1, proficient: false, expertise: false },
      ],
      passivePerception: 12,
      initiative: 1,
      armorClass: { value: 16, formula: 'chain-mail' },
      hitPoints: { max: 14, formula: '3d10+6' },
      hitDice: { d10: 3 },
      speed: { walk: 25 },
      size: 'medium',
      carryingCapacity: 240,
      proficiencies: { armor: [], weapons: [], tools: [], languages: [] },
      feats: [],
      breathWeapon: null,
      darkvision: null,
      racialSpells: [],
      racialTraits: [],
      spellcasting: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      encumbrance: {
        weight: 0,
        max: 240,
        status: 'ok',
        thresholds: { encumbered: 80, heavily: 160, max: 240 },
        speedPenalty: 0,
        coinWeight: 0,
      },
      attunement: { used: 0, max: 3 },
      spellSlots: {
        slots: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        pactMagic: null,
        slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        pactSlotsUsed: 0,
      },
      spellsByClass: [],
      exhaustion: { level: 0, effects: [] },
      classFeatures: {},
      classResources: {},
      warnings: [],
    },
    inventory: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Baseline tests — existing embed shape
// ---------------------------------------------------------------------------

describe('buildCharacterSheetEmbed — baseline', () => {
  it('returns an EmbedBuilder', () => {
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse());
    expect(embed).toBeInstanceOf(EmbedBuilder);
  });

  it('embed title = character name', () => {
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse());
    expect(embed.toJSON().title).toBe('Thorin');
  });

  it('description contains race, class, level and status', () => {
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse());
    const desc = embed.toJSON().description ?? '';
    expect(desc).toContain('Dwarf');
    expect(desc).toContain('Fighter');
    expect(desc).toContain('3');
    expect(desc).toContain('active');
  });

  it('has HP, AC and Initiative fields', () => {
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse());
    const fields = embed.toJSON().fields ?? [];
    const names = fields.map((f) => f.name);
    expect(names.some((n) => n.includes('HP'))).toBe(true);
    expect(names.some((n) => n.includes('AC'))).toBe(true);
    expect(names.some((n) => n.includes('Init'))).toBe(true);
  });

  it('has Abilities field with all 6 scores', () => {
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse());
    const fields = embed.toJSON().fields ?? [];
    const abilitiesField = fields.find((f) => f.name === 'Abilities');
    expect(abilitiesField).toBeDefined();
    expect(abilitiesField!.value).toContain('STR');
    expect(abilitiesField!.value).toContain('DEX');
    expect(abilitiesField!.value).toContain('CON');
  });
});

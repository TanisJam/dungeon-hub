import { describe, it, expect } from 'vitest';
import { EmbedBuilder } from 'discord.js';
import {
  buildCharacterSheetEmbed,
  relativeTime,
  humanLabel,
  type CharacterDetail,
  type CharacterSheetResponse,
  type RecentGrant,
  type InventoryItem,
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

// ---------------------------------------------------------------------------
// C3 tests — new sections
// ---------------------------------------------------------------------------

describe('buildCharacterSheetEmbed — currency', () => {
  it('currency field rendered when at least one denom > 0', () => {
    const res = makeSheetResponse();
    res.sheet.currency = { cp: 0, sp: 50, ep: 0, gp: 100, pp: 0 };
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const currencyField = fields.find((f) => f.name.includes('Monedas'));
    expect(currencyField).toBeDefined();
    expect(currencyField!.value).toContain('100 gp');
    expect(currencyField!.value).toContain('50 sp');
  });

  it('currency field hidden when all denoms are zero', () => {
    const res = makeSheetResponse();
    res.sheet.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const currencyField = fields.find((f) => f.name.includes('Monedas'));
    expect(currencyField).toBeUndefined();
  });
});

describe('buildCharacterSheetEmbed — inventory summary', () => {
  function makeItem(instanceId: string, slug: string, state: InventoryItem['state'] = 'equipped'): InventoryItem {
    return {
      instanceId,
      itemSlug: slug,
      itemSource: 'phb',
      quantity: 1,
      state,
      attuned: false,
      customName: null,
      notes: '',
    };
  }

  it('shows equipped items in inventory summary', () => {
    const res = makeSheetResponse();
    res.inventory = [
      makeItem('i1', 'longsword', 'equipped'),
      makeItem('i2', 'shield', 'equipped'),
      makeItem('i3', 'dagger', 'carried'),
    ];
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const invField = fields.find((f) => f.name.includes('Inventario'));
    expect(invField).toBeDefined();
    expect(invField!.value).toContain('longsword');
    expect(invField!.value).toContain('shield');
    // carried item should not be in the equipped list
    expect(invField!.value).not.toContain('dagger');
  });

  it('shows overflow indicator when more than 5 equipped items', () => {
    const res = makeSheetResponse();
    res.inventory = Array.from({ length: 7 }, (_, i) =>
      makeItem(`i${i}`, `item-${i}`, 'equipped'),
    );
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const invField = fields.find((f) => f.name.includes('Inventario'));
    expect(invField).toBeDefined();
    expect(invField!.value).toContain('+2 más');
  });

  it('shows encumbrance status when over', () => {
    const res = makeSheetResponse();
    res.inventory = [makeItem('i1', 'heavy-stuff', 'equipped')];
    res.sheet.encumbrance = {
      weight: 250,
      max: 240,
      status: 'over',
      thresholds: { encumbered: 80, heavily: 160, max: 240 },
      speedPenalty: 0,
      coinWeight: 0,
    };
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const invField = fields.find((f) => f.name.includes('Inventario'));
    expect(invField).toBeDefined();
    expect(invField!.value).toContain('Overloaded');
  });
});

describe('buildCharacterSheetEmbed — spell slots', () => {
  it('spell slots present for caster (some slots > 0)', () => {
    const res = makeSheetResponse();
    res.sheet.spellSlots = {
      slots: [4, 3, 2, 0, 0, 0, 0, 0, 0],
      pactMagic: null,
      slotsUsed: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      pactSlotsUsed: 0,
    };
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const slotsField = fields.find((f) => f.name.includes('Spell Slots'));
    expect(slotsField).toBeDefined();
    expect(slotsField!.value).toContain('L1 3/4'); // 4 max - 1 used = 3 available
    expect(slotsField!.value).toContain('L2 3/3');
    expect(slotsField!.value).toContain('L3 2/2');
  });

  it('spell slots absent for non-caster (all slots zero)', () => {
    const res = makeSheetResponse();
    // default fixture already has all zeros
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const slotsField = fields.find((f) => f.name.includes('Spell Slots'));
    expect(slotsField).toBeUndefined();
  });
});

describe('buildCharacterSheetEmbed — top skills', () => {
  it('top skills capped at 6, sorted by modifier desc', () => {
    const res = makeSheetResponse();
    res.sheet.skills = [
      { name: 'Athletics', ability: 'str', modifier: 7, proficient: true, expertise: false },
      { name: 'Acrobatics', ability: 'dex', modifier: 5, proficient: true, expertise: false },
      { name: 'Stealth', ability: 'dex', modifier: 4, proficient: true, expertise: false },
      { name: 'Perception', ability: 'wis', modifier: 3, proficient: true, expertise: false },
      { name: 'Insight', ability: 'wis', modifier: 2, proficient: true, expertise: false },
      { name: 'Persuasion', ability: 'cha', modifier: 1, proficient: true, expertise: false },
      { name: 'Deception', ability: 'cha', modifier: 0, proficient: true, expertise: false },
    ];
    const embed = buildCharacterSheetEmbed(makeDetail(), res);
    const fields = embed.toJSON().fields ?? [];
    const skillsField = fields.find((f) => f.name.includes('Top Skills'));
    expect(skillsField).toBeDefined();
    // Should contain only 6 top skills (not Deception with mod 0)
    expect(skillsField!.value).toContain('Athletics');
    expect(skillsField!.value).toContain('Persuasion');
    expect(skillsField!.value).not.toContain('Deception');
    // Check order: Athletics (+7) should appear before Acrobatics (+5)
    const athlIndex = skillsField!.value.indexOf('Athletics');
    const acrIndex = skillsField!.value.indexOf('Acrobatics');
    expect(athlIndex).toBeLessThan(acrIndex);
  });
});

describe('buildCharacterSheetEmbed — recent grants', () => {
  it('recent grants field appears for non-empty recentGrants', () => {
    const grants: RecentGrant[] = [
      {
        id: 'g1',
        eventType: 'gold_grant',
        occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        payload: { amount: 50, denomination: 'gp', characterId: 'char-001' },
      },
    ];
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse(), grants);
    const fields = embed.toJSON().fields ?? [];
    const grantsField = fields.find((f) => f.name.includes('recompensas'));
    expect(grantsField).toBeDefined();
    expect(grantsField!.value).toContain('50 gp');
  });

  it('recent grants field absent when recentGrants is omitted', () => {
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse());
    const fields = embed.toJSON().fields ?? [];
    const grantsField = fields.find((f) => f.name.includes('recompensas'));
    expect(grantsField).toBeUndefined();
  });

  it('recent grants field absent when recentGrants is empty array', () => {
    const embed = buildCharacterSheetEmbed(makeDetail(), makeSheetResponse(), []);
    const fields = embed.toJSON().fields ?? [];
    const grantsField = fields.find((f) => f.name.includes('recompensas'));
    expect(grantsField).toBeUndefined();
  });
});

describe('buildCharacterSheetEmbed — embed length budget', () => {
  it('L14 caster with full data stays under 6000 chars', () => {
    const res = makeSheetResponse();
    // Level 14 wizard-type setup
    res.sheet.identity.totalLevel = 14;
    res.sheet.identity.classes = [
      { slug: 'wizard', source: 'phb', level: 14, hitDie: 'd6', subclass: { slug: 'school-of-evocation', source: 'phb' } },
    ];
    res.sheet.spellSlots = {
      slots: [4, 3, 3, 3, 2, 1, 1, 0, 0],
      pactMagic: null,
      slotsUsed: [2, 1, 0, 1, 0, 0, 0, 0, 0],
      pactSlotsUsed: 0,
    };
    res.sheet.currency = { cp: 12, sp: 45, ep: 0, gp: 1234, pp: 5 };
    res.sheet.skills = [
      { name: 'Arcana', ability: 'int', modifier: 10, proficient: true, expertise: false },
      { name: 'History', ability: 'int', modifier: 8, proficient: true, expertise: false },
      { name: 'Perception', ability: 'wis', modifier: 5, proficient: true, expertise: false },
      { name: 'Athletics', ability: 'str', modifier: 4, proficient: true, expertise: false },
      { name: 'Stealth', ability: 'dex', modifier: 3, proficient: true, expertise: false },
      { name: 'Insight', ability: 'wis', modifier: 3, proficient: true, expertise: false },
      { name: 'Persuasion', ability: 'cha', modifier: 2, proficient: true, expertise: false },
    ];
    res.inventory = Array.from({ length: 8 }, (_, i) => ({
      instanceId: `inv-${i}`,
      itemSlug: `item-slug-${i}`,
      itemSource: 'phb',
      quantity: 1,
      state: 'equipped' as const,
      attuned: false,
      customName: null,
      notes: '',
    }));
    const grants: RecentGrant[] = [
      { id: 'g1', eventType: 'gold_grant', occurredAt: new Date(Date.now() - 60000).toISOString(), payload: { amount: 100, denomination: 'gp', characterId: 'char-001' } },
      { id: 'g2', eventType: 'item_grant', occurredAt: new Date(Date.now() - 7200000).toISOString(), payload: { itemName: 'Staff of Power', characterId: 'char-001' } },
      { id: 'g3', eventType: 'xp_award', occurredAt: new Date(Date.now() - 86400000).toISOString(), payload: { amount: 500, characterId: 'char-001' } },
    ];
    const embed = buildCharacterSheetEmbed(makeDetail(), res, grants);
    const serialized = JSON.stringify(embed.toJSON());
    expect(serialized.length).toBeLessThan(6000);
  });
});

describe('relativeTime', () => {
  it('returns "ahora" for < 60s ago', () => {
    const date = new Date(Date.now() - 30 * 1000).toISOString();
    expect(relativeTime(date)).toBe('ahora');
  });

  it('returns minutes for < 1h ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(date)).toContain('5 minutos');
  });

  it('returns hours for < 24h ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(date)).toContain('3 horas');
  });

  it('returns days for >= 24h ago', () => {
    const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(date)).toContain('2 días');
  });
});

describe('humanLabel', () => {
  it('formats gold_grant', () => {
    const grant: RecentGrant = {
      id: 'g1',
      eventType: 'gold_grant',
      occurredAt: new Date().toISOString(),
      payload: { amount: 50, denomination: 'gp', characterId: 'c1' },
    };
    expect(humanLabel(grant)).toContain('50 gp');
    expect(humanLabel(grant)).toContain('DM');
  });

  it('formats item_grant with itemName', () => {
    const grant: RecentGrant = {
      id: 'g2',
      eventType: 'item_grant',
      occurredAt: new Date().toISOString(),
      payload: { itemName: 'Cloak of Elvenkind', characterId: 'c1' },
    };
    expect(humanLabel(grant)).toContain('Cloak of Elvenkind');
  });

  it('formats xp_award', () => {
    const grant: RecentGrant = {
      id: 'g3',
      eventType: 'xp_award',
      occurredAt: new Date().toISOString(),
      payload: { amount: 300, characterId: 'c1' },
    };
    expect(humanLabel(grant)).toContain('300 XP');
  });
});

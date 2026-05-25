import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Crea un High Elf Wizard 1 con Sage background usando los endpoints reales
 * del Character Builder, y verifica que la sheet calculada salga bien.
 */
describe('GET /characters/:id/sheet — ficha completa de un High Elf Wizard 1', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Sheet Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Aldric Vane' },
      })
      .then((r) => r.json());
    characterId = character.id;

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // Stats — point buy 27: 8(0)+14(7)+14(7)+15(9)+12(4)+10(2)+... = wait recompute
    //   8 (0) + 14 (7) + 14 (7) + 15 (9) + 12 (4) + 10 (2) = 29. too high.
    //   Let me use: 8 (0) + 14 (7) + 13 (5) + 15 (9) + 12 (4) + 10 (2) = 27 ✓
    await expectOk(
      'stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          method: 'point-buy',
          scores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
        },
      }),
    );

    // Race High Elf (fixed: +2 DEX from Elf, +1 INT from High Elf)
    await expectOk(
      'race',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/race`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          race: { slug: 'elf', source: 'PHB' },
          subrace: { slug: 'elf--high', source: 'PHB' },
          languageChoices: ['dwarvish'],
        },
      }),
    );

    // Class Wizard 1 with investigation + religion
    // (avoid arcana/history — Sage background grants those as fixed, would dup)
    await expectOk(
      'class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'wizard', source: 'PHB' },
          level: 1,
          skillChoices: ['investigation', 'religion'],
        },
      }),
    );

    // Background Sage with 2 languages
    await expectOk(
      'background',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/background`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          background: { slug: 'sage', source: 'PHB' },
          languageChoices: ['draconic', 'dwarvish'],
        },
      }),
    );
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('devuelve una ficha coherente para Aldric Vane (High Elf Wizard 1)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();

    // Identidad
    expect(sheet.identity.name).toBe('Aldric Vane');
    expect(sheet.identity.totalLevel).toBe(1);
    expect(sheet.identity.classes).toHaveLength(1);
    expect(sheet.identity.classes[0].slug).toBe('wizard');
    expect(sheet.identity.race).toEqual({ slug: 'elf', source: 'PHB' });

    // PB
    expect(sheet.proficiencyBonus).toBe(2);

    // Ability scores con ASIs raciales aplicadas:
    //   DEX 14 + 2 = 16, INT 15 + 1 = 16
    expect(sheet.abilityScores.dex.score).toBe(16);
    expect(sheet.abilityScores.dex.modifier).toBe(3);
    expect(sheet.abilityScores.int.score).toBe(16);
    expect(sheet.abilityScores.int.modifier).toBe(3);

    // Saves: INT y WIS proficient (Wizard)
    expect(sheet.savingThrows.find((s: { ability: string }) => s.ability === 'int').proficient).toBe(true);
    expect(sheet.savingThrows.find((s: { ability: string }) => s.ability === 'wis').proficient).toBe(true);

    // Skills proficient: investigation + religion (class) + arcana + history (background)
    // → investigation, religion, arcana, history proficient
    const arcana = sheet.skills.find((s: { name: string }) => s.name === 'arcana');
    expect(arcana.proficient).toBe(true);
    expect(arcana.modifier).toBe(3 + 2); // INT mod + PB
    const history = sheet.skills.find((s: { name: string }) => s.name === 'history');
    expect(history.proficient).toBe(true);

    // AC unarmored: 10 + DEX(3) = 13
    expect(sheet.armorClass.value).toBe(13);

    // HP: d6 max(6) + CON(1) = 7
    expect(sheet.hitPoints.max).toBe(7);

    // Initiative = DEX mod
    expect(sheet.initiative).toBe(3);

    // Passive Perception = 10 + WIS mod (no profic) = 11
    expect(sheet.passivePerception).toBe(11);

    // Speed walk = 30 (Elf)
    expect(sheet.speed.walk).toBe(30);

    // Size M
    expect(sheet.size).toBe('M');

    // Carrying capacity = STR × 15 = 8 × 15 = 120
    expect(sheet.carryingCapacity).toBe(120);

    // Spellcasting Wizard: DC = 8 + 2 + 3 = 13, attack = 2 + 3 = 5
    expect(sheet.spellcasting).toHaveLength(1);
    expect(sheet.spellcasting[0].ability).toBe('int');
    expect(sheet.spellcasting[0].saveDC).toBe(13);
    expect(sheet.spellcasting[0].attackBonus).toBe(5);

    // Hit dice: d6 × 1
    expect(sheet.hitDice.d6).toBe(1);

    // racialTraits: High Elf should have racial traits from Elf + High Elf subrace
    // (these are verified more thoroughly in the Dwarf-specific test below)
    expect(Array.isArray(sheet.racialTraits)).toBe(true);
    // Languages: race (common, elvish) + background (draconic, dwarvish)
    expect(sheet.proficiencies.languages).toEqual(
      expect.arrayContaining(['common', 'elvish', 'draconic', 'dwarvish']),
    );
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-09 — racialTraits projected from JSONB for a Dwarf character
// REQ-RT-PROJECT-01, REQ-RT-PROJECT-02, REQ-RT-PROJECT-03
// PHB p.20 — Dwarf Traits
// ---------------------------------------------------------------------------
describe('GET /characters/:id/sheet — SCEN-RT-09: racialTraits for Dwarf + Hill Dwarf', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Racial Traits Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Thordak Ironforge' },
      })
      .then((r) => r.json());
    characterId = character.id;

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // Stats — point buy 27: str:8(0)+dex:14(7)+con:13(5)+int:15(9)+wis:12(4)+cha:10(2)=27 ✓
    await expectOk(
      'stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          method: 'point-buy',
          scores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
        },
      }),
    );

    // Race: Dwarf PHB + Hill Dwarf PHB subrace
    await expectOk(
      'race',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/race`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          race: { slug: 'dwarf', source: 'PHB' },
          subrace: { slug: 'dwarf--hill', source: 'PHB' },
        },
      }),
    );

    // Class: Fighter 1 (non-caster, minimal setup)
    await expectOk(
      'class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'intimidation'],
        },
      }),
    );

    // Background: Sage PHB (fixed skills: arcana, history; 2 language choices required)
    await expectOk(
      'background',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/background`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          background: { slug: 'sage', source: 'PHB' },
          languageChoices: ['draconic', 'giant'],
        },
      }),
    );
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('SCEN-RT-09: racialTraits is a non-empty array', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();
    // PHB p.20: Dwarf has multiple mechanical traits beyond the blocklisted ones
    expect(sheet.racialTraits).toBeDefined();
    expect(Array.isArray(sheet.racialTraits)).toBe(true);
    expect(sheet.racialTraits.length).toBeGreaterThan(0);
  });

  it('SCEN-RT-09: at least one race-level trait has name "Dwarven Resilience", source "race", non-empty text', async () => {
    const app = await getTestApp();
    const { sheet } = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/sheet`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      })
      .then((r) => r.json());

    // PHB p.20: Dwarven Resilience — "You have advantage on saving throws against poison"
    const trait = sheet.racialTraits.find((t: { name: string }) => t.name === 'Dwarven Resilience');
    expect(trait).toBeDefined();
    expect(trait.source).toBe('race');
    expect(trait.text.length).toBeGreaterThan(0);
  });

  it('SCEN-RT-09: Dwarven Toughness from Hill Dwarf subrace has source "subrace"', async () => {
    const app = await getTestApp();
    const { sheet } = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/sheet`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      })
      .then((r) => r.json());

    // PHB p.20: Hill Dwarf — Dwarven Toughness (subrace trait)
    const trait = sheet.racialTraits.find((t: { name: string }) => t.name === 'Dwarven Toughness');
    expect(trait).toBeDefined();
    expect(trait.source).toBe('subrace');
  });

  it('SCEN-RT-09: blocklisted names (Age, Size, Speed, Languages, Darkvision, Alignment) absent from racialTraits', async () => {
    const app = await getTestApp();
    const { sheet } = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/sheet`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      })
      .then((r) => r.json());

    const names: string[] = sheet.racialTraits.map((t: { name: string }) => t.name);
    expect(names).not.toContain('Age');
    expect(names).not.toContain('Size');
    expect(names).not.toContain('Speed');
    expect(names).not.toContain('Languages');
    expect(names).not.toContain('Darkvision');
    expect(names).not.toContain('Alignment');
  });
});

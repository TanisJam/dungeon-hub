import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { db } from '../../src/infra/db/client.js';
import { characters } from '../../src/infra/db/schema.js';

describe('PUT /characters/:id/race', () => {
  let user: TestUser;
  let characterId: string;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Race Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: 'Race Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('aplica ASIs fijos de Elf + High Elf sin pedir appliedAsis', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'elf', source: 'PHB' });
    expect(c.data.subrace).toEqual({ slug: 'elf--high', source: 'PHB' });
    expect(c.data.raceLanguageChoices).toEqual(['dwarvish']);
    expect(c.data.asisApplied).toContainEqual({ ability: 'dex', bonus: 2, source: 'race' });
    expect(c.data.asisApplied).toContainEqual({ ability: 'int', bonus: 1, source: 'subrace' });
    expect(c.data.usedTashasCustomOrigin).toBe(false);
  });

  it('Half-Elf: requiere appliedAsis cuando hay choose en el block', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'half-elf', source: 'PHB' },
        languageChoices: ['dwarvish'],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('ASI_REQUIRED');
  });

  it('Half-Elf: acepta +2 CHA + 2 picks de +1 a stats no-CHA', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'half-elf', source: 'PHB' },
        appliedAsis: [
          { ability: 'cha', bonus: 2, source: 'race' },
          { ability: 'dex', bonus: 1, source: 'race' },
          { ability: 'con', bonus: 1, source: 'race' },
        ],
        languageChoices: ['dwarvish'],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'half-elf', source: 'PHB' });
    expect(c.data.asisApplied).toHaveLength(3);
    expect(c.data.asisApplied).toContainEqual({ ability: 'cha', bonus: 2, source: 'race' });
    expect(c.data.raceLanguageChoices).toEqual(['dwarvish']);
  });

  it("requiere appliedAsis cuando Tasha's está ON, y los redistribuye", async () => {
    const app = await getTestApp();

    // Habilitar Tasha's en la campaña (PATCH del Rules Profile)
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        rulesProfile: {
          sources: {
            PHB: true, DMG: true, XGE: true, TCE: true, MPMM: true,
            MTF: true, SCAG: true, FTD: true, VGM: true, EGW: true,
          },
          disabledEntities: {
            races: [], subraces: [], classes: [], subclasses: [],
            backgrounds: [], spells: [], items: [], feats: [],
          },
          variantRules: {
            multiclassing: true,
            feats: true,
            variantHumanAndCustomLineage: true,
            encumbranceVariant: false,
            tashasCustomOrigin: true, // ← ON
            tashasOptionalClassFeatures: false,
          },
          statGeneration: { standardArray: true, pointBuy: true, roll: true },
          hpOnLevelUp: 'player-choice',
        },
      },
    });

    // Sin appliedAsis con Tasha's ON debería pedir input
    const missing = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
      },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().issues[0].code).toBe('ASI_REQUIRED');

    // Con appliedAsis distribuyendo +2 a STR y +1 a CHA
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        appliedAsis: [
          { ability: 'str', bonus: 2, source: 'race' },
          { ability: 'cha', bonus: 1, source: 'subrace' },
        ],
        languageChoices: ['dwarvish'],
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.usedTashasCustomOrigin).toBe(true);
    expect(ok.json().data.asisApplied).toContainEqual({ ability: 'str', bonus: 2, source: 'race' });
    expect(ok.json().data.asisApplied).toContainEqual({ ability: 'cha', bonus: 1, source: 'subrace' });
  });

  it('acepta race MPMM (ability null) con +2/+1', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'aasimar', source: 'MPMM' },
        appliedAsis: [
          { ability: 'cha', bonus: 2, source: 'race' },
          { ability: 'wis', bonus: 1, source: 'race' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.race).toEqual({ slug: 'aasimar', source: 'MPMM' });
  });

  it('rechaza race cuya source está deshabilitada en la campaña', async () => {
    const app = await getTestApp();

    // Crear otra campaña con VGM OFF
    const newCamp = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          name: 'No VGM',
          rulesProfile: {
            sources: { PHB: true, VGM: false },
            disabledEntities: {
              races: [], subraces: [], classes: [], subclasses: [],
              backgrounds: [], spells: [], items: [], feats: [],
            },
            variantRules: {
              multiclassing: true,
              feats: true,
              variantHumanAndCustomLineage: true,
              encumbranceVariant: false,
              tashasCustomOrigin: false,
              tashasOptionalClassFeatures: false,
            },
            statGeneration: { standardArray: true, pointBuy: true, roll: true },
            hpOnLevelUp: 'player-choice',
          },
        },
      })
      .then((r) => r.json());

    const ch = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: newCamp.id, name: 'No VGM Char' },
      })
      .then((r) => r.json());

    // Aasimar VGM debería rechazarse
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${ch.id}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'aasimar', source: 'VGM' },
        appliedAsis: [{ ability: 'cha', bonus: 2, source: 'race' }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('RACE_DISABLED');
  });

  it('rechaza raza inexistente con RACE_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { race: { slug: 'this-race-does-not-exist', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('RACE_NOT_FOUND');
  });
});

describe('RACE_SUBRACE_REQUIRED — gate + read-path tolerance', () => {
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
        payload: { name: 'Subrace Required Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Subrace Required Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('A-1: PUT /race con Dwarf sin subrace → 400 VALIDATION_FAILED + RACE_SUBRACE_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'dwarf', source: 'PHB' },
        languageChoices: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'dwarf', source: 'PHB' },
    });
  });

  it('A-2: PUT /race con Dwarf + Hill Dwarf subrace → 200 (regression)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'dwarf', source: 'PHB' },
        subrace: { slug: 'dwarf--hill', source: 'PHB' },
        languageChoices: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'dwarf', source: 'PHB' });
    expect(c.data.subrace).toEqual({ slug: 'dwarf--hill', source: 'PHB' });
  });

  it('A-3: GET /characters/:id con legado Dwarf + null subrace → 200 (read-path tolerance)', async () => {
    const app = await getTestApp();

    // Seed legacy state directly: character with dwarf race and null subrace (pre-gate data)
    await db
      .update(characters)
      .set({
        data: {
          race: { slug: 'dwarf', source: 'PHB' },
          subrace: null,
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'dwarf', source: 'PHB' });
    expect(c.data.subrace).toBeNull();
  });
});

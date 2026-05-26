import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('POST /characters/:id/classes (multiclass)', () => {
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
        payload: { name: 'Multiclass Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId: campaign.worldId, name: 'MC Test' },
      })
      .then((r) => r.json());
    characterId = character.id;

    // Set baseStats via point-buy.
    //   14 (7) + 13 (5) + 12 (4) + 15 (9) + 10 (2) + 8 (0) = 27 ✓
    //   STR 14 + DEX 13 → cumple prereq Fighter
    //   INT 15 → cumple prereq Wizard (mantener al multiclassear)
    //   CHA 8 → NO cumple Paladin (test usa esto para forzar el rechazo)
    const statsRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'point-buy',
        scores: { str: 14, dex: 13, con: 12, int: 15, wis: 10, cha: 8 },
      },
    });
    if (statsRes.statusCode !== 200) {
      throw new Error(`Setup PUT /stats failed: ${statsRes.statusCode} ${statsRes.body}`);
    }

    // Set primary class: Wizard 1
    const classRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
    });
    if (classRes.statusCode !== 200) {
      throw new Error(`Setup PUT /class failed: ${classRes.statusCode} ${classRes.body}`);
    }
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('agrega Fighter como multiclass (DEX 14 cumple prereq)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/classes`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { class: { slug: 'fighter', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.data.classes).toHaveLength(2);
    const fighter = c.data.classes[1];
    expect(fighter.slug).toBe('fighter');
    expect(fighter.level).toBe(1);
    // Profs REDUCIDAS de multiclass
    expect(fighter.savingThrows).toEqual([]); // multiclass NO da saves
    expect(fighter.armorProficiencies).toEqual(['light', 'medium', 'shield']);
    expect(fighter.weaponProficiencies).toEqual(['simple', 'martial']);
  });

  it('rechaza agregar Paladin sin STR 13 + CHA 13', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/classes`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { class: { slug: 'paladin', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    const issue = res.json().issues.find((i: { code: string }) => i.code === 'PREREQ_NOT_MET');
    expect(issue).toBeDefined();
    // STR 14 alcanza, pero CHA 10 no llega a 13
    expect(issue.missing.some((m: { ability: string }) => m.ability === 'cha')).toBe(true);
  });

  it('rechaza agregar la misma clase ya presente (Wizard)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/classes`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { class: { slug: 'wizard', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('CLASS_ALREADY_PRESENT');
  });

  it('rechaza multiclass si el toggle está desactivado en la campaña', async () => {
    const app = await getTestApp();

    // Deshabilitar multiclass en la campaña
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
            multiclassing: false, // ← OFF
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
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/classes`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { class: { slug: 'rogue', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('MULTICLASS_DISABLED_BY_CAMPAIGN');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

const STANDARD_ARRAY_VALID = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
const POINT_BUY_27 = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }; // 9+7+5+4+2+0 = 27
const POINT_BUY_OVER = { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }; // 9+9+5+4+2+0 = 29

describe('PUT /characters/:id/stats', () => {
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
        payload: { name: 'Stats Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId: campaign.worldId, name: 'Stats Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('acepta standard array y guarda baseStats + statMethod', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { method: 'standard-array', scores: STANDARD_ARRAY_VALID },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.baseStats).toEqual(STANDARD_ARRAY_VALID);
    expect(c.data.statMethod).toBe('standard-array');
  });

  it('acepta point buy con exactamente 27 puntos', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { method: 'point-buy', scores: POINT_BUY_27 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.statMethod).toBe('point-buy');
  });

  it('rechaza point buy con total > 27 y devuelve el costo real', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { method: 'point-buy', scores: POINT_BUY_OVER },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    const issue = body.issues.find((i: { code: string }) => i.code === 'POINT_BUY_INVALID_TOTAL');
    expect(issue).toBeDefined();
    expect(issue.cost).toBe(29);
    expect(issue.budget).toBe(27);
  });

  it('rechaza standard array con un valor incorrecto', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 16, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('STANDARD_ARRAY_MISMATCH');
  });

  it('rechaza método deshabilitado por el Rules Profile de la campaña', async () => {
    const app = await getTestApp();

    // Deshabilitamos point-buy en la campaña
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        rulesProfile: {
          sources: { PHB: true },
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
          statGeneration: { standardArray: true, pointBuy: false, roll: true },
          hpOnLevelUp: 'player-choice',
        },
      },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { method: 'point-buy', scores: POINT_BUY_27 },
    });

    expect(res.statusCode).toBe(400);
    const issue = res.json().issues[0];
    expect(issue.code).toBe('STAT_METHOD_NOT_ALLOWED');
    expect(issue.method).toBe('point-buy');
    expect(issue.allowed).toEqual(['standard-array', 'roll']);
  });
});

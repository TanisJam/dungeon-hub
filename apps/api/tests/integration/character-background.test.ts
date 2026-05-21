import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('PUT /characters/:id/background', () => {
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
        payload: { name: 'Background Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'BG Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('aplica Sage con 2 idiomas standard elegidos', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: { slug: 'sage', source: 'PHB' },
        languageChoices: ['draconic', 'elvish'],
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.slug).toBe('sage');
    expect(bg.skills).toEqual(['arcana', 'history']);
    expect(bg.languages).toEqual(['draconic', 'elvish']);
  });

  it('rechaza Sage sin idiomas elegidos (faltan 2)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { background: { slug: 'sage', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('BACKGROUND_LANGUAGE_COUNT_MISMATCH');
  });

  it('aplica Criminal con un gaming set elegido', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: { slug: 'criminal', source: 'PHB' },
        toolChoices: { anyGamingSet: ['dice set'] },
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.tools).toContain("thieves' tools");
    expect(bg.tools).toContain('dice set');
  });

  it('rechaza background inexistente', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { background: { slug: 'fake-bg', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('BACKGROUND_NOT_FOUND');
  });
});

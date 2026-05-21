import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('PUT /characters/:id/class', () => {
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
        payload: { name: 'Class Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Class Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('acepta Wizard nivel 1 con 2 skills válidos, sin subclass', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.classes).toHaveLength(1);
    const cls = c.data.classes[0];
    expect(cls.slug).toBe('wizard');
    expect(cls.level).toBe(1);
    expect(cls.subclass).toBeNull();
    expect(cls.hitDie).toBe('d6');
    expect(cls.savingThrows).toEqual(['int', 'wis']);
    expect(cls.skillChoices).toEqual(['arcana', 'investigation']);
  });

  it('rechaza Wizard nivel 1 con subclass (todavía no desbloqueada, unlock=2)', async () => {
    const app = await getTestApp();

    // Necesitamos un slug real de subclass de Wizard.
    const campaignId = (
      await app
        .inject({
          method: 'GET',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
        })
        .then((r) => r.json())
    ).data[0].id;

    const wizSubs = await app
      .inject({
        method: 'GET',
        url: `/api/v1/compendium/subclasses?class=wizard&campaign=${campaignId}`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      })
      .then((r) => r.json());

    expect(wizSubs.data.length).toBeGreaterThan(0);
    const realSubclass = wizSubs.data[0];

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        subclass: { slug: realSubclass.slug, source: realSubclass.source },
        skillChoices: ['arcana', 'investigation'],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('SUBCLASS_NOT_YET_AVAILABLE');
  });

  it('exige subclass para Cleric nivel 1 (unlock = 1)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'cleric', source: 'PHB' },
        level: 1,
        skillChoices: ['insight', 'medicine'],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('SUBCLASS_REQUIRED');
  });

  it('acepta Cleric nivel 1 con un Divine Domain válido', async () => {
    const app = await getTestApp();

    // Primero busco un subclass slug real en el compendio
    const subclassRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/subclasses?class=cleric&campaign=${(
        await app
          .inject({
            method: 'GET',
            url: '/api/v1/campaigns',
            headers: { authorization: `Bearer ${user.accessToken}` },
          })
          .then((r) => r.json())
      ).data[0].id}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    const subclasses = subclassRes.json().data;
    expect(subclasses.length).toBeGreaterThan(0);
    const lifeOrFirst =
      subclasses.find((s: { slug: string }) => s.slug.includes('life')) ?? subclasses[0];

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'cleric', source: 'PHB' },
        level: 1,
        subclass: { slug: lifeOrFirst.slug, source: lifeOrFirst.source },
        skillChoices: ['insight', 'medicine'],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.classes[0].subclass).toEqual({
      slug: lifeOrFirst.slug,
      source: lifeOrFirst.source,
    });
  });

  it('rechaza skill no permitido por la clase', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'athletics'], // Wizard no tiene athletics
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues.some((i: { code: string }) => i.code === 'SKILL_NOT_IN_CLASS_LIST')).toBe(
      true,
    );
  });

  it('rechaza clase inexistente con CLASS_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { class: { slug: 'fake-class', source: 'PHB' }, level: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('CLASS_NOT_FOUND');
  });
});

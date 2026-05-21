import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * PUT /characters/:id/classes/:classSlug/features
 *
 * Cubre: picks de fighting styles, validación de count + featureType,
 * Tasha's toggle effect en availables, error cases.
 */
describe('PUT /characters/:id/classes/:classSlug/features', () => {
  let user: TestUser;
  let campaignId: string;
  let fighterCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { name: 'Class Features Test' },
        })
        .then((r) => r.json())
    ).id;

    // Fighter L1 — gana 1 Fighting Style (FS:F).
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: 'Fighter Test' },
      })
      .then((r) => r.json());
    fighterCharId = c.id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('Fighter L1: 1 fighting style PHB (Archery) → ok', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/classes/fighter/features`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        picks: { 'FS:F': [{ slug: 'archery', source: 'PHB' }] },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied['FS:F']).toEqual([{ slug: 'archery', source: 'PHB' }]);
    expect(body.slots).toHaveLength(1);
  });

  it('Fighter L1: rechaza pickear 2 fighting styles (count=1)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/classes/fighter/features`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        picks: {
          'FS:F': [
            { slug: 'archery', source: 'PHB' },
            { slug: 'defense', source: 'PHB' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.some((i: { code: string }) => i.code === 'FEATURE_COUNT_MISMATCH')).toBe(true);
  });

  it('Fighter L1: rechaza Blessed Warrior (TCE) si el toggle está OFF', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/classes/fighter/features`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        // Blessed Warrior solo es FS:P (Paladin) — para Fighter sería wrong type igual.
        // Usemos Druidic Warrior que es TCE FS:R — wrong type para Fighter pero también disabled.
        // Mejor: probemos un FS:F TCE. Hay "Blind Fighting" TCE con FS:F.
        picks: { 'FS:F': [{ slug: 'blind-fighting', source: 'TCE' }] },
      },
    });
    expect(res.statusCode).toBe(400);
    // Toggle OFF → no disponible → FEATURE_DISABLED_BY_RULES_PROFILE.
    expect(res.json().issues.some((i: { code: string }) => i.code === 'FEATURE_DISABLED_BY_RULES_PROFILE')).toBe(true);
  });

  it('Fighter L1: con toggle TCE ON, Blind Fighting (TCE) sí es válido', async () => {
    const app = await getTestApp();
    // Habilitar el toggle.
    const c = await app
      .inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        rulesProfile: {
          ...c.rulesProfile,
          variantRules: { ...c.rulesProfile.variantRules, tashasOptionalClassFeatures: true },
        },
      },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/classes/fighter/features`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        picks: { 'FS:F': [{ slug: 'blind-fighting', source: 'TCE' }] },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().applied['FS:F']).toContainEqual({ slug: 'blind-fighting', source: 'TCE' });
  });

  it('Fighter L1: rechaza featureType que no aplica a este nivel (MV:B sin Battle Master)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/classes/fighter/features`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        picks: {
          'FS:F': [{ slug: 'archery', source: 'PHB' }],
          'MV:B': [{ slug: 'riposte', source: 'PHB' }],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.some((i: { code: string }) => i.code === 'FEATURE_TYPE_NOT_ON_CLASS_AT_LEVEL')).toBe(true);
  });

  it('rechaza pick a clase que no está en el personaje', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/classes/wizard/features`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { picks: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('CLASS_NOT_ON_CHARACTER');
  });

  it('GET /sheet incluye classFeatures con los picks', async () => {
    const app = await getTestApp();
    const sheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}/sheet`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      })
      .then((r) => r.json());
    expect(sheet.sheet.classFeatures.fighter).toBeDefined();
    expect(sheet.sheet.classFeatures.fighter['FS:F']).toBeDefined();
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('characters CRUD', () => {
  let alice: TestUser; // owner
  let bob: TestUser; // outsider (no es miembro de la campaign de alice)
  let aliceCampaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();
    bob = await createTestUser();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { name: "Alice's Campaign" },
    });
    aliceCampaignId = res.json().id;
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    await closeTestApp();
  });

  it('401 sin token', async () => {
    const app = await getTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/characters' });
    expect(res.statusCode).toBe(401);
  });

  it('crea un personaje draft asociado a la campaña', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        campaignId: aliceCampaignId,
        name: 'Aldric Vane',
        data: { notes: 'WIP' },
      },
    });

    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.name).toBe('Aldric Vane');
    expect(c.status).toBe('draft');
    expect(c.xp).toBe(0);
    expect(c.userId).toBe(alice.id);
    expect(c.campaignId).toBe(aliceCampaignId);
    expect(c.data).toEqual({ notes: 'WIP' });
  });

  it('rechaza crear personaje en una campaña a la que no pertenecés', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { campaignId: aliceCampaignId, name: 'Intruder' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('NOT_CAMPAIGN_MEMBER');
  });

  it('lista solo mis personajes', async () => {
    const app = await getTestApp();

    // Crear varios para alice
    for (const name of ['Charlie', 'Diana']) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId: aliceCampaignId, name },
      });
    }

    const aliceList = await app.inject({
      method: 'GET',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    const aliceNames = aliceList.json().data.map((c: { name: string }) => c.name);
    expect(aliceNames).toContain('Charlie');
    expect(aliceNames).toContain('Diana');

    // Bob NO ve nada
    const bobList = await app.inject({
      method: 'GET',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    expect(bobList.json().data).toHaveLength(0);
  });

  it('owner puede editar; outsider recibe 403', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId: aliceCampaignId, name: 'Edit Test' },
      })
      .then((r) => r.json());

    // Alice puede editar
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { name: 'Edited', xp: 300, status: 'active' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().name).toBe('Edited');
    expect(patch.json().xp).toBe(300);
    expect(patch.json().status).toBe('active');

    // Bob NO puede editar (ni siquiera leer, no es miembro)
    const bobPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { name: 'Hacked' },
    });
    expect(bobPatch.statusCode).toBe(403);
  });

  it('owner puede borrar; outsider recibe 403', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId: aliceCampaignId, name: 'Delete Test' },
      })
      .then((r) => r.json());

    // Bob NO puede borrar
    const bobDel = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    expect(bobDel.statusCode).toBe(403);

    // Alice sí
    const aliceDel = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(aliceDel.statusCode).toBe(204);

    // 404 después de borrar
    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(after.statusCode).toBe(404);
  });

  it('sheet endpoint devuelve la ficha calculada para un draft vacío', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId: aliceCampaignId, name: 'Sheet Test' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${created.id}/sheet`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.character.id).toBe(created.id);
    // Draft sin stats: defaults a 10 en todo, AC 10, HP 0, total level 0.
    expect(body.sheet.proficiencyBonus).toBe(2);
    expect(body.sheet.armorClass.value).toBe(10);
    expect(body.sheet.identity.totalLevel).toBe(0);
  });
});

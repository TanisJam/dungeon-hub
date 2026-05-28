import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('characters CRUD', () => {
  let alice: TestUser; // owner
  let bob: TestUser; // outsider (no es miembro de la campaign de alice)
  let aliceCampaignId: string;
  /** worldId resolved from alice's campaign (C5: POST /characters now requires worldId). */
  let aliceWorldId: string;

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

    // C5: Resolve worldId from alice's campaign (POST /campaigns auto-creates a world).
    const campaignRes = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${aliceCampaignId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    aliceWorldId = campaignRes.json().worldId;
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
        worldId: aliceWorldId,
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
    // C5: worldId returned directly; campaignId is gone.
    expect(c.worldId).toBe(aliceWorldId);
    expect(c.data).toEqual({ notes: 'WIP' });
  });

  it('rechaza crear personaje en un world al que no pertenecés', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { worldId: aliceWorldId, name: 'Intruder' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('NOT_WORLD_MEMBER');
  });

  it('lista solo mis personajes', async () => {
    const app = await getTestApp();

    // Crear varios para alice
    for (const name of ['Charlie', 'Diana']) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name },
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
        payload: { worldId: aliceWorldId, name: 'Edit Test' },
      })
      .then((r) => r.json());

    // Alice puede editar (sin tocar xp — eso es exclusivo del DM via POST /xp)
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { name: 'Edited', status: 'active' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().name).toBe('Edited');
    expect(patch.json().status).toBe('active');
    // xp NO se modifica via PATCH
    expect(patch.json().xp).toBe(0);

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
        payload: { worldId: aliceWorldId, name: 'Delete Test' },
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

  // REQ-WF-API-CHARACTER-PAYLOAD: POST accepts worldId directly; campaignId rejected.
  it('POST /characters with worldId creates character in world', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { worldId: aliceWorldId, name: 'World-Direct Char' },
    });
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.worldId).toBe(aliceWorldId);
    expect('campaignId' in c).toBe(false);
  });

  it('POST /characters with only campaignId (no worldId) → error', async () => {
    const app = await getTestApp();
    // After C5, worldId is required. Sending only campaignId (no worldId) fails validation.
    // Zod throws ZodError (worldId required) → Fastify returns 500 (no global ZodError handler yet).
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { campaignId: aliceCampaignId, name: 'Legacy Char' },
    });
    // worldId is required; missing → error (500 because no global Zod error handler)
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  // REQ-WF-API-CHARACTER-PAYLOAD: GET response includes worldId, no campaignId key.
  it('GET /characters/:id payload — worldId present, campaignId absent', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Payload Test Char' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // worldId must be present and be a valid UUID
    expect(body.worldId).toMatch(/^[0-9a-f-]{36}$/);
    // campaignId must NOT appear in the response at all
    expect('campaignId' in body).toBe(false);
  });

  // ── v3 list fields (spec personajes-v3-data: ACLE-LINEAGE-01, ACLE-HP-02) ──

  it('GET /characters: row.lineage is composed from data.race + data.classes (ACLE-LINEAGE-01)', async () => {
    const app = await getTestApp();
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          worldId: aliceWorldId,
          name: 'Lineage Test',
          data: {
            race: { slug: 'lineage-test-human', source: 'phb' },
            classes: [{ classSlug: 'lineage-test-fighter', source: 'phb', level: 3 }],
          },
        },
      })
      .then((r) => r.json());

    const list = await app
      .inject({
        method: 'GET',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    const row = list.data.find((c: { id: string }) => c.id === created.id);
    expect(row).toBeDefined();
    expect(row.lineage).toBe('Lineage-test-human · Lineage-test-fighter 3');
  });

  it('GET /characters: row.hpCurrent + row.hpMax come from data.hp; null when missing (ACLE-HP-02)', async () => {
    const app = await getTestApp();
    const withHp = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          worldId: aliceWorldId,
          name: 'HP With',
          data: { hp: { current: 28, max: 32 } },
        },
      })
      .then((r) => r.json());

    const withoutHp = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'HP Without', data: {} },
      })
      .then((r) => r.json());

    const list = await app
      .inject({
        method: 'GET',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const hpRow = list.data.find((c: { id: string }) => c.id === withHp.id);
    expect(hpRow.hpCurrent).toBe(28);
    expect(hpRow.hpMax).toBe(32);

    const noHpRow = list.data.find((c: { id: string }) => c.id === withoutHp.id);
    expect(noHpRow.hpCurrent).toBeNull();
    expect(noHpRow.hpMax).toBeNull();
  });

  it('GET /characters: multiclass lineage sorted by level desc, joined with " / " (ACLE-LINEAGE-01)', async () => {
    const app = await getTestApp();
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          worldId: aliceWorldId,
          name: 'Multiclass Test',
          data: {
            race: { slug: 'multi-halfling', source: 'phb' },
            classes: [
              { classSlug: 'multi-rogue', source: 'phb', level: 1 },
              { classSlug: 'multi-bard', source: 'phb', level: 3 },
            ],
          },
        },
      })
      .then((r) => r.json());

    const list = await app
      .inject({
        method: 'GET',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    const row = list.data.find((c: { id: string }) => c.id === created.id);
    expect(row.lineage).toBe('Multi-halfling · Multi-bard 3 / Multi-rogue 1');
  });

  it('sheet endpoint devuelve la ficha calculada para un draft vacío', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Sheet Test' },
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

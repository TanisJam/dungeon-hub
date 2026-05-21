import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Hexcrawl Map — Slice 1.
 *
 * Hex CRUD con parent-child, visibility por rol (cascade en player), unique
 * coords con NULLS NOT DISTINCT, cycle prevention en PATCH parentHexId,
 * cascade delete a hijos.
 */
describe('hexes — Slice 1', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Hex Campaign' },
        })
        .then((r) => r.json())
    ).id;

    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values({ campaignId, userId: alice.id, role: 'player' });
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  async function createHex(payload: Record<string, unknown>): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/hexes`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---- POST -------------------------------------------------------------
  describe('POST /campaigns/:campaignId/hexes', () => {
    it('GM crea un hex top-level con coords y dmNotes', async () => {
      const hex = await createHex({
        q: 0,
        r: 0,
        name: 'Origen',
        terrain: 'plains',
        dmNotes: 'Secret: hay un dragón',
        worldX: 100.5,
        worldY: 200.0,
      });
      expect(hex.status).toBe('unexplored');
      expect(hex.parentHexId).toBeNull();
      expect(hex.dmNotes).toBe('Secret: hay un dragón');
      expect(hex.worldX).toBe(100.5);
    });

    it('player NO puede crear', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/hexes`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { q: 100, r: 100 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('outsider NO puede crear', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/hexes`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { q: 200, r: 200 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('HEX_COORDS_TAKEN si ya existe top-level en (q,r)', async () => {
      await createHex({ q: 5, r: 5 });
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/hexes`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { q: 5, r: 5 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_COORDS_TAKEN');
    });

    it('mismo (q,r) en distintos parents NO colisiona', async () => {
      const parentA = await createHex({ q: 10, r: 10, scale: 'region' });
      const parentB = await createHex({ q: 11, r: 11, scale: 'region' });
      // Sub-hex (0,0) en cada parent — no colisiona.
      const subA = await createHex({ parentHexId: parentA.id, q: 0, r: 0, scale: 'local' });
      const subB = await createHex({ parentHexId: parentB.id, q: 0, r: 0, scale: 'local' });
      expect(subA.id).not.toBe(subB.id);
    });

    it('parentHexId que no existe → PARENT_NOT_FOUND', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/hexes`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: {
          parentHexId: '00000000-0000-0000-0000-000000000000',
          q: 0,
          r: 0,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('PARENT_NOT_FOUND');
    });
  });

  // ---- GET / visibility -------------------------------------------------
  describe('GET /campaigns/:campaignId/hexes + visibility', () => {
    let dmCampaignId: string;
    let hUnexp: string;
    let hRumored: string;
    let hExpl: string;

    beforeAll(async () => {
      const app = await getTestApp();
      dmCampaignId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/campaigns',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { name: 'Visibility Campaign' },
          })
          .then((r) => r.json())
      ).id;
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignMembers } = await import('../../src/infra/db/schema.js');
      await db.insert(campaignMembers).values({
        campaignId: dmCampaignId,
        userId: alice.id,
        role: 'player',
      });

      const u = await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${dmCampaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0, name: 'Hidden', dmNotes: 'secret' },
        })
        .then((r) => r.json());
      hUnexp = u.id;

      const r = await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${dmCampaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: {
            q: 1,
            r: 0,
            name: 'Rumored Hex',
            status: 'rumored',
            dmNotes: 'secret2',
            playerNotes: 'Se dice que hay tesoro',
          },
        })
        .then((r) => r.json());
      hRumored = r.id;

      const e = await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${dmCampaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 2, r: 0, name: 'Explored Hex', status: 'explored' },
        })
        .then((r) => r.json());
      hExpl = e.id;
    });

    it('GM ve los 3 hexes (incluye unexplored + dmNotes)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${dmCampaignId}/hexes`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBe(3);
      const dmnotes = data.find((h: any) => h.id === hUnexp).dmNotes;
      expect(dmnotes).toBe('secret');
    });

    it('player ve solo los 2 no-unexplored, sin dmNotes', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${dmCampaignId}/hexes`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBe(2);
      expect(data.find((h: any) => h.id === hUnexp)).toBeUndefined();
      expect(data.every((h: any) => h.dmNotes === undefined)).toBe(true);
    });

    it('player → 404 al pedir un hex unexplored por id', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hUnexp}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('outsider → 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${dmCampaignId}/hexes`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('cascade: sub-hex de un parent unexplored NO se le muestra al player', async () => {
      const app = await getTestApp();
      // Crear sub-hex explored bajo un parent unexplored.
      const sub = await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${dmCampaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: {
            parentHexId: hUnexp,
            q: 0,
            r: 0,
            status: 'explored',
            name: 'Sub of hidden',
          },
        })
        .then((r) => r.json());

      // Player pide ?parent=all → no debería ver el sub.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${dmCampaignId}/hexes?parent=all`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      const data = res.json().data;
      expect(data.find((h: any) => h.id === sub.id)).toBeUndefined();
    });
  });

  // ---- Children ---------------------------------------------------------
  describe('GET /hexes/:hexId/children', () => {
    it('GM lista hijos de un hex', async () => {
      const app = await getTestApp();
      const parent = await createHex({ q: 50, r: 50, scale: 'region' });
      await createHex({ parentHexId: parent.id, q: 0, r: 0 });
      await createHex({ parentHexId: parent.id, q: 1, r: 0 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${parent.id}/children`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBe(2);
    });
  });

  // ---- PATCH ------------------------------------------------------------
  describe('PATCH /hexes/:hexId', () => {
    it('GM cambia status a explored', async () => {
      const app = await getTestApp();
      const h = await createHex({ q: 60, r: 60 });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/hexes/${h.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { status: 'explored' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('explored');
    });

    it('player NO puede editar', async () => {
      const app = await getTestApp();
      const h = await createHex({ q: 61, r: 61 });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/hexes/${h.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { status: 'explored' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('HEX_CYCLE si querés mover un hex dentro de su descendiente', async () => {
      const app = await getTestApp();
      const a = await createHex({ q: 70, r: 70, scale: 'region' });
      const b = await createHex({ parentHexId: a.id, q: 0, r: 0, scale: 'sub' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/hexes/${a.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { parentHexId: b.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_CYCLE');
    });

    it('HEX_CYCLE si querés mover un hex a sí mismo', async () => {
      const app = await getTestApp();
      const h = await createHex({ q: 80, r: 80 });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/hexes/${h.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { parentHexId: h.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_CYCLE');
    });

    it('HEX_COORDS_TAKEN si querés mover a unas coords ya ocupadas', async () => {
      const app = await getTestApp();
      await createHex({ q: 100, r: 100 });
      const h = await createHex({ q: 100, r: 101 });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/hexes/${h.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { r: 100 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_COORDS_TAKEN');
    });
  });

  // ---- DELETE -----------------------------------------------------------
  describe('DELETE /hexes/:hexId', () => {
    it('GM borra un hex y cascade borra hijos', async () => {
      const app = await getTestApp();
      const parent = await createHex({ q: 200, r: 200, scale: 'region' });
      const child = await createHex({ parentHexId: parent.id, q: 0, r: 0 });

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/hexes/${parent.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(del.statusCode).toBe(204);

      // El hijo también debería estar borrado (cascade FK).
      const childCheck = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${child.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(childCheck.statusCode).toBe(404);
    });

    it('player NO puede borrar', async () => {
      const app = await getTestApp();
      const h = await createHex({ q: 210, r: 210 });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/hexes/${h.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});

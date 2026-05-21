import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Hexcrawl Map — Slice 2 (POIs).
 *
 * POI CRUD bajo hex con visibility cascade (hex parent + POI status).
 */
describe('pois — Slice 2', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let hexExploredId: string;
  let hexUnexploredId: string;

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
          payload: { name: 'POI Campaign' },
        })
        .then((r) => r.json())
    ).id;

    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values({ campaignId, userId: alice.id, role: 'player' });

    hexExploredId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${campaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0, status: 'explored', name: 'Visible hex' },
        })
        .then((r) => r.json())
    ).id;

    hexUnexploredId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${campaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 1, r: 0, name: 'Hidden hex' },
        })
        .then((r) => r.json())
    ).id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  async function createPoi(hexId: string, payload: Record<string, unknown>): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/hexes/${hexId}/pois`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---- POST -------------------------------------------------------------
  describe('POST /hexes/:hexId/pois', () => {
    it('GM crea POI con name + description + dmNotes', async () => {
      const poi = await createPoi(hexExploredId, {
        name: 'Ruinas de Kelthara',
        description: 'Una antigua fortaleza',
        dmNotes: 'Hay un lich abajo',
      });
      expect(poi.status).toBe('unknown');
      expect(poi.name).toBe('Ruinas de Kelthara');
      expect(poi.dmNotes).toBe('Hay un lich abajo');
    });

    it('player NO puede crear', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Player attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('outsider NO puede crear', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { name: 'Outsider attempt' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- GET / visibility -------------------------------------------------
  describe('GET /hexes/:hexId/pois visibility', () => {
    let pUnknown: string;
    let pDiscovered: string;

    beforeAll(async () => {
      const u = await createPoi(hexExploredId, {
        name: 'Hidden lair',
        status: 'unknown',
        dmNotes: 'secret stash',
      });
      pUnknown = u.id;

      const d = await createPoi(hexExploredId, {
        name: 'Town square',
        status: 'discovered',
        description: 'Plaza central del pueblo',
        dmNotes: 'NPC clave acá',
      });
      pDiscovered = d.id;
    });

    it('GM ve todos los POIs (incluye unknown + dmNotes)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      const data = res.json().data;
      expect(data.find((p: any) => p.id === pUnknown)).toBeDefined();
      expect(data.find((p: any) => p.id === pDiscovered).dmNotes).toBe('NPC clave acá');
    });

    it('player NO ve POIs unknown, ni dmNotes en los visibles', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      const data = res.json().data;
      expect(data.find((p: any) => p.id === pUnknown)).toBeUndefined();
      const visiblePoi = data.find((p: any) => p.id === pDiscovered);
      expect(visiblePoi).toBeDefined();
      expect(visiblePoi.dmNotes).toBeUndefined();
    });

    it('GET POI individual unknown → 404 para player', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${pUnknown}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET POI individual unknown → OK para GM, con dmNotes', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${pUnknown}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().dmNotes).toBe('secret stash');
    });

    it('cascade: POI discovered en hex unexplored → invisible al player', async () => {
      const poi = await createPoi(hexUnexploredId, {
        name: 'In hidden hex',
        status: 'discovered',
      });
      const app = await getTestApp();

      // GET list del hex → 404 (el hex es invisible).
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexUnexploredId}/pois`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(list.statusCode).toBe(404);

      // GET POI individual → 404 (cascade del hex).
      const det = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(det.statusCode).toBe(404);
    });

    it('outsider → 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- PATCH ------------------------------------------------------------
  describe('PATCH /pois/:poiId', () => {
    it('GM cambia status unknown → discovered', async () => {
      const app = await getTestApp();
      const poi = await createPoi(hexExploredId, { name: 'Statue', status: 'unknown' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { status: 'discovered', description: 'Una estatua antigua' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('discovered');
    });

    it('player NO puede editar', async () => {
      const app = await getTestApp();
      const poi = await createPoi(hexExploredId, { name: 'Pillar' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { status: 'cleared' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- DELETE -----------------------------------------------------------
  describe('DELETE /pois/:poiId', () => {
    it('GM borra POI', async () => {
      const app = await getTestApp();
      const poi = await createPoi(hexExploredId, { name: 'Doomed' });
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(del.statusCode).toBe(204);
      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(after.statusCode).toBe(404);
    });

    it('cascade desde hex: borrar el hex borra sus POIs', async () => {
      const app = await getTestApp();
      const tempHex = (
        await app
          .inject({
            method: 'POST',
            url: `/api/v1/campaigns/${campaignId}/hexes`,
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { q: 99, r: 99 },
          })
          .then((r) => r.json())
      ).id;
      const poi = await createPoi(tempHex, { name: 'Will Vanish' });

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/hexes/${tempHex}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(after.statusCode).toBe(404);
    });
  });
});

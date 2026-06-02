import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * Hexcrawl Map — POIs (world-first-model Slice 1).
 *
 * POI CRUD under hex with visibility cascade (hex parent + POI status).
 * POI world-scope is derived via pois.hex_id → hexes.id → hexes.world_id.
 * No direct world_id column on pois table (REQ-MAP-02).
 *
 * REQ-MAP-02, REQ-MAP-04, REQ-CROSS-02
 */
describe('pois — world-scoped (world-first-model Slice 1)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let hexExploredId: string;
  let hexUnexploredId: string;

  beforeAll(async () => {
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    const result = await createWorldWithGm(dm.id);
    worldId = result.worldId;
    await addWorldMember(worldId, alice.id, 'player');

    const app = await getTestApp();

    hexExploredId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0, status: 'explored', name: 'Visible hex' },
        })
        .then((r) => r.json())
    ).id;

    hexUnexploredId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId}/hexes`,
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

  // ---- POST /hexes/:hexId/pois -------------------------------------------
  describe('POST /hexes/:hexId/pois', () => {
    it('GM creates POI with name + description + dmNotes', async () => {
      const poi = await createPoi(hexExploredId, {
        name: 'Ruins of Kelthara',
        description: 'An ancient fortress',
        dmNotes: 'There is a lich below',
      });
      expect(poi.status).toBe('unknown');
      expect(poi.name).toBe('Ruins of Kelthara');
      expect(poi.dmNotes).toBe('There is a lich below');
      // REQ-MAP-02: no direct world_id column on POI
      expect(poi.worldId).toBeUndefined();
    });

    it('player cannot create', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Player attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('outsider cannot create', async () => {
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

  // ---- GET / visibility --------------------------------------------------
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
        description: 'Central plaza',
        dmNotes: 'Key NPC here',
      });
      pDiscovered = d.id;
    });

    it('GM sees all POIs (including unknown + dmNotes)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      const data = res.json().data;
      expect(data.find((p: any) => p.id === pUnknown)).toBeDefined();
      expect(data.find((p: any) => p.id === pDiscovered).dmNotes).toBe('Key NPC here');
    });

    it('player does not see unknown POIs, nor dmNotes on visible ones', async () => {
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

    it('GET individual unknown POI → 404 for player', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${pUnknown}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET individual unknown POI → 200 for GM with dmNotes', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${pUnknown}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().dmNotes).toBe('secret stash');
    });

    it('cascade: discovered POI in unexplored hex is invisible to player', async () => {
      const poi = await createPoi(hexUnexploredId, {
        name: 'In hidden hex',
        status: 'discovered',
      });
      const app = await getTestApp();

      // GET list of hex POIs → 404 (hex is invisible).
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexUnexploredId}/pois`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(list.statusCode).toBe(404);

      // GET individual POI → 404 (cascade from hex).
      const det = await app.inject({
        method: 'GET',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(det.statusCode).toBe(404);
    });

    it('REQ-MAP-04: non-member → 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexExploredId}/pois`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- REQ-MAP-02: POI world resolution via hex cascade -------------------
  describe('REQ-MAP-02: POI world resolution via hex cascade', () => {
    it('POI inherits world scope via hex_id → hex.world_id (no direct worldId column)', async () => {
      const poi = await createPoi(hexExploredId, { name: 'Cascade test POI', status: 'discovered' });
      // The POI should be visible from the world-scoped hex, not via a worldId on the POI.
      expect(poi.worldId).toBeUndefined();
      expect(poi.hexId).toBe(hexExploredId);

      // Confirm the hex itself carries worldId.
      const app = await getTestApp();
      const hexRes = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hexExploredId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(hexRes.json().worldId).toBe(worldId);
    });
  });

  // ---- PATCH /pois/:poiId ------------------------------------------------
  describe('PATCH /pois/:poiId', () => {
    it('GM changes status unknown → discovered', async () => {
      const app = await getTestApp();
      const poi = await createPoi(hexExploredId, { name: 'Statue', status: 'unknown' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/pois/${poi.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { status: 'discovered', description: 'An ancient statue' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('discovered');
    });

    it('player cannot edit', async () => {
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

  // ---- DELETE /pois/:poiId -----------------------------------------------
  describe('DELETE /pois/:poiId', () => {
    it('GM deletes POI', async () => {
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

    it('cascade from hex: deleting the hex deletes its POIs', async () => {
      const app = await getTestApp();
      const tempHex = (
        await app
          .inject({
            method: 'POST',
            url: `/api/v1/worlds/${worldId}/hexes`,
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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * Hexcrawl Map — Slice 1 (world-first-model).
 *
 * Hex CRUD with world-scoped URLs. Auth via worldMembers (getWorldAccess).
 * Routes: POST/GET /worlds/:worldId/hexes, GET/PATCH/DELETE /hexes/:hexId.
 *
 * REQ-MAP-01, REQ-MAP-03, REQ-MAP-04, REQ-CROSS-02
 */
describe('hexes — world-scoped (world-first-model Slice 1)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    const result = await createWorldWithGm(dm.id);
    worldId = result.worldId;

    await addWorldMember(worldId, alice.id, 'player');
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
      url: `/api/v1/worlds/${worldId}/hexes`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---- POST /worlds/:worldId/hexes ----------------------------------------
  describe('POST /worlds/:worldId/hexes', () => {
    it('GM creates a top-level hex with coords and dmNotes', async () => {
      const hex = await createHex({
        q: 0,
        r: 0,
        name: 'Origin',
        terrain: 'plains',
        dmNotes: 'Secret: there is a dragon here',
        worldX: 100.5,
        worldY: 200.0,
      });
      expect(hex.status).toBe('unexplored');
      expect(hex.parentHexId).toBeNull();
      expect(hex.dmNotes).toBe('Secret: there is a dragon here');
      expect(hex.worldX).toBe(100.5);
      // REQ-MAP-01: hex carries worldId, no campaignId
      expect(hex.worldId).toBe(worldId);
      expect(hex.campaignId).toBeUndefined();
    });

    it('player cannot create', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/hexes`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { q: 100, r: 100 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('non-member (outsider) gets 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/hexes`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { q: 200, r: 200 },
      });
      // REQ-MAP-04: non-member rejected
      expect(res.statusCode).toBe(403);
    });

    it('HEX_COORDS_TAKEN if top-level (q,r) already exists', async () => {
      await createHex({ q: 5, r: 5 });
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/hexes`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { q: 5, r: 5 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_COORDS_TAKEN');
    });

    it('same (q,r) under different parents does not collide', async () => {
      const parentA = await createHex({ q: 10, r: 10, scale: 'region' });
      const parentB = await createHex({ q: 11, r: 11, scale: 'region' });
      const subA = await createHex({ parentHexId: parentA.id, q: 0, r: 0, scale: 'local' });
      const subB = await createHex({ parentHexId: parentB.id, q: 0, r: 0, scale: 'local' });
      expect(subA.id).not.toBe(subB.id);
    });

    it('parentHexId that does not exist → PARENT_NOT_FOUND', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/hexes`,
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

  // ---- GET /worlds/:worldId/hexes + visibility ----------------------------
  describe('GET /worlds/:worldId/hexes + visibility', () => {
    let worldId2: string;
    let hUnexp: string;
    let hRumored: string;
    let hExpl: string;

    beforeAll(async () => {
      const result = await createWorldWithGm(dm.id);
      worldId2 = result.worldId;
      await addWorldMember(worldId2, alice.id, 'player');

      const app = await getTestApp();

      const u = await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId2}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0, name: 'Hidden', dmNotes: 'secret' },
        })
        .then((r) => r.json());
      hUnexp = u.id;

      const r = await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId2}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: {
            q: 1,
            r: 0,
            name: 'Rumored Hex',
            status: 'rumored',
            dmNotes: 'secret2',
            playerNotes: 'Treasure said to be here',
          },
        })
        .then((r) => r.json());
      hRumored = r.id;

      const e = await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId2}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 2, r: 0, name: 'Explored Hex', status: 'explored' },
        })
        .then((r) => r.json());
      hExpl = e.id;
    });

    it('GM sees all 3 hexes (including unexplored + dmNotes)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId2}/hexes`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBe(3);
      const dmNotes = data.find((h: any) => h.id === hUnexp).dmNotes;
      expect(dmNotes).toBe('secret');
    });

    it('player sees only the 2 non-unexplored hexes, without dmNotes', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId2}/hexes`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBe(2);
      expect(data.find((h: any) => h.id === hUnexp)).toBeUndefined();
      expect(data.every((h: any) => h.dmNotes === undefined)).toBe(true);
    });

    it('REQ-MAP-04: player member can read hexes (200)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId2}/hexes`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('player → 404 when requesting an unexplored hex by id', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hUnexp}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('REQ-MAP-04: non-member → 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId2}/hexes`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('cascade: sub-hex of an unexplored parent is not shown to player', async () => {
      const app = await getTestApp();
      const sub = await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId2}/hexes`,
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

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId2}/hexes?parent=all`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      const data = res.json().data;
      expect(data.find((h: any) => h.id === sub.id)).toBeUndefined();
    });
  });

  // ---- REQ-CROSS-02: Read-path tolerance for legacy rows ------------------
  describe('REQ-CROSS-02: pre-existing hex loads after migration backfill', () => {
    it('hex created in this test (simulating post-backfill row) loads via GET', async () => {
      const hex = await createHex({ q: 900, r: 900, name: 'Legacy sim' });
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${hex.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().worldId).toBe(worldId);
    });
  });

  // ---- Children -----------------------------------------------------------
  describe('GET /hexes/:hexId/children', () => {
    it('GM lists children of a hex', async () => {
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

  // ---- PATCH /hexes/:hexId ------------------------------------------------
  describe('PATCH /hexes/:hexId', () => {
    it('GM changes status to explored', async () => {
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

    it('player cannot edit', async () => {
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

    it('HEX_CYCLE if moving a hex inside its descendant', async () => {
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

    it('HEX_CYCLE if moving a hex to itself', async () => {
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

    it('HEX_COORDS_TAKEN when moving to already-occupied coordinates', async () => {
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

  // ---- DELETE /hexes/:hexId -----------------------------------------------
  describe('DELETE /hexes/:hexId', () => {
    it('GM deletes a hex and cascade deletes children', async () => {
      const app = await getTestApp();
      const parent = await createHex({ q: 200, r: 200, scale: 'region' });
      const child = await createHex({ parentHexId: parent.id, q: 0, r: 0 });

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/hexes/${parent.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(del.statusCode).toBe(204);

      const childCheck = await app.inject({
        method: 'GET',
        url: `/api/v1/hexes/${child.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(childCheck.statusCode).toBe(404);
    });

    it('player cannot delete', async () => {
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

  // ---- REQ-MAP-03: old campaign-scoped route must not exist ----------------
  describe('REQ-MAP-03: /campaigns/:campaignId/hexes must not exist', () => {
    it('GET /campaigns/:id/hexes returns 404 (route dropped)', async () => {
      const app = await getTestApp();
      // Use a valid UUID so the router doesn't fail on param validation — we're
      // checking that the ROUTE itself no longer exists, not the resource.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/00000000-0000-0000-0000-000000000001/hexes`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

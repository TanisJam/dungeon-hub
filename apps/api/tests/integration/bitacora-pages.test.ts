/**
 * Integration tests: bitácora pages CRUD routes
 *
 * REQ-BP-API-01 — POST   /characters/:id/bitacora/pages (create, 200, 403, 400)
 * REQ-BP-API-02 — GET    /characters/:id/bitacora/pages (list, tag filter, GM read, 403)
 * REQ-BP-API-03 — GET    /characters/:id/bitacora/pages/:pageId (get one, 404, 403)
 * REQ-BP-API-04 — PATCH  /characters/:id/bitacora/pages/:pageId (update, 403)
 * REQ-BP-API-05 — DELETE /characters/:id/bitacora/pages/:pageId (delete, 204, 403, 404)
 *
 * Pattern: mirrors character-knowledge.test.ts (in-process Fastify + real Postgres, singleFork)
 * bitacora-personal SDD spec #1974, design #1975.
 *
 * NOTE: House convention — POST creates return 200 not 201 (mirrors characters.ts:1782).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

// ──────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────────────────────────

describe('bitácora pages CRUD routes', () => {
  let gm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();

    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id));
    await addWorldMember(worldId, player.id, 'player');

    const charRes = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { worldId, name: 'Bitácora Test Character' },
    });
    expect(charRes.statusCode).toBe(201);
    characterId = charRes.json<{ id: string }>().id;
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ── POST /characters/:id/bitacora/pages ─────────────────────────────────────

  describe('POST /characters/:id/bitacora/pages', () => {
    it('owner creates page → 200 with id and createdAt', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Found goblin caves.', tags: ['monsters'], refs: [] },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ page: { id: string; createdAt: string } }>();
      expect(data.page).toBeDefined();
      expect(typeof data.page.id).toBe('string');
      expect(typeof data.page.createdAt).toBe('string');
    });

    it('non-owner (outsider) create → 403 FORBIDDEN', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { body: 'Should not work.', tags: ['lore'], refs: [] },
      });

      expect(res.statusCode).toBe(403);
    });

    it('non-owner (GM) create → 403 (owner-only writes)', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { body: 'GM writing a personal page.', tags: ['lore'], refs: [] },
      });

      // GM can READ but not WRITE player's personal pages (ADR-3)
      expect(res.statusCode).toBe(403);
    });

    it('invalid body (empty body field) → 400 VALIDATION_FAILED', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: '', tags: ['monsters'], refs: [] },
      });

      expect(res.statusCode).toBe(400);
      const data = res.json<{ error: string; issues: unknown[] }>();
      expect(data.error).toBe('VALIDATION_FAILED');
    });

    it('invalid tag → 400 VALIDATION_FAILED', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Some notes.', tags: ['not-a-real-tag'], refs: [] },
      });

      expect(res.statusCode).toBe(400);
      const data = res.json<{ error: string; issues: unknown[] }>();
      expect(data.error).toBe('VALIDATION_FAILED');
    });
  });

  // ── GET /characters/:id/bitacora/pages ──────────────────────────────────────

  describe('GET /characters/:id/bitacora/pages', () => {
    let page1Id: string;
    let page2Id: string;

    beforeAll(async () => {
      // Create 2 pages: one monsters tag, one lore tag
      const app = await getTestApp();
      const r1 = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Monster page', tags: ['monsters'], refs: [] },
      });
      page1Id = r1.json<{ page: { id: string } }>().page.id;

      const r2 = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Lore page', tags: ['lore'], refs: [] },
      });
      page2Id = r2.json<{ page: { id: string } }>().page.id;
    });

    it('owner lists all pages → 200 { pages, total }', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ pages: unknown[]; total: number }>();
      expect(Array.isArray(data.pages)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('tag filter narrows results', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/bitacora/pages?tag=monsters`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ pages: Array<{ tags: string[] }>; total: number }>();
      expect(data.pages.every((p) => p.tags.includes('monsters'))).toBe(true);
    });

    it('GM reads player pages → 200 (read access granted)', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('outsider (non-member) list → 403 FORBIDDEN', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ── GET /characters/:id/bitacora/pages/:pageId ──────────────────────────────

  describe('GET /characters/:id/bitacora/pages/:pageId', () => {
    let pageId: string;

    beforeAll(async () => {
      const app = await getTestApp();
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Single get test page.', tags: ['lore'], refs: [] },
      });
      pageId = r.json<{ page: { id: string } }>().page.id;
    });

    it('owner fetches own page → 200 with full page object', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ page: { id: string; body: string } }>();
      expect(data.page.id).toBe(pageId);
      expect(data.page.body).toBe('Single get test page.');
    });

    it('non-existent pageId → 404 NOT_FOUND', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/bitacora/pages/00000000-0000-0000-0000-000000000099`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH /characters/:id/bitacora/pages/:pageId ────────────────────────────

  describe('PATCH /characters/:id/bitacora/pages/:pageId', () => {
    let pageId: string;

    beforeAll(async () => {
      const app = await getTestApp();
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Original body.', tags: ['monsters'], refs: [] },
      });
      pageId = r.json<{ page: { id: string } }>().page.id;
    });

    it('owner updates body → 200 with updated body and new updatedAt', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Updated notes.' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ page: { body: string; updatedAt: string } }>();
      expect(data.page.body).toBe('Updated notes.');
      expect(typeof data.page.updatedAt).toBe('string');
    });

    it('GM cannot update (owner-only writes) → 403', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { body: 'GM tried to edit.' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ── DELETE /characters/:id/bitacora/pages/:pageId ───────────────────────────

  describe('DELETE /characters/:id/bitacora/pages/:pageId', () => {
    let pageId: string;

    beforeAll(async () => {
      const app = await getTestApp();
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { body: 'Page to delete.', tags: ['lore'], refs: [] },
      });
      pageId = r.json<{ page: { id: string } }>().page.id;
    });

    it('GM cannot delete player page → 403', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('owner deletes page → 204 and page no longer in list', async () => {
      const app = await getTestApp();

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(deleteRes.statusCode).toBe(204);

      // Verify page no longer appears in list
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/bitacora/pages`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      const listData = listRes.json<{ pages: Array<{ id: string }> }>();
      expect(listData.pages.some((p) => p.id === pageId)).toBe(false);
    });

    it('non-existent pageId delete → 404', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/characters/${characterId}/bitacora/pages/00000000-0000-0000-0000-000000000099`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});

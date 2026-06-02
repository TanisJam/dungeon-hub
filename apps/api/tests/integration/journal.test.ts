import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * Journal / Lore — Slice 3 (world-first-model).
 *
 * journal_entries re-parented from campaign_id → world_id (migration 0034).
 * Routes: /worlds/:worldId/journal-entries (collection), /journal-entries/:entryId (item).
 * Auth: getWorldAccess via worldMembers.
 *
 * Visibility:
 *   - public: visible para todos los miembros.
 *   - dm-only: solo GMs ven y editan.
 *
 * Crear/editar/borrar: solo GM.
 */
describe('journal — entries (Slice 3 world-scoped)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let oldCampaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    // Slice 3: world_id is the root scope. No campaign needed for journal.
    ({ worldId } = await createWorldWithGm(dm.id));
    await addWorldMember(worldId, alice.id, 'player');

    // Create a campaign to verify the old URL returns 404 (REQ-LORE-03).
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Journal Old Campaign' },
      })
      .then((r) => r.json());
    oldCampaignId = campaign.id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  async function createEntry(payload: Record<string, unknown>, wid = worldId): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${wid}/journal-entries`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---- REQ-LORE-02: worldId on entry, no campaignId ----------------------
  it('GM crea entry — response tem worldId (no campaignId), authorUserId correto', async () => {
    const e = await createEntry({
      title: 'Historia de Kelthara',
      body: '# Historia\n\nKelthara fue una fortaleza élfica...',
      tags: ['history', 'geography'],
    });
    expect(e.title).toBe('Historia de Kelthara');
    expect(e.tags).toEqual(['history', 'geography']);
    expect(e.visibility).toBe('public');
    expect(e.authorUserId).toBe(dm.id);
    expect(e.worldId).toBe(worldId);
    expect(e.campaignId).toBeUndefined();
  });

  it('player NO puede crear', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/journal-entries`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { title: 'Player attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('outsider NO puede crear', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/journal-entries`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { title: 'Outsider attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---- REQ-LORE-03: old campaign URL returns 404 -------------------------
  it('vieja URL /campaigns/:id/journal-entries retorna 404', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${oldCampaignId}/journal-entries`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---- Visibility -------------------------------------------------------
  it('player NO ve entries dm-only', async () => {
    const app = await getTestApp();
    const pub = await createEntry({ title: 'Public lore' });
    await createEntry({ title: 'Secret lore', visibility: 'dm-only' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/journal-entries`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    const data = res.json().data;
    expect(data.find((e: any) => e.id === pub.id)).toBeDefined();
    expect(data.find((e: any) => e.title === 'Secret lore')).toBeUndefined();
  });

  it('GET entry dm-only individual → 404 para player', async () => {
    const app = await getTestApp();
    const e = await createEntry({ title: 'Hidden', visibility: 'dm-only' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/journal-entries/${e.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET entry dm-only individual → 200 para GM', async () => {
    const app = await getTestApp();
    const e = await createEntry({ title: 'Hidden2', visibility: 'dm-only', body: 'secret' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/journal-entries/${e.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().body).toBe('secret');
  });

  // ---- Tag filter -------------------------------------------------------
  it('filtra por ?tag=history', async () => {
    await createEntry({ title: 'Historia A', tags: ['history'] });
    await createEntry({ title: 'Geografía A', tags: ['geography'] });

    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/journal-entries?tag=history`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    const data = res.json().data;
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((e: any) => e.tags.includes('history'))).toBe(true);
  });

  // ---- Orden updatedAt DESC --------------------------------------------
  it('lista ordenada por updatedAt DESC (último editado primero)', async () => {
    const app = await getTestApp();

    // Use a fresh world to avoid ordering interference.
    const { worldId: freshWorldId } = await createWorldWithGm(dm.id);

    const e1 = await app
      .inject({
        method: 'POST',
        url: `/api/v1/worlds/${freshWorldId}/journal-entries`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { title: 'First' },
      })
      .then((r) => r.json());

    await new Promise((r) => setTimeout(r, 50));
    await app
      .inject({
        method: 'POST',
        url: `/api/v1/worlds/${freshWorldId}/journal-entries`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { title: 'Second' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${freshWorldId}/journal-entries`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    const data = res.json().data;
    expect(data[0].title).toBe('Second');

    // PATCH e1 to push it to top.
    await new Promise((r) => setTimeout(r, 50));
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/journal-entries/${e1.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { body: 'updated' },
    });
    const res2 = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${freshWorldId}/journal-entries`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res2.json().data[0].title).toBe('First');
  });

  // ---- PATCH + DELETE ---------------------------------------------------
  it('PATCH cambia body y visibility', async () => {
    const app = await getTestApp();
    const e = await createEntry({ title: 'To patch', visibility: 'public' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/journal-entries/${e.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { body: 'nuevo cuerpo', visibility: 'dm-only' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().body).toBe('nuevo cuerpo');
    expect(res.json().visibility).toBe('dm-only');
  });

  it('player NO puede PATCH', async () => {
    const app = await getTestApp();
    const e = await createEntry({ title: 'Locked' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/journal-entries/${e.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { body: 'hack' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE borra entry', async () => {
    const app = await getTestApp();
    const e = await createEntry({ title: 'Doomed' });
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/journal-entries/${e.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(del.statusCode).toBe(204);
  });
});

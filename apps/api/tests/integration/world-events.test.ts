import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * World Events — Slice 3 (world-first-model).
 *
 * world_events re-parented from campaign_id → world_id (migration 0034).
 * Routes: /worlds/:worldId/world-events (collection), /world-events/:eventId (item).
 * Auth: getWorldAccess via worldMembers.
 *
 * Distintos de session_events:
 *   - world_events: persistentes, per-mundo, "historia oficial".
 *   - session_events: efímeros, per-sesión, ruido in-game.
 */
describe('world events — Slice 3 (world-scoped)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    // Create world for lore tests (Slice 3: no campaign needed for world_events).
    ({ worldId } = await createWorldWithGm(dm.id));
    await addWorldMember(worldId, alice.id, 'player');

    // Campaign still needed for the session.complete → worldChanges integration test.
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'World Events Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    // campaign.worldId is a NEW world; re-use it for session tests only.
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  async function createEvent(payload: Record<string, unknown>, wid = worldId): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${wid}/world-events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---- REQ-LORE-01: worldId on event, no campaignId -----------------------
  it('GM crea world event y la response tiene worldId (no campaignId)', async () => {
    const ev = await createEvent({
      title: 'El Rey Aldric muere',
      description: 'Cae en batalla contra los orcos',
      dmNotes: 'Su sucesor es manipulado por la facción rival',
      tags: ['death', 'royal'],
      visibility: 'public',
    });
    expect(ev.title).toBe('El Rey Aldric muere');
    expect(ev.tags).toEqual(['death', 'royal']);
    expect(ev.visibility).toBe('public');
    expect(ev.sourceSessionId).toBeNull();
    expect(ev.worldId).toBe(worldId);
    expect(ev.campaignId).toBeUndefined();
  });

  it('player NO puede crear', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/world-events`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { title: 'Player Attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('outsider → 403 al listar', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/world-events`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---- REQ-LORE-03: old campaign URL returns 404 --------------------------
  it('vieja URL /campaigns/:id/world-events retorna 404', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/world-events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---- Visibility ---------------------------------------------------------
  it('player NO ve events dm-only, ni dmNotes en los visibles', async () => {
    const app = await getTestApp();
    const pub = await createEvent({
      title: 'Public event',
      dmNotes: 'shhhh secret',
      visibility: 'public',
    });
    await createEvent({
      title: 'DM-only event',
      visibility: 'dm-only',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/world-events`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    const data = res.json().data;
    expect(data.find((e: any) => e.title === 'DM-only event')).toBeUndefined();
    const visible = data.find((e: any) => e.id === pub.id);
    expect(visible).toBeDefined();
    expect(visible.dmNotes).toBeUndefined();
  });

  it('GET dm-only event individual → 404 para player', async () => {
    const app = await getTestApp();
    const ev = await createEvent({ title: 'Hidden lore', visibility: 'dm-only' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/world-events/${ev.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---- Tag filter ---------------------------------------------------------
  it('filtra por ?tag=death', async () => {
    await createEvent({ title: 'NPC fallece', tags: ['death', 'npc'] });
    await createEvent({ title: 'Reino próspera', tags: ['economy'] });

    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/world-events?tag=death`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    const data = res.json().data;
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((e: any) => e.tags.includes('death'))).toBe(true);
  });

  // ---- Orden por occurredAt desc -----------------------------------------
  it('lista ordenada por occurredAt DESC', async () => {
    const app = await getTestApp();

    // Use a fresh world to avoid ordering interference from other tests.
    const { worldId: freshWorldId } = await createWorldWithGm(dm.id);

    await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${freshWorldId}/world-events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { title: 'Antiguo', occurredAt: '2025-01-01T00:00:00Z' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${freshWorldId}/world-events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { title: 'Reciente', occurredAt: '2026-06-01T00:00:00Z' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${freshWorldId}/world-events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    const data = res.json().data;
    expect(data[0].title).toBe('Reciente');
    expect(data[1].title).toBe('Antiguo');
  });

  // ---- PATCH + DELETE -----------------------------------------------------
  it('PATCH cambia visibility y tags', async () => {
    const app = await getTestApp();
    const ev = await createEvent({ title: 'To patch', visibility: 'public' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/world-events/${ev.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { visibility: 'dm-only', tags: ['retconned'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().visibility).toBe('dm-only');
    expect(res.json().tags).toEqual(['retconned']);
  });

  it('DELETE borra el event', async () => {
    const app = await getTestApp();
    const ev = await createEvent({ title: 'Doomed' });
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/world-events/${ev.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(del.statusCode).toBe(204);
  });

  // ---- Hook session.complete → worldChanges (world_id used, not campaignId) ---
  describe('session.complete.worldChanges → auto-crea world_events con worldId', () => {
    it('crea world events con worldId + sourceSessionId apuntando a la sesión', async () => {
      const app = await getTestApp();

      // campaign.worldId is the world that the session belongs to.
      const campaignResp = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Session World Changes Campaign' },
        })
        .then((r) => r.json());
      const sessionCampaignId: string = campaignResp.id;
      const sessionWorldId: string = campaignResp.worldId;

      const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
      await addCampaignAndWorldMember(sessionCampaignId, alice.id, 'player');

      const charId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/characters',
            headers: { authorization: `Bearer ${alice.accessToken}` },
            payload: { worldId: sessionWorldId, name: `wc ${Math.random()}` },
          })
          .then((r) => r.json())
      ).id;

      const sId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId: sessionCampaignId, title: 'WC Session' },
          })
          .then((r) => r.json())
      ).id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sId}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: charId },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sId}/start`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      // Complete with worldChanges.
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sId}/complete`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: {
          worldChanges: [
            {
              title: 'Las ruinas de Kelthara fueron limpiadas',
              description: 'El party derrotó al lich',
              tags: ['discovery', 'cleared'],
              visibility: 'public',
            },
            {
              title: 'La facción rival se enteró',
              dmNotes: 'Planean venganza',
              visibility: 'dm-only',
              tags: ['faction'],
            },
          ],
        },
      });
      expect(res.statusCode).toBe(200);

      // Verify world events created under the world (not campaign URL).
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${sessionWorldId}/world-events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      const data = list.json().data;
      const fromThisSession = data.filter((e: any) => e.sourceSessionId === sId);
      expect(fromThisSession.length).toBe(2);
      expect(fromThisSession.find((e: any) => e.visibility === 'dm-only')).toBeDefined();
      // REQ-LORE-01: worldId on event, not campaignId
      expect(fromThisSession[0].worldId).toBe(sessionWorldId);
      expect(fromThisSession[0].campaignId).toBeUndefined();
    });

    it('borrar la sesión deja los world_events vivos pero con sourceSessionId NULL', async () => {
      const app = await getTestApp();

      const campaignResp = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Disposable Campaign' },
        })
        .then((r) => r.json());
      const disposableCampaignId: string = campaignResp.id;
      const disposableWorldId: string = campaignResp.worldId;

      const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
      await addCampaignAndWorldMember(disposableCampaignId, alice.id, 'player');

      const sId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId: disposableCampaignId, title: 'Disposable session' },
          })
          .then((r) => r.json())
      ).id;

      const charId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/characters',
            headers: { authorization: `Bearer ${alice.accessToken}` },
            payload: { worldId: disposableWorldId, name: `disp ${Math.random()}` },
          })
          .then((r) => r.json())
      ).id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sId}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: charId },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sId}/start`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sId}/complete`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: {
          worldChanges: [{ title: 'Marker para test cascade' }],
        },
      });

      // Delete session directly (no exposed DELETE session endpoint).
      const { db } = await import('../../src/infra/db/client.js');
      const { sessions } = await import('../../src/infra/db/schema.js');
      const { eq } = await import('drizzle-orm');
      await db.delete(sessions).where(eq(sessions.id, sId));

      // World event still exists, sourceSessionId is now NULL.
      const all = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${disposableWorldId}/world-events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      const found = all
        .json()
        .data.find((e: any) => e.title === 'Marker para test cascade');
      expect(found).toBeDefined();
      expect(found.sourceSessionId).toBeNull();
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Hexcrawl Map — Slice 3.
 *
 * Auto-events cuando el GM modifica hex/POI durante una sesión active.
 * Detección automática de single-session; ambigüedad → ?sessionId.
 */
describe('hexcrawl — Slice 3 (session auto-events)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let campaignId: string;
  let sessionId: string;
  let hexId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Map+Session Campaign' },
        })
        .then((r) => r.json())
    ).id;

    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaignId, alice.id, 'player');

    hexId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${campaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0, name: 'Start hex' },
        })
        .then((r) => r.json())
    ).id;

    // Sesión active.
    sessionId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title: 'Map Session' },
        })
        .then((r) => r.json())
    ).id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    await closeTestApp();
  });

  async function getEvents(sId: string): Promise<any[]> {
    const app = await getTestApp();
    return (
      await app
        .inject({
          method: 'GET',
          url: `/api/v1/sessions/${sId}/events`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json())
    ).data;
  }

  // ---- Hex status transitions ------------------------------------------
  it('PATCH hex unexplored → rumored genera hex_revealed', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hexId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'rumored' },
    });
    const events = await getEvents(sessionId);
    const ev = events.find((e) => e.eventType === 'hex_revealed');
    expect(ev).toBeDefined();
    expect(ev.payload.hexId).toBe(hexId);
    expect(ev.payload.from).toBe('unexplored');
    expect(ev.payload.to).toBe('rumored');
  });

  it('PATCH hex rumored → explored genera hex_explored', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hexId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'explored' },
    });
    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'hex_explored')).toBeDefined();
  });

  it('PATCH hex explored → cleared genera hex_cleared', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hexId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'cleared' },
    });
    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'hex_cleared')).toBeDefined();
  });

  it('PATCH hex reverse transition (cleared → explored) genera hex_status_changed', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hexId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'explored' },
    });
    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'hex_status_changed')).toBeDefined();
  });

  // ---- POI status transitions ------------------------------------------
  it('PATCH poi unknown → discovered genera poi_discovered', async () => {
    const app = await getTestApp();
    const poi = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/hexes/${hexId}/pois`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Hidden cave' },
        })
        .then((r) => r.json())
    );

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/pois/${poi.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'discovered' },
    });
    const events = await getEvents(sessionId);
    const ev = events.find((e) => e.eventType === 'poi_discovered');
    expect(ev).toBeDefined();
    expect(ev.payload.poiId).toBe(poi.id);
  });

  it('PATCH poi discovered → cleared genera poi_cleared', async () => {
    const app = await getTestApp();
    const poi = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/hexes/${hexId}/pois`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Boss room', status: 'discovered' },
        })
        .then((r) => r.json())
    );
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/pois/${poi.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'cleared' },
    });
    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'poi_cleared')).toBeDefined();
  });

  // ---- Creation events --------------------------------------------------
  it('POST hex con status non-default genera hex_created', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/hexes`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { q: 10, r: 10, name: 'New visible hex', status: 'rumored' },
    });
    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'hex_created')).toBeDefined();
  });

  it('POST hex con status unexplored (default) NO genera event (es prep)', async () => {
    const app = await getTestApp();
    const before = (await getEvents(sessionId)).length;
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/hexes`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { q: 11, r: 11, name: 'Prep hex' }, // status default
    });
    const after = (await getEvents(sessionId)).length;
    expect(after).toBe(before);
  });

  it('POST poi con status non-default genera poi_created', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST',
      url: `/api/v1/hexes/${hexId}/pois`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { name: 'Visible right away', status: 'discovered' },
    });
    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'poi_created')).toBeDefined();
  });

  // ---- No active session → no log --------------------------------------
  it('PATCH hex sin sesión active del GM → no log', async () => {
    const app = await getTestApp();
    // Crear nueva campaña sin sesiones active.
    const cId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'No-Session Campaign' },
        })
        .then((r) => r.json())
    ).id;
    const hId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${cId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0 },
        })
        .then((r) => r.json())
    ).id;

    // No debería tirar; el PATCH simplemente no logguea.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'rumored' },
    });
    expect(res.statusCode).toBe(200);
  });

  // ---- Multi-session disambiguation ------------------------------------
  it('GM con 2 sesiones active sin ?sessionId → no log (ambiguo)', async () => {
    const app = await getTestApp();
    // Crear campaña fresca con 2 sesiones active.
    const cId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'MultiSession Campaign' },
        })
        .then((r) => r.json())
    ).id;
    const s1 = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId: cId, title: 'S1' },
        })
        .then((r) => r.json())
    ).id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${s1}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    const s2 = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId: cId, title: 'S2' },
        })
        .then((r) => r.json())
    ).id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${s2}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    const hId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${cId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0 },
        })
        .then((r) => r.json())
    ).id;

    // PATCH sin sessionId → ambiguo → no log.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'rumored' },
    });
    const e1 = await getEvents(s1);
    const e2 = await getEvents(s2);
    expect(e1.find((e) => e.eventType === 'hex_revealed')).toBeUndefined();
    expect(e2.find((e) => e.eventType === 'hex_revealed')).toBeUndefined();

    // PATCH con ?sessionId=s2 → debería loggear en s2.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hId}?sessionId=${s2}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'explored' },
    });
    const e1After = await getEvents(s1);
    const e2After = await getEvents(s2);
    expect(e1After.find((e) => e.eventType === 'hex_explored')).toBeUndefined();
    expect(e2After.find((e) => e.eventType === 'hex_explored')).toBeDefined();
  });

  // ---- Paused session → no log -----------------------------------------
  it('PATCH hex con sesión paused (no active) → no log', async () => {
    const app = await getTestApp();
    const cId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Paused Campaign' },
        })
        .then((r) => r.json())
    ).id;
    const sId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId: cId, title: 'Paused' },
        })
        .then((r) => r.json())
    ).id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sId}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sId}/pause`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    const hId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${cId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0 },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'rumored' },
    });
    const events = await getEvents(sId);
    expect(events.find((e) => e.eventType === 'hex_revealed')).toBeUndefined();
  });
});

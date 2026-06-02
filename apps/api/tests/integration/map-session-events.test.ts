import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Hexcrawl Map — Session auto-events (world-first-model Slice 1).
 *
 * Auto-events when GM modifies hex/POI during an active session.
 * After Slice 1, hex routes are /worlds/:worldId/hexes. The auto-log
 * resolves the active session via findActiveSessionForGmInWorld (JOIN
 * sessions→campaigns by worldId — ADR-4).
 *
 * REQ-MAP-05: recordSessionEventForWorld continues to auto-log after re-parent.
 */
describe('hexcrawl — session auto-events (world-first-model Slice 1)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let campaignId: string;
  let worldId: string;
  let sessionId: string;
  let hexId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();

    // Creating a campaign also creates a world and adds the DM as world GM.
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Map+Session Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaignId, alice.id, 'player');

    // Create hex under the world (world-scoped URL — REQ-MAP-03).
    hexId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0, name: 'Start hex' },
        })
        .then((r) => r.json())
    ).id;

    // Active session (campaign-scoped — sessions stay campaign-scoped).
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

  // ---- REQ-MAP-05: auto-log fires after hex re-parent --------------------

  it('PATCH hex unexplored → rumored generates hex_revealed (ADR-4 join resolves session)', async () => {
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

  it('PATCH hex rumored → explored generates hex_explored', async () => {
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

  it('PATCH hex explored → cleared generates hex_cleared', async () => {
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

  it('PATCH hex reverse transition (cleared → explored) generates hex_status_changed', async () => {
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

  // ---- POI status transitions ---------------------------------------------

  it('PATCH poi unknown → discovered generates poi_discovered', async () => {
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

  it('PATCH poi discovered → cleared generates poi_cleared', async () => {
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

  // ---- Creation events ---------------------------------------------------

  it('POST hex with non-default status generates hex_created', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/hexes`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { q: 10, r: 10, name: 'New visible hex', status: 'rumored' },
    });
    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'hex_created')).toBeDefined();
  });

  it('POST hex with unexplored status (default) does NOT generate event (prep)', async () => {
    const app = await getTestApp();
    const before = (await getEvents(sessionId)).length;
    await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/hexes`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { q: 11, r: 11, name: 'Prep hex' },
    });
    const after = (await getEvents(sessionId)).length;
    expect(after).toBe(before);
  });

  it('POST poi with non-default status generates poi_created', async () => {
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

  // ---- REQ-MAP-05 Scenario: no active session → no log -------------------

  it('PATCH hex with no active session → 200, no event logged', async () => {
    const app = await getTestApp();
    // Create a new campaign (+ world) with no active sessions.
    const newCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'No-Session Campaign' },
      })
      .then((r) => r.json());
    const newWorldId = newCampaign.worldId;

    const hId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${newWorldId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0 },
        })
        .then((r) => r.json())
    ).id;

    // Should not throw; the PATCH simply doesn't log an event.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/hexes/${hId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'rumored' },
    });
    expect(res.statusCode).toBe(200);
  });

  // ---- Multi-session disambiguation (ADR-4) ------------------------------

  it('GM with 2 active sessions and no ?sessionId → no log (ambiguous)', async () => {
    const app = await getTestApp();
    const newCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'MultiSession Campaign' },
      })
      .then((r) => r.json());
    const cId = newCampaign.id;
    const wId = newCampaign.worldId;

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
          url: `/api/v1/worlds/${wId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0 },
        })
        .then((r) => r.json())
    ).id;

    // PATCH without sessionId → ambiguous → no log.
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

    // PATCH with ?sessionId=s2 → should log in s2.
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

  // ---- Paused session → no log ------------------------------------------

  it('PATCH hex with paused session → no log', async () => {
    const app = await getTestApp();
    const newCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Paused Campaign' },
      })
      .then((r) => r.json());
    const cId = newCampaign.id;
    const wId = newCampaign.worldId;

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
          url: `/api/v1/worlds/${wId}/hexes`,
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

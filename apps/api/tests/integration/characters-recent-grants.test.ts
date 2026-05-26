import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

/**
 * Integration tests for GET /characters/:id/recent-grants
 *
 * Covers REQ-CRG-ENDPOINT + REQ-CRG-FILTERING (spec sdd/inventory-d4-d6 #889).
 *   T1 — owner sees grants ordered DESC
 *   T2 — worldGm sees same data
 *   T3 — non-eligible caller → 403 NOT_OWNER_OR_GM
 *   T4 — limit cap respected
 *   T5 — empty state returns empty array
 */
describe('GET /characters/:id/recent-grants', () => {
  let dm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let worldId: string;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    // DM creates world via campaign
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: `RecentGrants Campaign ${Math.random()}` },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // Player joins world
    await addCampaignAndWorldMember(campaignId, player.id, 'player');

    // Player creates character
    characterId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${player.accessToken}` },
          payload: { worldId, name: 'Grant Recipient' },
        })
        .then((r) => r.json())
    ).id;

    // Create session and add character so events can be logged
    const sessionId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title: 'Grant Test Session' },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/join`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { characterId },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    // Grant gold — emits gold_grant event
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/grant/gold`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { gp: 50 },
    });

    // Grant item — emits item_grant event
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/grant/item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, quantity: 1 },
    });

    // Grant XP — emits xp_award event
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 100 },
    });
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('T1 — owner sees 3 grant events ordered DESC by occurredAt', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/recent-grants?limit=10`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { events } = res.json();
    expect(events.length).toBe(3);

    // Ordered DESC: last grant first
    const occurrences = events.map((e: { occurredAt: string }) => new Date(e.occurredAt).getTime());
    for (let i = 1; i < occurrences.length; i++) {
      expect(occurrences[i - 1]).toBeGreaterThanOrEqual(occurrences[i]!);
    }

    // All expected event types present
    const types = events.map((e: { eventType: string }) => e.eventType);
    expect(types).toContain('gold_grant');
    expect(types).toContain('item_grant');
    expect(types).toContain('xp_award');
  });

  it('T2 — worldGm sees same data as owner', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/recent-grants`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { events } = res.json();
    expect(events.length).toBe(3);
  });

  it('T3 — non-eligible caller → 403 NOT_OWNER_OR_GM', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/recent-grants`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues[0]?.code).toBe('NOT_OWNER_OR_GM');
  });

  it('T4 — limit=1 returns at most 1 event', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/recent-grants?limit=1`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().events.length).toBe(1);
  });

  it('T5 — empty state: fresh character with no grants → empty array', async () => {
    const app = await getTestApp();

    // Create another player and character with no grants
    const newPlayer = await createTestUser();
    try {
      await addCampaignAndWorldMember(campaignId, newPlayer.id, 'player');
      const freshCharId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/characters',
            headers: { authorization: `Bearer ${newPlayer.accessToken}` },
            payload: { worldId, name: 'No Grants Char' },
          })
          .then((r) => r.json())
      ).id;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${freshCharId}/recent-grants`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().events).toEqual([]);
    } finally {
      await deleteTestUser(newPlayer.id);
    }
  });
});

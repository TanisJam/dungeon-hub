import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

/**
 * Integration tests for PUT /characters/:id/hp
 *
 * Spec: sdd/ficha-dm-affordances #995 — Requirement: PUT /characters/:id/hp
 *
 * T1: owner sets current + temp → 200
 * T2: owner attempts max → 403 HP_MAX_OWNER_FORBIDDEN
 * T3: DM sets all three fields → 200
 * T4: DM lowers max below current → 200, current clamped to new max
 * T5: negative current → 400 HP_CURRENT_NEGATIVE
 * T6: empty body → 400
 */
describe('PUT /characters/:id/hp', () => {
  let dm: TestUser;
  let player: TestUser;
  let worldId: string;
  let campaignId: string;
  let charId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: `HP Test Campaign ${Math.random()}` },
      })
      .then((r) => r.json());

    campaignId = campaign.id;
    worldId = campaign.worldId;

    await addCampaignAndWorldMember(campaignId, player.id, 'player');

    charId = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: 'HP Test Character' },
      })
      .then((r) => r.json().id as string);

    // Level up character to Fighter L1 so it has a known HP max
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/stats`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/class`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    // Set a known HP state: current=18, max=20 via DM (no level-up needed, DM can set freely)
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { current: 18, max: 20, temp: 0 },
    });
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    await closeTestApp();
  });

  it('T1: owner sets current + temp → 200 with updated hp fields', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { current: 5, temp: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.hp.current).toBe(5);
    expect(body.hp.temp).toBe(2);
  });

  it('T2: owner attempts to set max → 403 HP_MAX_OWNER_FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { max: 25 },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    const issues = body.issues as Array<{ code: string }>;
    expect(issues[0]?.code).toBe('HP_MAX_OWNER_FORBIDDEN');
  });

  it('T3: DM sets all three fields → 200', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { current: 15, max: 20, temp: 3 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.hp.current).toBe(15);
    expect(body.hp.max).toBe(20);
    expect(body.hp.temp).toBe(3);
  });

  it('T4: DM lowers max below current → 200, current clamped to new max', async () => {
    const app = await getTestApp();
    // First set current=18 to establish a value above clamp target
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { current: 18, max: 20 },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { max: 15 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.hp.max).toBe(15);
    // current was 18, must be clamped to new max of 15
    expect(body.hp.current).toBe(15);
  });

  it('T5: negative current → 400 HP_CURRENT_NEGATIVE', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { current: -1 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    const issues = body.issues as Array<{ code: string }>;
    expect(issues[0]?.code).toBe('HP_CURRENT_NEGATIVE');
  });

  it('T6: empty body → 400', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/hp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

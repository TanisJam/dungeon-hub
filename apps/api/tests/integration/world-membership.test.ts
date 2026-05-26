/**
 * world-membership.test.ts — C7 integration tests
 *
 * Validates that POST /characters uses the direct worldMembers table (no shim)
 * after migration 0016 backfilled campaignMembers → worldMembers.
 *
 * REQs covered: REQ-WF-INTEGRATION-COVERAGE (player-creates-character-in-world path)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';

describe('world membership — character creation via worldMembers', () => {
  let gm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    // 1. Create world with gm as owner+gm
    ({ worldId } = await createWorldWithGm(gm.id, { name: 'Membership Test World' }));

    // 2. Add player as a worldMember (role=player) directly — simulates post-0016 state
    const { db } = await import('../../src/infra/db/client.js');
    const { worldMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(worldMembers).values({ worldId, userId: player.id, role: 'player' });
    // outsider has NO worldMember row
  });

  afterAll(async () => {
    // deleteTestUser handles world cleanup via worlds.owner_user_id delete + cascade
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('player-role worldMember can create a character — 201', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { worldId, name: 'Player Hero' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.worldId).toBe(worldId);
    expect(body.userId).toBe(player.id);
    expect(body.name).toBe('Player Hero');
  });

  it('gm-role worldMember can create a character — 201', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { worldId, name: 'GM Hero' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.worldId).toBe(worldId);
    expect(body.userId).toBe(gm.id);
  });

  it('user with no worldMember row gets 403 NOT_WORLD_MEMBER — shim removed', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { worldId, name: 'Intruder' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('NOT_WORLD_MEMBER');
  });
});

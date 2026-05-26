/**
 * worlds.test.ts — Integration tests for GET /worlds/:id.
 *
 * Covers REQ-CWR-WORLD-GET from sdd/character-wizard-world-rebind/spec (#798):
 *   - Member 200 (returns world payload with rulesProfile)
 *   - Non-member 403
 *   - Unknown id 404
 *   - Invalid uuid 400
 *   - No bearer 401
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

describe('GET /worlds/:id', () => {
  let gm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id, { name: 'World GET Test' }));
    await addWorldMember(worldId, player.id, 'player');
    // outsider has NO worldMembers row
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('gm (owner + worldMember) gets 200 with full payload + rulesProfile', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(worldId);
    expect(body.name).toBe('World GET Test');
    expect(typeof body.slug).toBe('string');
    expect(body.ownerUserId).toBe(gm.id);
    // rulesProfile must be the parsed RulesProfile shape — verify a couple of fields.
    expect(body.rulesProfile).toBeTypeOf('object');
    expect(body.rulesProfile.sources).toBeTypeOf('object');
    expect(body.rulesProfile.statGeneration).toBeTypeOf('object');
  });

  it('player-role worldMember gets 200', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(worldId);
  });

  it('user with no worldMembers row gets 403 FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('unknown worldId gets 404 NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${randomUUID()}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
  });

  it('invalid uuid param gets 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/not-a-uuid`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('no bearer token gets 401 UNAUTHORIZED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

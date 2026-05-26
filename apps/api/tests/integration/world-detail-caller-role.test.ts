/**
 * Integration tests for `callerRole` on GET /worlds/:id.
 *
 * Covers REQ-WDR-CALLER-ROLE from SDD `dm-session-panel/spec` (#857).
 *
 * The web layer needs `callerRole` to render DM-only chrome (DM session panel
 * approve/reject) without a second round-trip to `/worlds?mine=1`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

describe('GET /worlds/:id — callerRole', () => {
  let dm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(dm.id, { name: 'CallerRole World' }));
    await addWorldMember(worldId, player.id, 'player');
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it("gm caller → callerRole: 'gm'", async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.callerRole).toBe('gm');
    // sanity: existing fields still present (additive contract)
    expect(body.id).toBe(worldId);
    expect(typeof body.rulesProfile).toBe('object');
  });

  it("player caller → callerRole: 'player'", async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().callerRole).toBe('player');
  });

  it('non-member (outsider) → 403 FORBIDDEN (unchanged)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

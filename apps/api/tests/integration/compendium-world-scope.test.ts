/**
 * compendium-world-scope.test.ts — Integration tests for the XOR scoping
 * parameter (?campaign= OR ?world=) on compendium endpoints.
 *
 * Covers REQ-CWR-COMPENDIUM-SCOPING from
 * sdd/character-wizard-world-rebind/spec (#798).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('compendium scoping — ?campaign= XOR ?world=', () => {
  let dm: TestUser;
  let campaignId: string;
  let worldId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();

    // POST /campaigns creates both a campaign + a world (worldMembers row included).
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Scope Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    await closeTestApp();
  });

  it('?campaign=<uuid> still works (backwards compat)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/races?campaign=${campaignId}&limit=5`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
  });

  it('?world=<uuid> resolves the same profile (rows identical)', async () => {
    const app = await getTestApp();
    const [byCampaign, byWorld] = await Promise.all([
      app
        .inject({
          method: 'GET',
          url: `/api/v1/compendium/races?campaign=${campaignId}&limit=200`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json()),
      app
        .inject({
          method: 'GET',
          url: `/api/v1/compendium/races?world=${worldId}&limit=200`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json()),
    ]);

    expect(byWorld.total).toBe(byCampaign.total);
    const slugs = (rows: Array<{ slug: string; source: string }>) =>
      rows.map((r) => `${r.slug}|${r.source}`).sort();
    expect(slugs(byWorld.data)).toEqual(slugs(byCampaign.data));
  });

  it('both ?campaign= AND ?world= present → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/races?campaign=${campaignId}&world=${worldId}&limit=5`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });

  it('neither ?campaign= nor ?world= → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/races?limit=5`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });

  it('?world=<bad-uuid> → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/races?world=not-a-uuid&limit=5`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });

  it('?world=<unknown-uuid> → 404 WORLD_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/races?world=${randomUUID()}&limit=5`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('WORLD_NOT_FOUND');
  });

  it('detail endpoint accepts ?world= (200 elf PHB)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/races/elf?source=PHB&world=${worldId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slug).toBe('elf');
    expect(body.source).toBe('PHB');
  });
});

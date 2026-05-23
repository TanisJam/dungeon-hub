import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('compendium actions', () => {
  let user: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: 'Actions Test Campaign' },
    });
    if (res.statusCode !== 201) {
      throw new Error(`Failed to create test campaign: ${res.statusCode} ${res.body}`);
    }
    campaignId = res.json().id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('lists 30 actions (PHB + DMG + XGE, no XPHB), with id/slug/source/name shape', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/actions?campaign=${campaignId}&limit=100`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThanOrEqual(30);

    for (const row of data) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('slug');
      expect(row).toHaveProperty('source');
      expect(row).toHaveProperty('name');
      expect(row.source).not.toBe('XPHB');
    }
  });

  it('includes PHB basic actions (attack, dash, dodge, hide, search)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/actions?campaign=${campaignId}&limit=100`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const slugs = res.json().data.map((r: { slug: string }) => r.slug);
    for (const s of ['attack', 'dash', 'dodge', 'hide', 'search']) {
      expect(slugs).toContain(s);
    }
  });

  it('returns Attack detail (PHB) with non-empty entries', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/actions/attack?campaign=${campaignId}&source=PHB`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json();
    expect(row.slug).toBe('attack');
    expect(row.source).toBe('PHB');
    expect(Array.isArray(row.data?.entries)).toBe(true);
    expect(row.data.entries.length).toBeGreaterThan(0);
  });

  it('returns 404 for nonexistent action slug', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/actions/nonexistent-action?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

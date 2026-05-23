import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('compendium languages', () => {
  let user: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: 'Languages Test Campaign' },
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

  it('lists languages with id/slug/source/name/type/script shape', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/languages?campaign=${campaignId}&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThanOrEqual(18);

    for (const row of data) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('slug');
      expect(row).toHaveProperty('source');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('type');
      expect(row).toHaveProperty('script');
    }
  });

  it('filters by type=exotic (every row has type=exotic)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/languages?campaign=${campaignId}&type=exotic&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThan(0);
    expect(data.every((r: { type: string }) => r.type === 'exotic')).toBe(true);
  });

  it('returns Common detail (PHB) — type=standard, entries absent/empty', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/languages/common?campaign=${campaignId}&source=PHB`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json();
    expect(row.slug).toBe('common');
    expect(row.type).toBe('standard');
    // Common in 5etools PHB has no prose entries
    const entries = row.data?.entries;
    expect(entries === undefined || entries === null || (Array.isArray(entries) && entries.length === 0)).toBe(true);
  });

  it('returns Draconic detail with non-empty entries', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/languages/draconic?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json();
    expect(row.slug).toBe('draconic');
    expect(Array.isArray(row.data?.entries)).toBe(true);
    expect(row.data.entries.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown language slug', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/languages/unknown-tongue?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

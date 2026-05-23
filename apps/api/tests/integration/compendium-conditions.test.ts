import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('compendium conditions', () => {
  let user: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: 'Conditions Test Campaign' },
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

  it('lists all 17 conditions + statuses (15 condition + 2 status, no diseases)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/conditions?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBe(17);

    for (const row of data) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('slug');
      expect(row).toHaveProperty('source');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('kind');
      expect(['condition', 'status']).toContain(row.kind);
    }
  });

  it('filters by kind=condition (returns 15)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/conditions?campaign=${campaignId}&kind=condition&limit=50`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBe(15);
    expect(data.every((r: { kind: string }) => r.kind === 'condition')).toBe(true);
  });

  it('filters by kind=status (returns 2: concentration, surprised)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/conditions?campaign=${campaignId}&kind=status`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBe(2);
    const slugs = data.map((r: { slug: string }) => r.slug).sort();
    expect(slugs).toEqual(['concentration', 'surprised']);
  });

  it('searches by name with q=para (includes paralyzed)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/conditions?campaign=${campaignId}&q=para`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const slugs = res.json().data.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain('paralyzed');
  });

  it('returns full detail for blinded@PHB with non-empty entries', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/conditions/blinded?campaign=${campaignId}&source=PHB`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json();
    expect(row.slug).toBe('blinded');
    expect(row.source).toBe('PHB');
    expect(row.kind).toBe('condition');
    expect(Array.isArray(row.data?.entries)).toBe(true);
    expect(row.data.entries.length).toBeGreaterThan(0);
  });

  it('returns 404 for nonexistent condition slug', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/conditions/nonexistent?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

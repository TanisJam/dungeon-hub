import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

const TOOL_TYPES = new Set(['T', 'AT', 'GS', 'INS']);

describe('compendium tools', () => {
  let user: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: 'Tools Test Campaign' },
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

  it('lists only items with type ∈ {T, AT, GS, INS}, total ≥ 40', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/tools?campaign=${campaignId}&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThanOrEqual(40);

    for (const row of data) {
      expect(TOOL_TYPES.has(row.type)).toBe(true);
    }
  });

  it('response envelope has exactly {data, total, limit, offset}', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/tools?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(['data', 'limit', 'offset', 'total']);
  });

  it('list items expose id/slug/source/name/type/weight (same as /items)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/tools?campaign=${campaignId}&limit=10`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const first = res.json().data[0];
    for (const k of ['id', 'slug', 'source', 'name', 'type', 'weight']) {
      expect(first).toHaveProperty(k);
    }
  });

  it('paginates with limit=10 offset=0', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/tools?campaign=${campaignId}&limit=10&offset=0`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(10);
    expect(body.total).toBeGreaterThanOrEqual(40);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  it('returns full detail for thieves-tools with data jsonb', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/tools/thieves-tools?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json();
    expect(row.slug).toBe('thieves-tools');
    expect(TOOL_TYPES.has(row.type)).toBe(true);
    expect(row.data).toBeTruthy();
  });

  it('returns 404 for /tools/longsword (longsword is type M, not a tool)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/tools/longsword?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('regression: /items?type=T still works', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?campaign=${campaignId}&type=T&limit=50`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThanOrEqual(1);
    expect(data.every((r: { type: string }) => r.type === 'T')).toBe(true);
  });
});

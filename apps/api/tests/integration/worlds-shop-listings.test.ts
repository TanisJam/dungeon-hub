/**
 * worlds-shop-listings.test.ts — Integration tests for PATCH /worlds/:id/shop-listings.
 *
 * market-shop-dm-stock-api, sub-slice 3d — DM mutation endpoint for
 * rulesProfile.shopCuration (enabled + forSale allowlist).
 *
 * REQ-SHOP-LISTINGS-01: GM sets { enabled, forSale } → persists on the world's
 *   rulesProfile.shopCuration (re-GET confirms).
 * REQ-SHOP-LISTINGS-02: non-GM caller (player worldMember or outsider) → 403.
 * REQ-SHOP-LISTINGS-03: partial update (only `forSale`) preserves the existing
 *   `enabled` value — this is a merge, not a full replace.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

describe('PATCH /worlds/:id/shop-listings', () => {
  let gm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id, { name: 'Shop Listings Test World' }));
    await addWorldMember(worldId, player.id, 'player');
    // outsider has NO worldMembers row
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('[REQ-SHOP-LISTINGS-01] GM sets enabled+forSale → persists on the world', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/worlds/${worldId}/shop-listings`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { enabled: true, forSale: ['longsword|PHB', 'dagger|PHB'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shopCuration).toEqual({ enabled: true, forSale: ['longsword|PHB', 'dagger|PHB'] });

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(getRes.json().rulesProfile.shopCuration).toEqual({
      enabled: true,
      forSale: ['longsword|PHB', 'dagger|PHB'],
    });
  });

  it('[REQ-SHOP-LISTINGS-02] player-role worldMember → 403 FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/worlds/${worldId}/shop-listings`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { enabled: true, forSale: ['longsword|PHB'] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('[REQ-SHOP-LISTINGS-02] outsider (no worldMembers row) → 403 FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/worlds/${worldId}/shop-listings`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { enabled: true, forSale: ['longsword|PHB'] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('[REQ-SHOP-LISTINGS-03] partial update (only forSale) preserves existing enabled', async () => {
    const app = await getTestApp();
    const { worldId: w2 } = await createWorldWithGm(gm.id, { name: 'Shop Listings Partial World' });

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/v1/worlds/${w2}/shop-listings`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { enabled: true, forSale: ['longsword|PHB'] },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'PATCH',
      url: `/api/v1/worlds/${w2}/shop-listings`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { forSale: ['dagger|PHB'] },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().shopCuration).toEqual({ enabled: true, forSale: ['dagger|PHB'] });
  });
});

/**
 * Custom content via JSON upload — items only (MVP #3.8, DEC-1 locked
 * 2026-06-04: JSON upload, not visual authoring).
 *
 * Route: POST /api/v1/worlds/:worldId/homebrew/items (GM only).
 *
 * Coverage:
 *   IT-HB-01: GM uploads → 201, created count, item visible via GET /compendium/items?world=
 *   IT-HB-02: player (non-GM world member) → 403
 *   IT-HB-03: outsider (no worldMembers row) → 403
 *   IT-HB-04: empty items array → 400 VALIDATION_FAILED + issues[]
 *   IT-HB-05: two items slugifying to the same name in one request → 400 VALIDATION_FAILED
 *   IT-HB-06: re-uploading the same slug UPDATES rather than duplicating
 *   IT-HB-07: after upload, the world's rulesProfile enables the homebrew source
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { homebrewSourceCode } from '@dungeon-hub/domain/homebrew';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

describe('POST /worlds/:worldId/homebrew/items', () => {
  let gm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id));
    await addWorldMember(worldId, player.id, 'player');
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('IT-HB-01: GM uploads → 201 with created count, item visible in the world compendium', async () => {
    const app = await getTestApp();
    const expectedSource = homebrewSourceCode(worldId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/homebrew/items`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        items: [{ name: 'Blade of Dawn', type: 'M', weight: 3, data: { rarity: 'rare' } }],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.source).toBe(expectedSource);
    expect(body.created).toBe(1);
    expect(body.updated).toBe(0);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&q=${encodeURIComponent('Blade of Dawn')}&limit=50`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const { data } = list.json<{ data: Array<{ name: string; source: string }> }>();
    expect(
      data.find((i) => i.name === 'Blade of Dawn' && i.source === expectedSource),
    ).toBeDefined();
  });

  it('IT-HB-02: player (non-GM world member) → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/homebrew/items`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { items: [{ name: 'Player Attempt' }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('IT-HB-03: outsider (no worldMembers row) → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/homebrew/items`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { items: [{ name: 'Outsider Attempt' }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('IT-HB-04: empty items array → 400 VALIDATION_FAILED con issues[]', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/homebrew/items`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { items: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
    expect(Array.isArray(res.json().issues)).toBe(true);
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it('IT-HB-05: two items slugifying to the same name in one request → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/homebrew/items`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { items: [{ name: 'Twin Blade' }, { name: 'twin  blade' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });

  it('IT-HB-06: re-uploading the same slug UPDATES rather than duplicating', async () => {
    const app = await getTestApp();
    const { worldId: w2 } = await createWorldWithGm(gm.id);

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${w2}/homebrew/items`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { items: [{ name: 'Rusty Dagger', type: 'M', weight: 1 }] },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().created).toBe(1);
    expect(first.json().updated).toBe(0);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${w2}/homebrew/items`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { items: [{ name: 'Rusty Dagger', type: 'M', weight: 2 }] },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().created).toBe(0);
    expect(second.json().updated).toBe(1);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${w2}&q=${encodeURIComponent('Rusty Dagger')}&limit=50`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    const { data, total } = list.json<{
      data: Array<{ name: string; weight: string | null }>;
      total: number;
    }>();
    expect(total).toBe(1);
    expect(data[0]?.weight).toBe('2');
  });

  it("IT-HB-07: after upload, the world's rulesProfile enables the homebrew source", async () => {
    const app = await getTestApp();
    const { worldId: w3 } = await createWorldWithGm(gm.id);
    const expectedSource = homebrewSourceCode(w3);

    const upload = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${w3}/homebrew/items`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { items: [{ name: 'Sunfire Amulet' }] },
    });
    expect(upload.statusCode).toBe(201);

    const worldRes = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${w3}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(worldRes.statusCode).toBe(200);
    expect(worldRes.json().rulesProfile.sources[expectedSource]).toBe(true);
  });
});

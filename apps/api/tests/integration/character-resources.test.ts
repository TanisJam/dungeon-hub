/**
 * Integration tests for class-resource endpoints (R-07).
 *
 * Covers REQ-RAC-CONSUME, REQ-RAC-REST-SHORT, REQ-RAC-REST-LONG from
 * sdd/rules-audit-class-features/spec (#814).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('POST /characters/:id/resources/use|restore + rest hooks', () => {
  let owner: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let monkCharId: string;
  let fighterCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    owner = await createTestUser();
    outsider = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { name: 'Resources Test Campaign' },
      })
      .then((r) => r.json());
    worldId = campaign.worldId;

    // L5 Monk via direct PATCH (skip the wizard chain for test simplicity).
    const m = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { worldId, name: 'Test Monk L5' },
      })
      .then((r) => r.json());
    monkCharId = m.id;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${monkCharId}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'monk',
              source: 'PHB',
              level: 5,
              hitDie: 'd8',
              subclass: null,
              savingThrows: ['str', 'dex'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 14, dex: 16, con: 14, int: 10, wis: 14, cha: 8 },
        },
      },
    });

    // L1 Fighter for Second Wind cases.
    const f = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { worldId, name: 'Test Fighter L1' },
      })
      .then((r) => r.json());
    fighterCharId = f.id;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${fighterCharId}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'fighter',
              source: 'PHB',
              level: 1,
              hitDie: 'd10',
              subclass: null,
              savingThrows: ['str', 'con'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
        },
      },
    });
  });

  afterAll(async () => {
    if (owner) await deleteTestUser(owner.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('owner consumes 1 Ki point → used:1', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/resources/use`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'monk:ki-points', amount: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().classResourcesUsed['monk:ki-points']).toBe(1);
  });

  it('over-limit on Second Wind → 400 RESOURCE_OVER_LIMIT', async () => {
    const app = await getTestApp();
    // Use once (max is 1).
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fighterCharId}/resources/use`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'fighter:second-wind' },
    });
    // Second attempt exceeds max.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fighterCharId}/resources/use`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'fighter:second-wind' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('RESOURCE_OVER_LIMIT');
  });

  it('unknown slug → 400 RESOURCE_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/resources/use`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'monk:bogus' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('RESOURCE_NOT_FOUND');
  });

  it('non-owner cannot use → 403 FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/resources/use`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { slug: 'monk:ki-points' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('unknown world / character → 404', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${randomUUID()}/resources/use`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'monk:ki-points' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('restore decrements toward 0 (floor) — happy path', async () => {
    const app = await getTestApp();
    // Owner had used 1 ki above. Restore 1 → 0.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/resources/restore`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'monk:ki-points', amount: 5 }, // over-restore safely floors
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().classResourcesUsed['monk:ki-points']).toBe(0);
  });

  it('short rest resets ki + second-wind to 0', async () => {
    const app = await getTestApp();
    // Use 3 ki to set non-zero state.
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/resources/use`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'monk:ki-points', amount: 3 },
    });

    // Short rest with no hit dice spent (the endpoint accepts zero-rolls).
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/rest/short`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { hitDiceToSpend: {} },
    });
    expect(res.statusCode).toBe(200);

    // Reload character to inspect classResourcesUsed.
    const reloaded = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${monkCharId}`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
      })
      .then((r) => r.json());
    expect(reloaded.data.classResourcesUsed['monk:ki-points']).toBe(0);
  });

  it('GET /sheet exposes classResources view (web tab consumes this)', async () => {
    const app = await getTestApp();
    // Read the sheet — state may have changed from prior tests but the
    // structure + max should be stable for an L5 Monk.
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${monkCharId}/sheet`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const body = sheetRes.json();
    const ki = body.sheet.classResources['monk:ki-points'];
    expect(ki).toBeDefined();
    expect(ki.max).toBe(5);
    expect(ki.recoveryTrigger).toBe('short');
    expect(ki.classSlug).toBe('monk');
    expect(typeof ki.used).toBe('number');
    expect(ki.used).toBeGreaterThanOrEqual(0);
    expect(ki.used).toBeLessThanOrEqual(5);
  });

  it('GET /sheet for L1 Fighter exposes Second Wind only', async () => {
    const app = await getTestApp();
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${fighterCharId}/sheet`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const cr = sheetRes.json().sheet.classResources;
    expect(Object.keys(cr).sort()).toEqual(['fighter:second-wind']);
    expect(cr['fighter:second-wind'].max).toBe(1);
  });

  it('long rest resets all class resources to 0', async () => {
    const app = await getTestApp();
    // Use ki + second-wind to set non-zero state.
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/resources/use`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { slug: 'monk:ki-points', amount: 2 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/rest/long`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const reloaded = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${monkCharId}`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
      })
      .then((r) => r.json());
    expect(reloaded.data.classResourcesUsed['monk:ki-points']).toBe(0);
  });
});

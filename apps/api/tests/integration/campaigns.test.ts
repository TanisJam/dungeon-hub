import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('campaigns', () => {
  let user: TestUser;

  beforeAll(async () => {
    await getTestApp();
    user = await createTestUser();
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('returns 401 without token', async () => {
    const app = await getTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/campaigns' });
    expect(res.statusCode).toBe(401);
  });

  it('creates a campaign with default Rules Profile', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: 'Test Campaign' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.name).toBe('Test Campaign');
    expect(body.gmUserId).toBe(user.id);

    // Default profile: sources que decidimos en CONSTRAINTS.md
    expect(body.rulesProfile.sources.PHB).toBe(true);
    expect(body.rulesProfile.sources.TCE).toBe(true);
    expect(body.rulesProfile.sources.MPMM).toBe(true);
    expect(body.rulesProfile.variantRules.multiclassing).toBe(true);
    expect(body.rulesProfile.variantRules.feats).toBe(true);
    expect(body.rulesProfile.variantRules.tashasCustomOrigin).toBe(false);
    expect(body.rulesProfile.hpOnLevelUp).toBe('player-choice');
  });

  it('lists only campaigns where the user is a member', async () => {
    const app = await getTestApp();

    // Crear dos campañas
    for (const name of ['Campaign A', 'Campaign B']) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(Array.isArray(data)).toBe(true);
    // Al menos las 2 que acabamos de crear (puede haber más del test anterior)
    const names = data.map((c: { name: string }) => c.name);
    expect(names).toContain('Campaign A');
    expect(names).toContain('Campaign B');
    // Todas las campañas que vemos somos miembros
    for (const c of data) {
      expect(c.gmUserId).toBe(user.id);
      expect(c.memberRole).toBe('gm');
    }
  });
});

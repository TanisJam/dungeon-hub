import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

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

  // ── v3 aggregations (spec campanas-v3: ACLE-FIELDS-01, ACLE-PENDING-FICHAS-DM-ONLY-02) ──

  describe('GET /campaigns — v3 aggregations', () => {
    it('T1: row includes playersCount + sessionsCount + nextSession (ACLE-FIELDS-01)', async () => {
      const app = await getTestApp();
      // Create campaign as user
      const created = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { name: 'Counts Test Campaign' },
        })
        .then((r) => r.json());

      // Add 3 player members via helper
      const p1 = await createTestUser();
      const p2 = await createTestUser();
      const p3 = await createTestUser();
      try {
        await addCampaignAndWorldMember(created.id, p1.id, 'player');
        await addCampaignAndWorldMember(created.id, p2.id, 'player');
        await addCampaignAndWorldMember(created.id, p3.id, 'player');

        // Insert 2 completed sessions directly via DB
        const { db } = await import('../../src/infra/db/client.js');
        const { sessions } = await import('../../src/infra/db/schema.js');
        await db.insert(sessions).values([
          { campaignId: created.id, gmUserId: user.id, title: 'S1', status: 'completed' },
          { campaignId: created.id, gmUserId: user.id, title: 'S2', status: 'completed' },
        ]);

        const list = await app
          .inject({
            method: 'GET',
            url: '/api/v1/campaigns',
            headers: { authorization: `Bearer ${user.accessToken}` },
          })
          .then((r) => r.json());
        const row = list.data.find((c: { id: string }) => c.id === created.id);
        expect(row).toBeDefined();
        expect(row.playersCount).toBe(3);
        expect(row.sessionsCount).toBe(2);
      } finally {
        await deleteTestUser(p1.id);
        await deleteTestUser(p2.id);
        await deleteTestUser(p3.id);
      }
    });

    it('T2: one-shot fresh — playersCount/sessionsCount=0, nextSession=null (memory #1031)', async () => {
      const app = await getTestApp();
      const created = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { name: 'One-shot Fresh' },
        })
        .then((r) => r.json());

      const list = await app
        .inject({
          method: 'GET',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
        })
        .then((r) => r.json());
      const row = list.data.find((c: { id: string }) => c.id === created.id);
      expect(row.playersCount).toBe(0);
      expect(row.sessionsCount).toBe(0);
      expect(row.nextSession).toBeNull();
    });

    it('T4: GET /campaigns/:id includes members[] (ACDM-MEMBERS-01)', async () => {
      const app = await getTestApp();
      const created = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { name: 'Members Test Campaign' },
        })
        .then((r) => r.json());

      const p1 = await createTestUser();
      const p2 = await createTestUser();
      try {
        await addCampaignAndWorldMember(created.id, p1.id, 'player');
        await addCampaignAndWorldMember(created.id, p2.id, 'player');

        const res = await app
          .inject({
            method: 'GET',
            url: `/api/v1/campaigns/${created.id}`,
            headers: { authorization: `Bearer ${user.accessToken}` },
          })
          .then((r) => r.json());
        expect(Array.isArray(res.members)).toBe(true);
        expect(res.members).toHaveLength(3);
        const roles = res.members.map((m: { role: string }) => m.role).sort();
        expect(roles).toEqual(['gm', 'player', 'player']);
        const usernames = res.members.map((m: { username: string }) => m.username);
        const expectedP1 = p1.email.split('@')[0];
        const expectedP2 = p2.email.split('@')[0];
        expect(usernames).toContain(expectedP1);
        expect(usernames).toContain(expectedP2);
        for (const m of res.members) {
          expect(m.userId).toMatch(/^[0-9a-f-]{36}$/);
          expect(m.joinedAt).toBeDefined();
        }
      } finally {
        await deleteTestUser(p1.id);
        await deleteTestUser(p2.id);
      }
    });

    it('T3: pendingFichas computed only for GM caller (ACLE-PENDING-FICHAS-DM-ONLY-02)', async () => {
      const app = await getTestApp();
      const created = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { name: 'Pending Fichas Test' },
        })
        .then((r) => r.json());

      // Add player member (B)
      const playerB = await createTestUser();
      try {
        await addCampaignAndWorldMember(created.id, playerB.id, 'player');

        // Seed 2 pending_approval characters in the world (as playerB)
        for (const name of ['Pend One', 'Pend Two']) {
          const c = await app
            .inject({
              method: 'POST',
              url: '/api/v1/characters',
              headers: { authorization: `Bearer ${playerB.accessToken}` },
              payload: { worldId: created.worldId, name },
            })
            .then((r) => r.json());
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/characters/${c.id}`,
            headers: { authorization: `Bearer ${playerB.accessToken}` },
            payload: { status: 'pending_approval' },
          });
        }

        // GM sees count
        const gmList = await app
          .inject({
            method: 'GET',
            url: '/api/v1/campaigns',
            headers: { authorization: `Bearer ${user.accessToken}` },
          })
          .then((r) => r.json());
        const gmRow = gmList.data.find((c: { id: string }) => c.id === created.id);
        expect(gmRow.pendingFichas).toBe(2);

        // Player sees null
        const plList = await app
          .inject({
            method: 'GET',
            url: '/api/v1/campaigns',
            headers: { authorization: `Bearer ${playerB.accessToken}` },
          })
          .then((r) => r.json());
        const plRow = plList.data.find((c: { id: string }) => c.id === created.id);
        expect(plRow.pendingFichas).toBeNull();
      } finally {
        await deleteTestUser(playerB.id);
      }
    });
  });
});

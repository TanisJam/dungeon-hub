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
        // ACLE-BACKCOMPAT-03: prior fields preserved alongside new ones
        expect(row.id).toBe(created.id);
        expect(row.name).toBe('Counts Test Campaign');
        expect(row.gmUserId).toBe(user.id);
        expect(row.worldId).toBe(created.worldId);
        expect(row.memberRole).toBe('gm');
        expect(row.createdAt).toBeDefined();
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
        // ACDM-BACKCOMPAT-02: prior fields preserved alongside members[]
        expect(res.id).toBe(created.id);
        expect(res.name).toBe('Members Test Campaign');
        expect(res.gmUserId).toBe(user.id);
        expect(res.worldId).toBe(created.worldId);
        expect(res.rulesProfile).toBeDefined();
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

    // ── worldId branch (REQ-CIW-01) ──────────────────────────────────────────

    describe('POST /campaigns — worldId branch', () => {
      let gmUser: TestUser;
      let playerUser: TestUser;
      let nonMemberUser: TestUser;
      let existingWorldId: string;

      beforeAll(async () => {
        const app = await getTestApp();
        gmUser = await createTestUser();
        playerUser = await createTestUser();
        nonMemberUser = await createTestUser();

        // Create an existing world+campaign via the atomic path (no worldId)
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${gmUser.accessToken}` },
          payload: { name: 'Existing World Campaign' },
        });
        const body = res.json<{ worldId: string }>();
        existingWorldId = body.worldId;

        // Add playerUser as a world+campaign member (player role, NOT gm)
        const campaignId = res.json<{ id: string }>().id;
        await addCampaignAndWorldMember(campaignId, playerUser.id, 'player');
      });

      afterAll(async () => {
        if (gmUser) await deleteTestUser(gmUser.id);
        if (playerUser) await deleteTestUser(playerUser.id);
        if (nonMemberUser) await deleteTestUser(nonMemberUser.id);
      });

      it('(a) no worldId → creates new world+campaign (existing atomic path preserved)', async () => {
        const app = await getTestApp();
        const { db } = await import('../../src/infra/db/client.js');
        const { worlds } = await import('../../src/infra/db/schema.js');
        const { eq } = await import('drizzle-orm');
        // Count only gmUser's worlds — same reason (b) below does: an unfiltered count
        // races against the other forks under maxForks:4, which create and delete worlds
        // of their own between these two reads.
        const countBefore = await db.select().from(worlds).where(eq(worlds.ownerUserId, gmUser.id));

        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${gmUser.accessToken}` },
          payload: { name: 'No WorldId Campaign' },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json<{ id: string; worldId: string }>();
        expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.worldId).toMatch(/^[0-9a-f-]{36}$/);
        // A NEW world must have been created (different from existingWorldId)
        expect(body.worldId).not.toBe(existingWorldId);

        const countAfter = await db.select().from(worlds).where(eq(worlds.ownerUserId, gmUser.id));
        expect(countAfter.length).toBeGreaterThan(countBefore.length);
      });

      it('(b) worldId + caller is GM → creates campaign under existing world, no new world created', async () => {
        const app = await getTestApp();
        const { db } = await import('../../src/infra/db/client.js');
        const { worlds } = await import('../../src/infra/db/schema.js');
        const { eq } = await import('drizzle-orm');
        // Count only gmUser's worlds to avoid counting worlds created by other concurrent
        // test forks (maxForks:4 parallelism — the global count races under parallel execution).
        const worldsBefore = await db.select().from(worlds).where(eq(worlds.ownerUserId, gmUser.id));

        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${gmUser.accessToken}` },
          payload: { name: 'Session 0', worldId: existingWorldId },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json<{ id: string; worldId: string; name: string }>();
        expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.name).toBe('Session 0');
        // Must be under the EXISTING world, not a new one
        expect(body.worldId).toBe(existingWorldId);

        // No new world row must have been inserted for this user
        const worldsAfter = await db.select().from(worlds).where(eq(worlds.ownerUserId, gmUser.id));
        expect(worldsAfter.length).toBe(worldsBefore.length);
      });

      it('(c) worldId + caller is player member (NOT GM) → 403', async () => {
        const app = await getTestApp();
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${playerUser.accessToken}` },
          payload: { name: 'Player Should Fail', worldId: existingWorldId },
        });

        expect(res.statusCode).toBe(403);
        const body = res.json<{ error: string; issues: { code: string }[] }>();
        expect(body.error).toBe('FORBIDDEN');
        expect(body.issues[0]?.code).toBe('WORLD_GM_REQUIRED');
      });

      it('(d) worldId + caller is NOT a member → 403', async () => {
        const app = await getTestApp();
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${nonMemberUser.accessToken}` },
          payload: { name: 'Non Member Should Fail', worldId: existingWorldId },
        });

        expect(res.statusCode).toBe(403);
        const body = res.json<{ error: string; issues: { code: string }[] }>();
        expect(body.error).toBe('FORBIDDEN');
        expect(body.issues[0]?.code).toBe('WORLD_GM_REQUIRED');
      });
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

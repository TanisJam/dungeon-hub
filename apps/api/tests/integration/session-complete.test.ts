import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Slice 4 — POST /sessions/:id/complete con rewards.
 *
 * Distribuye XP per-player, gold per-player, e items específicos a chars.
 * Genera events automáticos (xp_award, gold_grant, item_grant) y cierra la
 * sesión con status='completed' + summary (auto-generado si no viene en body).
 */
describe('sessions — Slice 4 (complete + rewards)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let worldId: string;
  let aliceCharId: string;
  let bobCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    bob = await createTestUser();
    outsider = await createTestUser();

    const completeCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Complete Campaign' },
      })
      .then((r) => r.json());
    campaignId = completeCampaign.id;
    worldId = completeCampaign.worldId;

    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values([
      { campaignId, userId: alice.id, role: 'player' },
      { campaignId, userId: bob.id, role: 'player' },
    ]);

    aliceCharId = await makeChar(alice, 'Alice');
    bobCharId = await makeChar(bob, 'Bob');
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  async function makeChar(user: TestUser, name: string): Promise<string> {
    const app = await getTestApp();
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId, name: `${name} ${Math.random()}` },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 14, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });
    return c.id;
  }

  async function setupActiveSession(
    title: string,
    charA?: string,
    charB?: string,
  ): Promise<string> {
    const app = await getTestApp();
    const sessionId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title },
        })
        .then((r) => r.json())
    ).id;

    if (charA) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: charA },
      });
    }
    if (charB) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
        payload: { characterId: charB },
      });
    }
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    return sessionId;
  }

  async function getEvents(sessionId: string): Promise<any[]> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    return res.json().data;
  }

  async function loadChar(id: string): Promise<any> {
    const app = await getTestApp();
    return app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      })
      .then((r) => r.json());
  }

  // ---- Happy path -------------------------------------------------------
  it('complete distribuye XP, gold e items + cierra sesión', async () => {
    const app = await getTestApp();
    // chars frescos por cada test para no chocar con state previo
    const aId = await makeChar(alice, 'A1');
    const bId = await makeChar(bob, 'B1');
    const sessionId = await setupActiveSession('Full Complete', aId, bId);

    const charBefore = await loadChar(aId);
    const xpBefore = charBefore.xp ?? 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {
        summary: 'El party limpió las ruinas de Kelthara',
        rewards: {
          xpPerPlayer: 500,
          goldPerPlayer: 75,
          items: [
            { characterId: aId, slug: 'longsword', source: 'PHB' },
            { characterId: bId, slug: 'potion-of-healing', source: 'DMG', quantity: 2 },
          ],
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const session = res.json();
    expect(session.status).toBe('completed');
    expect(session.endedAt).not.toBeNull();
    expect(session.summary).toBe('El party limpió las ruinas de Kelthara');
    expect(session.rewards.xpPerPlayer).toBe(500);

    // Chars actualizados.
    const aliceAfter = await loadChar(aId);
    expect(aliceAfter.xp).toBe(xpBefore + 500);
    expect(aliceAfter.data.currency.gp).toBe(75);
    const longsword = aliceAfter.inventory.find((it: any) => it.itemSlug === 'longsword');
    expect(longsword).toBeDefined();

    const bobAfter = await loadChar(bId);
    const potion = bobAfter.inventory.find((it: any) => it.itemSlug === 'potion-of-healing');
    expect(potion.quantity).toBe(2);

    // Events generados.
    const events = await getEvents(sessionId);
    const xpAwards = events.filter((e) => e.eventType === 'xp_award');
    const goldGrants = events.filter((e) => e.eventType === 'gold_grant');
    const itemGrants = events.filter((e) => e.eventType === 'item_grant');
    expect(xpAwards.length).toBe(2);
    expect(goldGrants.length).toBe(2);
    expect(itemGrants.length).toBe(2);
  });

  it('complete sin rewards solo cierra + auto-summary', async () => {
    const app = await getTestApp();
    const aId = await makeChar(alice, 'A2');
    const sessionId = await setupActiveSession('Empty Rewards', aId);

    // Aniade un note manual para que el auto-summary tenga algo.
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { eventType: 'note', payload: { text: 'Charla casual' } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
    expect(res.json().summary).toMatch(/note/);
  });

  it('complete desde paused funciona', async () => {
    const app = await getTestApp();
    const aId = await makeChar(alice, 'A3');
    const sessionId = await setupActiveSession('Pause Complete', aId);
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/pause`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { rewards: { xpPerPlayer: 100 } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });

  // ---- Validaciones -----------------------------------------------------
  it('player NO puede completar', async () => {
    const app = await getTestApp();
    const aId = await makeChar(alice, 'A4');
    const sessionId = await setupActiveSession('Player Block', aId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('complete sobre sesión scheduled → 400 INVALID_STATE_TRANSITION', async () => {
    const app = await getTestApp();
    const sessionId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title: 'Never Started' },
        })
        .then((r) => r.json())
    ).id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('INVALID_STATE_TRANSITION');
  });

  it('complete dos veces → 400', async () => {
    const app = await getTestApp();
    const aId = await makeChar(alice, 'A5');
    const sessionId = await setupActiveSession('Double Complete', aId);
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {},
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {},
    });
    expect(second.statusCode).toBe(400);
  });

  it('item reward a char NO participant → 400 ITEM_REWARD_INVALID_RECIPIENT', async () => {
    const app = await getTestApp();
    const aId = await makeChar(alice, 'A6');
    const bId = await makeChar(bob, 'B6'); // NOT joined
    const sessionId = await setupActiveSession('Bad Recipient', aId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {
        rewards: {
          items: [{ characterId: bId, slug: 'longsword', source: 'PHB' }],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('ITEM_REWARD_INVALID_RECIPIENT');
  });

  it('item slug inexistente → 400 ITEM_NOT_FOUND', async () => {
    const app = await getTestApp();
    const aId = await makeChar(alice, 'A7');
    const sessionId = await setupActiveSession('Bad Item', aId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {
        rewards: {
          items: [{ characterId: aId, slug: 'wand-of-nonsense', source: 'XXX' }],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('ITEM_NOT_FOUND');
  });

  it('outsider → 403', async () => {
    const app = await getTestApp();
    const aId = await makeChar(alice, 'A8');
    const sessionId = await setupActiveSession('Outsider Block', aId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});

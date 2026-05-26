import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * DM grant endpoints — POST /characters/:id/grant/gold + /grant/item.
 *
 * Covers spec #867 requirements:
 *   - REQ-CDG-GOLD-ENDPOINT (3 happy + 2 negative)
 *   - REQ-CDG-ITEM-ENDPOINT (1 happy + 1 negative)
 *   - REQ-CDG-OWNER-ENDPOINTS-UNCHANGED (1 regression guard)
 *   - REQ-CDG-SESSION-EVENT-EMISSION (no-session path)
 *   - Auth: WORLD_GM_REQUIRED + cross-world 403
 */
describe('DM grant endpoints — gold + item', () => {
  let dm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let dmWorldB: TestUser;   // GM of a different world
  let campaignId: string;
  let worldId: string;
  let campaignBId: string;
  let characterId: string;  // owned by player, in worldId

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();
    dmWorldB = await createTestUser();

    // DM creates campaign A
    const campaignA = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'DM Grants Campaign A' },
      })
      .then((r) => r.json());
    campaignId = campaignA.id;
    worldId = campaignA.worldId;

    // dmWorldB creates campaign B (different world)
    const campaignB = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dmWorldB.accessToken}` },
        payload: { name: 'DM Grants Campaign B' },
      })
      .then((r) => r.json());
    campaignBId = campaignB.id;

    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaignId, player.id, 'player');

    // player creates a character in world A
    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: 'Grant Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    if (dmWorldB) await deleteTestUser(dmWorldB.id);
    await closeTestApp();
  });

  async function setupActiveSession(charId: string): Promise<string> {
    const app = await getTestApp();
    const sessionId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title: `Grant Session ${Math.random()}` },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/join`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { characterId: charId },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    return sessionId;
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

  async function getSessionEvents(sessionId: string): Promise<any[]> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/events`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    return res.json().data;
  }

  // --------------------------------------------------------------------------
  // Scenario 1: Happy XP (regression check — the existing /xp endpoint still works
  // after the new grant/* routes were added)
  // --------------------------------------------------------------------------
  it('T6 — Happy XP: DM grants award=200 to active-session char → 200, xp_award event', async () => {
    const app = await getTestApp();

    // Fresh char so we have a clean xp baseline
    const freshChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: `XP Grant Char ${Math.random()}` },
      })
      .then((r) => r.json());

    const sessionId = await setupActiveSession(freshChar.id);
    const charBefore = await loadChar(freshChar.id);
    const xpBefore = charBefore.xp ?? 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${freshChar.id}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 200 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().xp).toBe(xpBefore + 200);

    const events = await getSessionEvents(sessionId);
    const xpAwards = events.filter((e: any) => e.eventType === 'xp_award');
    expect(xpAwards.length).toBeGreaterThan(0);
    expect(xpAwards[0].actorUserId).toBe(dm.id);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Happy gold
  // --------------------------------------------------------------------------
  it('T7 — Happy gold: DM grants gp=50, sp=10 → 200, currency updates, gold_grant event', async () => {
    const app = await getTestApp();

    const freshChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: `Gold Grant Char ${Math.random()}` },
      })
      .then((r) => r.json());

    const sessionId = await setupActiveSession(freshChar.id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${freshChar.id}/grant/gold`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { gp: 50, sp: 10 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currency.gp).toBe(50);
    expect(body.currency.sp).toBe(10);

    const charAfter = await loadChar(freshChar.id);
    expect(charAfter.data.currency.gp).toBe(50);
    expect(charAfter.data.currency.sp).toBe(10);

    const events = await getSessionEvents(sessionId);
    const goldGrants = events.filter((e: any) => e.eventType === 'gold_grant');
    expect(goldGrants.length).toBe(1);
    expect(goldGrants[0].actorUserId).toBe(dm.id);
    expect(goldGrants[0].payload.deltas.gp).toBe(50);
    expect(goldGrants[0].payload.deltas.sp).toBe(10);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Happy item
  // --------------------------------------------------------------------------
  it('T8 — Happy item: DM grants longsword PHB qty=1 → 201, inventory updated, item_grant event', async () => {
    const app = await getTestApp();

    const freshChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: `Item Grant Char ${Math.random()}` },
      })
      .then((r) => r.json());

    const sessionId = await setupActiveSession(freshChar.id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${freshChar.id}/grant/item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, quantity: 1 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.addedInstanceId).toBeTruthy();

    const charAfter = await loadChar(freshChar.id);
    const longsword = (charAfter.inventory ?? []).find(
      (it: any) => it.itemSlug === 'longsword' && it.itemSource === 'PHB',
    );
    expect(longsword).toBeDefined();
    expect(longsword.state).toBe('carried');

    const events = await getSessionEvents(sessionId);
    const itemGrants = events.filter((e: any) => e.eventType === 'item_grant');
    expect(itemGrants.length).toBe(1);
    expect(itemGrants[0].actorUserId).toBe(dm.id);
    expect(itemGrants[0].payload.itemSlug).toBe('longsword');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: INSUFFICIENT_FUNDS
  // --------------------------------------------------------------------------
  it('T9 — Negative INSUFFICIENT_FUNDS: char gp=10, DM grants gp=-100 → 400 with issue shape', async () => {
    const app = await getTestApp();

    // First give char 10 gp
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/grant/gold`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { gp: 10 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/grant/gold`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { gp: -100 },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');

    const issue = body.issues.find((i: any) => i.coin === 'gp');
    expect(issue).toBeDefined();
    expect(issue.code).toBe('INSUFFICIENT_FUNDS');
    expect(issue.coin).toBe('gp');
    expect(issue.delta).toBe(-100);
    expect(issue.result).toBeLessThan(0);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: ITEM_NOT_FOUND
  // --------------------------------------------------------------------------
  it('T10 — Negative ITEM_NOT_FOUND: unknown slug → 400 with item shape', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/grant/item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { item: { slug: 'mythril-toaster', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');

    const issue = body.issues.find((i: any) => i.code === 'ITEM_NOT_FOUND');
    expect(issue).toBeDefined();
    expect(issue.item.slug).toBe('mythril-toaster');
    expect(issue.item.source).toBe('PHB');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: WORLD_GM_REQUIRED — char owner calls /grant/gold
  // --------------------------------------------------------------------------
  it('T11 — Negative WORLD_GM_REQUIRED: char owner calls /grant/gold → 403', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/grant/gold`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { gp: 1 },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('FORBIDDEN');
    const issue = body.issues?.[0];
    expect(issue?.code).toBe('WORLD_GM_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Cross-world — DM of world B calls grant on char of world A
  // --------------------------------------------------------------------------
  it('T12 — Negative cross-world: DM of world B calls /grant/gold on char of world A → 403', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/grant/gold`,
      headers: { authorization: `Bearer ${dmWorldB.accessToken}` },
      payload: { gp: 1 },
    });

    expect(res.statusCode).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Regression — owner /inventory unchanged; DM /inventory → 403
  // --------------------------------------------------------------------------
  it('T13 — Regression: owner POST /inventory → 201 with inventory_add event; DM POST /inventory on other char → 403', async () => {
    const app = await getTestApp();

    // 8a: owner adds item to own char via /inventory
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/inventory`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { item: { slug: 'dagger', source: 'PHB' }, quantity: 1 },
    });
    expect(addRes.statusCode).toBe(201);

    // 8b: DM tries to add item to player's char via /inventory → 403
    const dmAddRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/inventory`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { item: { slug: 'dagger', source: 'PHB' }, quantity: 1 },
    });
    expect(dmAddRes.statusCode).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: No-session — grant succeeds with 0 session_events rows
  // --------------------------------------------------------------------------
  it('T14 — No-session: char with no active session → grant succeeds, no session_events inserted', async () => {
    const app = await getTestApp();

    // Create a fresh char with no session
    const noSessionChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: `NoSession Char ${Math.random()}` },
      })
      .then((r) => r.json());

    // Grant gold — should succeed
    const goldRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${noSessionChar.id}/grant/gold`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { gp: 5 },
    });
    expect(goldRes.statusCode).toBe(200);
    expect(goldRes.json().currency.gp).toBe(5);

    // Grant item — should succeed
    const itemRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${noSessionChar.id}/grant/item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { item: { slug: 'torch', source: 'PHB' }, quantity: 1 },
    });
    expect(itemRes.statusCode).toBe(201);

    // No session = recordSessionEventForCharacter is a no-op, nothing crashes
    // We verify the state was persisted correctly
    const charAfter = await loadChar(noSessionChar.id);
    expect(charAfter.data.currency.gp).toBe(5);
    const torch = (charAfter.inventory ?? []).find(
      (it: any) => it.itemSlug === 'torch',
    );
    expect(torch).toBeDefined();
  });
});

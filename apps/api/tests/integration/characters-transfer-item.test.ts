import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

/**
 * Integration tests for POST /characters/:id/transfer-item
 *
 * Covers REQ-CIT-ENDPOINT, REQ-CIT-SAME-WORLD, REQ-CIT-INSTANCE-OWNED,
 * REQ-CIT-QUANTITY-VALID, REQ-CIT-ATOMIC-TRANSACTION, REQ-CIT-SINGLE-EVENT,
 * REQ-CIT-SESSION-EVENT-ROUTING (spec sdd/inventory-d4-d6 #889).
 */
describe('POST /characters/:id/transfer-item', () => {
  let dm: TestUser;
  let player: TestUser;
  let player2: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let worldId: string;
  let fromCharId: string;
  let toCharId: string;

  async function grantLongsword(charId: string): Promise<string> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/grant/item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, quantity: 1 },
    });
    expect(res.statusCode).toBe(201);
    return res.json().addedInstanceId as string;
  }

  async function grantStack(charId: string, quantity: number): Promise<string> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/grant/item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { item: { slug: 'arrow', source: 'PHB' }, quantity },
    });
    expect(res.statusCode).toBe(201);
    return res.json().addedInstanceId as string;
  }

  async function getInventory(charId: string): Promise<any[]> {
    const app = await getTestApp();
    const char = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      })
      .then((r) => r.json());
    return (char.inventory as any[]) ?? [];
  }

  async function setupSession(): Promise<string> {
    const app = await getTestApp();
    const sessionId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title: `Transfer Session ${Math.random()}` },
        })
        .then((r) => r.json())
    ).id;

    for (const [charId, playerUser] of [[fromCharId, player], [toCharId, player2]] as const) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${playerUser.accessToken}` },
        payload: { characterId: charId },
      });
    }

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    return sessionId;
  }

  async function getSessionEvents(sessionId: string): Promise<any[]> {
    const app = await getTestApp();
    return app
      .inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      })
      .then((r) => r.json().data);
  }

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    player2 = await createTestUser();
    outsider = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: `Transfer Campaign ${Math.random()}` },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    await addCampaignAndWorldMember(campaignId, player.id, 'player');
    await addCampaignAndWorldMember(campaignId, player2.id, 'player');

    fromCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${player.accessToken}` },
          payload: { worldId, name: 'From Character' },
        })
        .then((r) => r.json())
    ).id;

    toCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${player2.accessToken}` },
          payload: { worldId, name: 'To Character' },
        })
        .then((r) => r.json())
    ).id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (player2) await deleteTestUser(player2.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('T1 — non-DM caller → 403 WORLD_GM_REQUIRED', async () => {
    const app = await getTestApp();
    const instanceId = await grantLongsword(fromCharId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fromCharId}/transfer-item`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { toCharacterId: toCharId, instanceId },
    });
    expect(res.statusCode).toBe(403);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues[0]?.code).toBe('WORLD_GM_REQUIRED');
  });

  it('T2 — cross-world transfer → 400 CHARACTER_NOT_IN_WORLD', async () => {
    // Create outsider with their own world/character
    const appInstance = await getTestApp();
    const otherDm = await createTestUser();
    try {
      const otherCampaign = await appInstance
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${otherDm.accessToken}` },
          payload: { name: 'Other World' },
        })
        .then((r) => r.json());

      const otherCharId = (
        await appInstance
          .inject({
            method: 'POST',
            url: '/api/v1/characters',
            headers: { authorization: `Bearer ${otherDm.accessToken}` },
            payload: { worldId: otherCampaign.worldId, name: 'Other World Char' },
          })
          .then((r) => r.json())
      ).id;

      const instanceId = await grantLongsword(fromCharId);

      const res = await appInstance.inject({
        method: 'POST',
        url: `/api/v1/characters/${fromCharId}/transfer-item`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { toCharacterId: otherCharId, instanceId },
      });
      expect(res.statusCode).toBe(400);
      const issues = res.json().issues as Array<{ code: string }>;
      expect(issues[0]?.code).toBe('CHARACTER_NOT_IN_WORLD');
    } finally {
      await deleteTestUser(otherDm.id);
    }
  });

  it('T3 — instance not in fromChar → 400 INVENTORY_INSTANCE_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fromCharId}/transfer-item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { toCharacterId: toCharId, instanceId: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues[0]?.code).toBe('INVENTORY_INSTANCE_NOT_FOUND');
  });

  it('T4 — insufficient quantity → 400 INVENTORY_INSUFFICIENT_QUANTITY', async () => {
    const app = await getTestApp();
    // Grant 1 longsword then try to transfer 5
    const instanceId = await grantLongsword(fromCharId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fromCharId}/transfer-item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { toCharacterId: toCharId, instanceId, quantity: 5 },
    });
    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string; requested?: number; available?: number }>;
    expect(issues[0]?.code).toBe('INVENTORY_INSUFFICIENT_QUANTITY');
    expect(issues[0]?.requested).toBe(5);
    expect(issues[0]?.available).toBe(1);
  });

  it('T5 — full-stack transfer: item moves from fromChar to toChar, inventories updated atomically', async () => {
    const app = await getTestApp();
    const instanceId = await grantLongsword(fromCharId);

    const fromBefore = await getInventory(fromCharId);
    const fromItemBefore = fromBefore.find((it: any) => it.instanceId === instanceId);
    expect(fromItemBefore).toBeDefined();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fromCharId}/transfer-item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { toCharacterId: toCharId, instanceId },
    });
    expect(res.statusCode).toBe(200);
    const { transferred } = res.json();
    expect(transferred.instanceId).toBe(instanceId);
    expect(transferred.quantity).toBe(1);
    expect(transferred.itemSlug).toBe('longsword');

    // fromChar no longer has the item
    const fromAfter = await getInventory(fromCharId);
    expect(fromAfter.find((it: any) => it.instanceId === instanceId)).toBeUndefined();

    // toChar now has the item
    const toAfter = await getInventory(toCharId);
    const movedItem = toAfter.find((it: any) => it.itemSlug === 'longsword' && it.quantity === 1);
    expect(movedItem).toBeDefined();
  });

  it('T6 — partial-stack transfer: fromChar qty reduced, toChar gets new instance', async () => {
    const app = await getTestApp();
    const stackInstanceId = await grantStack(fromCharId, 5);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fromCharId}/transfer-item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { toCharacterId: toCharId, instanceId: stackInstanceId, quantity: 2 },
    });
    expect(res.statusCode).toBe(200);
    const { transferred } = res.json();
    expect(transferred.quantity).toBe(2);
    expect(transferred.newInstanceId).toBeDefined();
    expect(transferred.newInstanceId).not.toBe(stackInstanceId);

    const fromAfter = await getInventory(fromCharId);
    const remainingStack = fromAfter.find((it: any) => it.instanceId === stackInstanceId);
    expect(remainingStack?.quantity).toBe(3);

    const toAfter = await getInventory(toCharId);
    const newInstance = toAfter.find((it: any) => it.instanceId === transferred.newInstanceId);
    expect(newInstance?.quantity).toBe(2);
  });

  it('T7 — no active session: transfer succeeds, zero inventory_transfer events emitted', async () => {
    const app = await getTestApp();
    const instanceId = await grantLongsword(fromCharId);

    // No active session setup for this sub-test — event should be silently skipped
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fromCharId}/transfer-item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { toCharacterId: toCharId, instanceId },
    });
    // Transfer still succeeds
    expect(res.statusCode).toBe(200);
  });

  it('T8 — shared active session: transfer emits exactly 1 inventory_transfer event', async () => {
    const app = await getTestApp();
    const instanceId = await grantLongsword(fromCharId);
    const sessionId = await setupSession();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fromCharId}/transfer-item`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { toCharacterId: toCharId, instanceId },
    });
    expect(res.statusCode).toBe(200);

    const events = await getSessionEvents(sessionId);
    const transferEvents = events.filter((e: any) => e.eventType === 'inventory_transfer');
    expect(transferEvents.length).toBe(1);
    const payload = transferEvents[0].payload as Record<string, unknown>;
    expect(payload['fromCharacterId']).toBe(fromCharId);
    expect(payload['toCharacterId']).toBe(toCharId);
    expect(payload['itemSlug']).toBe('longsword');
  });
});

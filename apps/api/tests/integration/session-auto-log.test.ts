import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Slice 3 — Auto-logging "automagic".
 *
 * Cuando un character está en una sesión status='active', cualquier mutación
 * a su char se auto-loguea como event. Si la sesión está paused, scheduled,
 * completed, cancelled, o el char no está en ninguna → no se loguea.
 */
describe('sessions — Slice 3 (auto-logging)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let campaignId: string;
  let worldId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();

    const autoLogCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'AutoLog Campaign' },
      })
      .then((r) => r.json());
    campaignId = autoLogCampaign.id;
    worldId = autoLogCampaign.worldId;

    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaignId, alice.id, 'player');
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    await closeTestApp();
  });

  /** Crea char + sesión + join + (opcional) start. Devuelve {charId, sessionId}. */
  async function setupLiveSession(opts: { start: boolean; title: string }): Promise<{
    charId: string;
    sessionId: string;
  }> {
    const app = await getTestApp();
    const charId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId, name: `Alice ${opts.title}` },
        })
        .then((r) => r.json())
    ).id;

    // Setear stats + clase para que mutations en char funcionen.
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 14, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    const sessionId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title: opts.title },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/join`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: charId },
    });

    if (opts.start) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/start`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
    }

    return { charId, sessionId };
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

  // ---- XP -----------------------------------------------------------------
  it('XP award genera event xp_award', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: true, title: 'XP' });

    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 500 },
    });

    const events = await getEvents(sessionId);
    const xp = events.find((e) => e.eventType === 'xp_award');
    expect(xp).toBeDefined();
    expect(xp.payload.characterId).toBe(charId);
    expect(xp.payload.award).toBe(500);
    expect(xp.payload.after).toBe(500);
    expect(xp.actorUserId).toBe(dm.id);
  });

  // ---- Inventory ----------------------------------------------------------
  it('Inventory POST/PATCH/DELETE/consume generan events separados', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: true, title: 'Inv' });

    const add = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'potion-of-healing', source: 'DMG' }, quantity: 2 },
    });
    const instanceId = add.json().addedInstanceId;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}/inventory/${instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { notes: 'guardar para emergencias' },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${charId}/inventory/${instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'inventory_add')).toBeDefined();
    expect(events.find((e) => e.eventType === 'inventory_update')).toBeDefined();
    expect(events.find((e) => e.eventType === 'consume')).toBeDefined();
    expect(events.find((e) => e.eventType === 'inventory_remove')).toBeDefined();
  });

  // ---- Rest ---------------------------------------------------------------
  it('short rest genera event rest_short', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: true, title: 'Rest' });

    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { hitDiceToSpend: { d10: 1 }, rolls: { d10: [6] } },
    });

    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'rest_short')).toBeDefined();
  });

  it('long rest genera event rest_long', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: true, title: 'LongRest' });

    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/long`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {},
    });

    const events = await getEvents(sessionId);
    const ev = events.find((e) => e.eventType === 'rest_long');
    expect(ev).toBeDefined();
    expect(ev.payload.hpMax).toBeGreaterThan(0);
  });

  // ---- Currency -----------------------------------------------------------
  it('currency change genera event currency_change con deltas + before/after', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: true, title: 'Currency' });

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}/currency`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { gp: 50 },
    });

    const events = await getEvents(sessionId);
    const ev = events.find((e) => e.eventType === 'currency_change');
    expect(ev).toBeDefined();
    expect(ev.payload.deltas).toEqual({ gp: 50 });
    expect(ev.payload.after.gp).toBe(50);
  });

  // ---- Gates: no se loguea si la sesión no está active --------------------
  it('NO loguea si la sesión está paused', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: true, title: 'Paused' });
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/pause`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 100 },
    });

    const events = await getEvents(sessionId);
    expect(events.find((e) => e.eventType === 'xp_award')).toBeUndefined();
  });

  it('NO loguea si la sesión está scheduled (no started)', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: false, title: 'Scheduled' });

    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 100 },
    });

    const events = await getEvents(sessionId);
    expect(events.length).toBe(0);
  });

  it('NO loguea si el char no está en ninguna sesión', async () => {
    const app = await getTestApp();
    // Char libre.
    const charId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId, name: 'Free char' },
        })
        .then((r) => r.json())
    ).id;

    // No debería tirar.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 100 },
    });
    expect(res.statusCode).toBe(200);
  });

  // ---- Level-up -----------------------------------------------------------
  it('level-up genera event level_up con hpDelta', async () => {
    const app = await getTestApp();
    const { charId, sessionId } = await setupLiveSession({ start: true, title: 'LevelUp' });

    // Darle XP suficiente para L2 (300 XP).
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 300 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/classes/fighter/level-up`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { hpMethod: 'average' },
    });
    expect(res.statusCode).toBe(200);

    const events = await getEvents(sessionId);
    const ev = events.find((e) => e.eventType === 'level_up');
    expect(ev).toBeDefined();
    expect(ev.payload.classSlug).toBe('fighter');
    expect(ev.payload.newClassLevel).toBe(2);
    expect(ev.payload.hpDelta).toBeGreaterThan(0);
  });
});

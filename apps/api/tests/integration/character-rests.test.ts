import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Rests — short (hit dice → HP, recovery de pact slots) y long (HP full,
 * hit dice +floor(level/2), reset death saves, -1 exhaustion).
 */
describe('POST /characters/:id/rest', () => {
  let dm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let charId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Rest Test' },
        })
        .then((r) => r.json())
    ).id;

    // Player se une a la campaña ANTES de crear personaje (requisito de POST /characters).
    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values({ campaignId, userId: player.id, role: 'player' });

    // Fighter L3, CON 13 (mod +1). HP base: 10 + 1 + 2×(6+1) = 25.
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { campaignId, name: 'Tank' },
      })
      .then((r) => r.json());
    charId = c.id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/stats`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charId}/class`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });
    // DM otorga XP suficiente para L3 (900).
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 900 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/classes/fighter/level-up`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { hpMethod: 'average' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/classes/fighter/level-up`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        hpMethod: 'average',
        subclass: { slug: 'fighter--champion', source: 'PHB' },
      },
    });
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('Short rest gastando 2 d10 cura HP correctamente con rolls del cliente', async () => {
    const app = await getTestApp();

    // Para verificar el cambio en current necesitamos que HP no esté en max.
    // Lo más simple: PATCH data.hp directamente.
    const charPre = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    const dataBefore = charPre.data;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        data: {
          ...dataBefore,
          hp: { current: 5, max: 24, temp: 0 },
          hitDice: { d10: { total: 3, available: 3 } },
        },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        hitDiceToSpend: { d10: 2 },
        rolls: { d10: [5, 6] },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // (5+1) + (6+1) = 13 recovered
    expect(body.shortRest.hpRecovered).toBe(13);
    expect(body.shortRest.rollsUsed.d10).toEqual([5, 6]);
    // current 5 + 13 = 18, max=24, so newCurrent = 18
    expect(body.shortRest.newHp.current).toBe(18);
    expect(body.character.data.hitDice.d10.available).toBe(1);
  });

  it('Short rest sin enough hit dice → 400', async () => {
    const app = await getTestApp();
    // Forzamos a tener 1 disponible.
    const charPre = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charPre.data, hitDice: { d10: { total: 3, available: 1 } } } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { hitDiceToSpend: { d10: 2 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('NOT_ENOUGH_HIT_DICE');
  });

  it('Short rest sin spendear hit dice todavía resetea warlock slots', async () => {
    const app = await getTestApp();
    // Setear warlockSlotsUsed = 2 vía PATCH.
    const charPre = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charPre.data, warlockSlotsUsed: 2 } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().character.data.warlockSlotsUsed).toBe(0);
  });

  it('Long rest: HP a max, hit dice recovered +floor(level/2), exhaustion -1', async () => {
    const app = await getTestApp();

    // Forzar HP bajo, hitDice usado, exhaustion 3.
    const charPre = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        data: {
          ...charPre.data,
          hp: { current: 3, max: 24, temp: 0 },
          hitDice: { d10: { total: 3, available: 0 } },
          deathSaves: { successes: 2, failures: 1 },
          exhaustion: 3,
          spellSlotsUsed: [2, 1, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/long`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.character.data.hp.current).toBe(24);
    expect(body.character.data.hp.max).toBe(24);
    // L3 → floor(3/2) = 1 hit die recovered
    expect(body.longRest.hitDiceRecovered).toBe(1);
    expect(body.character.data.hitDice.d10.available).toBe(1);
    expect(body.character.data.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(body.character.data.exhaustion).toBe(2);
    expect(body.character.data.spellSlotsUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Sheet refleja exhaustion: nivel 5 fuerza speed = 0', async () => {
    const app = await getTestApp();
    const charPre = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charPre.data, exhaustion: 5 } },
    });

    const sheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}/sheet`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    expect(sheet.sheet.exhaustion.level).toBe(5);
    expect(sheet.sheet.speed.walk).toBe(0);
    expect(sheet.sheet.exhaustion.effects).toContain('speed-zero');
  });

  it('Outsider no puede hacer rest (403)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);

    const res2 = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/long`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: {},
    });
    expect(res2.statusCode).toBe(403);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { eq } from 'drizzle-orm';

/**
 * Rests — short (hit dice → HP, recovery de pact slots) y long (HP full,
 * hit dice +floor(level/2), reset death saves, -1 exhaustion).
 */
describe('POST /characters/:id/rest', () => {
  let dm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let worldId: string;
  let charId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    const restCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Rest Test' },
      })
      .then((r) => r.json());
    campaignId = restCampaign.id;
    worldId = restCampaign.worldId; // C5: POST /campaigns now returns worldId

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
        payload: { worldId, name: 'Tank' },
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

  it('Short rest con CON negativo: roll 1 + conMod -1 recupera 0 HP (PHB p.186 min 0)', async () => {
    // PHB p.186: minimum is 0, not 1. This test pins the corrected behavior.
    // CON 8 → conMod -1. Force via PATCH to simulate a character with negative conMod.
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
      payload: {
        data: {
          ...charPre.data,
          // The route reads charData['baseStats'] to compute conMod; set it directly.
          baseStats: { ...charPre.data.baseStats, con: 8 },
          hp: { current: 10, max: 24, temp: 0 },
          hitDice: { d10: { total: 3, available: 3 } },
        },
      },
    });

    // Force a roll of 1 on d10. conMod = -1 (CON 8). 1 + (-1) = 0 (clamped at 0 per PHB p.186).
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        hitDiceToSpend: { d10: 1 },
        rolls: { d10: [1] },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // PHB p.186: total = 1 + (-1) = 0, minimum 0 → hpRecovered must be 0
    expect(body.shortRest.hpRecovered).toBe(0);
    // HP must not change since recovery was 0
    expect(body.shortRest.newHp.current).toBe(10);

    // Restore CON for subsequent tests
    const charPost = await app
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
      payload: { data: { ...charPost.data, baseStats: { ...charPost.data.baseStats, con: 13 } } },
    });
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

// ---- REST-02 Integration Tests -----------------------------------------------
// REQ-R02-API-LONG-REST-DOWNED, REQ-R02-API-SHORT-REST-RECHARGES-SHORT,
// REQ-R02-API-LONG-REST-RECHARGES-LONG, REQ-R02-API-LONG-REST-RECHARGES-DAWN
// Uses synthetic compendium items with source='TEST_REST02' for safe cleanup.
describe('REST-02: HP gate + item recharge (PHB p.186 + p.141)', () => {
  let dm: TestUser;
  let player: TestUser;
  let charId: string;

  // Slugs of synthetic items seeded per test. Cleaned up in afterEach.
  const seededSlugs: string[] = [];

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();

    const restCampaign02 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'REST-02 Test' },
      })
      .then((r) => r.json());
    const campaignId = restCampaign02.id;
    const restWorldId = restCampaign02.worldId; // C5

    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values({ campaignId, userId: player.id, role: 'player' });

    // Fighter L1, CON 10 (mod 0). Simple character for rest tests.
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId: restWorldId, name: 'RestTestChar' },
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
  });

  afterEach(async () => {
    // Clean up any synthetic items seeded in this test
    if (seededSlugs.length > 0) {
      const { db } = await import('../../src/infra/db/client.js');
      const { compendiumItems } = await import('../../src/infra/db/schema.js');
      for (const slug of seededSlugs) {
        await db
          .delete(compendiumItems)
          .where(eq(compendiumItems.slug, slug));
      }
      seededSlugs.length = 0;
    }
  });

  afterAll(async () => {
    // Final cleanup: delete all TEST_REST02 items in case any leaked
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems } = await import('../../src/infra/db/schema.js');
    await db.delete(compendiumItems).where(eq(compendiumItems.source, 'TEST_REST02'));

    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
  });

  /**
   * Seeds a synthetic compendium item with a raw 5etools-style recharge value
   * and a known charges count. source='TEST_REST02' for safe cleanup.
   *
   * @param slug - Unique slug for the item
   * @param rawRecharge - Raw 5etools recharge string (e.g. 'restLong', 'restShort', 'dawn')
   * @param maxCharges - Max charges for the item
   */
  async function seedItemWithRecharge(
    slug: string,
    rawRecharge: string,
    maxCharges: number,
  ): Promise<void> {
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems } = await import('../../src/infra/db/schema.js');
    await db.insert(compendiumItems).values({
      slug,
      source: 'TEST_REST02',
      name: `Test Item (${slug})`,
      type: 'WD',
      data: { recharge: rawRecharge, charges: maxCharges },
    });
    seededSlugs.push(slug);
  }

  /**
   * Sets the character's inventory to contain a single item instance with the
   * specified charges. Uses PATCH /characters/:id directly via DB.
   */
  async function patchInventoryWithItem(
    slug: string,
    charges: number,
    maxCharges: number,
  ): Promise<void> {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    await db
      .update(characters)
      .set({
        inventory: [
          {
            instanceId: 'test-rest02-instance-001',
            itemSlug: slug,
            itemSource: 'TEST_REST02',
            quantity: 1,
            charges,
            equipped: false,
            attuned: false,
            notes: null,
            containerId: null,
          },
        ],
      })
      .where(eq(characters.id, charId));
  }

  // ---- REQ-R02-API-LONG-REST-DOWNED ----------------------------------------

  it('R-02: long rest with hp=0 → 400 VALIDATION_FAILED LONG_REST_DOWNED', async () => {
    const app = await getTestApp();

    // Set character HP to 0 (downed)
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
          hp: { current: 0, max: 10, temp: 0 },
        },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/long`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });

    // REQ-R02-API-LONG-REST-DOWNED
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toEqual({ code: 'LONG_REST_DOWNED', expected: 1, got: 0 });

    // Verify DB unchanged (HP still 0)
    const charAfter = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    expect(charAfter.data.hp.current).toBe(0);

    // Restore HP for subsequent tests
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charAfter.data, hp: { current: 10, max: 10, temp: 0 } } },
    });
  });

  // ---- REQ-R02-API-LONG-REST-1HP -------------------------------------------

  it('R-02: long rest with hp=1 (boundary) → 200', async () => {
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
      payload: { data: { ...charPre.data, hp: { current: 1, max: 10, temp: 0 } } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/long`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });

    // REQ-R02-API-LONG-REST-1HP: exactly 1 HP is eligible
    expect(res.statusCode).toBe(200);
  });

  // ---- REQ-R02-API-LONG-REST-RECHARGES-LONG --------------------------------

  it('R-06: long rest recharges items with recharge=restLong (→ long)', async () => {
    const app = await getTestApp();

    // Seed synthetic item with 5etools recharge='restLong'
    // extractRecharge maps it to 'long'; rechargeInventoryItems(trigger:'long') fires.
    await seedItemWithRecharge('test-rest02-long-item', 'restLong', 5);
    await patchInventoryWithItem('test-rest02-long-item', 0, 5);

    // Ensure character has HP > 0
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
      payload: { data: { ...charPre.data, hp: { current: 5, max: 10, temp: 0 } } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/long`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });

    // REQ-R02-API-LONG-REST-RECHARGES-LONG
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.longRest.itemsRecharged).toHaveLength(1);
    expect(body.longRest.itemsRecharged[0]).toMatchObject({ instanceId: 'test-rest02-instance-001', to: 5 });

    // Verify DB inventory updated
    const charAfter = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    const item = (charAfter.inventory as Array<{ itemSlug: string; charges: number }>).find(
      (i) => i.itemSlug === 'test-rest02-long-item',
    );
    expect(item?.charges).toBe(5);
  });

  // ---- REQ-R02-API-LONG-REST-RECHARGES-DAWN --------------------------------

  it('R-06 regression: long rest still recharges items with recharge=dawn', async () => {
    const app = await getTestApp();

    // Seed synthetic item with 5etools recharge='dawn' (direct domain value pass-through)
    await seedItemWithRecharge('test-rest02-dawn-item', 'dawn', 7);
    await patchInventoryWithItem('test-rest02-dawn-item', 2, 7);

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
      payload: { data: { ...charPre.data, hp: { current: 5, max: 10, temp: 0 } } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/long`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });

    // REQ-R02-API-LONG-REST-RECHARGES-DAWN — dawn items still recharged on long rest
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.longRest.itemsRecharged).toHaveLength(1);
    expect(body.longRest.itemsRecharged[0]).toMatchObject({ instanceId: 'test-rest02-instance-001', to: 7 });
  });

  // ---- REQ-R02-API-SHORT-REST-RECHARGES-SHORT ------------------------------

  it('R-05: short rest recharges items with recharge=restShort (→ short)', async () => {
    const app = await getTestApp();

    // Seed synthetic item with 5etools recharge='restShort'
    // extractRecharge maps it to 'short'; rechargeInventoryItems(trigger:'short') fires.
    await seedItemWithRecharge('test-rest02-short-item', 'restShort', 3);
    await patchInventoryWithItem('test-rest02-short-item', 0, 3);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });

    // REQ-R02-API-SHORT-REST-RECHARGES-SHORT
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shortRest.itemsRecharged).toHaveLength(1);
    expect(body.shortRest.itemsRecharged[0]).toMatchObject({ instanceId: 'test-rest02-instance-001', to: 3 });

    // REQ-R02-API-SHORT-REST-PERSISTS-INVENTORY: inventory column written to DB
    const charAfter = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      })
      .then((r) => r.json());
    const item = (charAfter.inventory as Array<{ itemSlug: string; charges: number }>).find(
      (i) => i.itemSlug === 'test-rest02-short-item',
    );
    expect(item?.charges).toBe(3);
  });

  // ---- REQ-R02-API-SHORT-REST-PERSISTS-INVENTORY (empty inventory no-op) ----

  it('R-05: short rest with empty inventory → 200, no error', async () => {
    const app = await getTestApp();

    // Clear inventory via DB
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    await db.update(characters).set({ inventory: [] }).where(eq(characters.id, charId));

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/rest/short`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });

    // REQ-R02-API-SHORT-REST-PERSISTS-INVENTORY: empty-inventory no error
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shortRest.itemsRecharged).toHaveLength(0);
  });
});

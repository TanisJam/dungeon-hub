import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Tests de cargas/usos + endpoint consume (Inv Fase B #3).
 *
 * Items reales del compendio:
 *   - wand-of-magic-missiles / DMG: charges=7, recharge=dawn (type WD|DMG).
 *   - staff-of-power / DMG: charges=20, recharge=dawn.
 *   - potion-of-healing / DMG: type=P, sin charges → consume vía quantity.
 *   - spell-scroll-1st-level / DMG: type SC|DMG → consume vía quantity.
 *   - amulet-of-health / DMG: sin charges ni type consumable → ITEM_NOT_CONSUMABLE.
 */
describe('POST /characters/:id/inventory/:instanceId/consume', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceCampaignId: string;
  let aliceCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();
    bob = await createTestUser();

    aliceCampaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { name: 'Consume Campaign' },
        })
        .then((r) => r.json())
    ).id;

    aliceCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: aliceCampaignId, name: 'Wandwielder' },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 14, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 3,
        skillChoices: ['arcana', 'investigation'],
      },
    });
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    await closeTestApp();
  });

  async function addItem(
    slug: string,
    source: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ instanceId: string; body: any }> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug, source }, ...extra },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    return { instanceId: body.addedInstanceId, body };
  }

  it('agregar wand auto-inicializa charges al máximo del compendio (7)', async () => {
    const { body } = await addItem('wand-of-magic-missiles', 'DMG');
    const added = body.character.inventory.find(
      (it: any) => it.itemSlug === 'wand-of-magic-missiles',
    );
    expect(added.charges).toBe(7);
  });

  it('consume con count default decrementa 1 carga', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('staff-of-power', 'DMG');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.consumed).toMatchObject({ mode: 'charges', count: 1, removed: false, remaining: 19 });
    const item = body.character.inventory.find((it: any) => it.instanceId === instanceId);
    expect(item.charges).toBe(19);
  });

  it('consume con count > available → 400 INSUFFICIENT_CHARGES', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('wand-of-magic-missiles', 'DMG', { charges: 2 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { count: 5 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]).toMatchObject({
      code: 'INSUFFICIENT_CHARGES',
      requested: 5,
      available: 2,
    });
  });

  it('consume potion decrementa quantity y elimina cuando llega a 0', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('potion-of-healing', 'DMG', { quantity: 2 });

    // Primer consume: queda 1.
    const r1 = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().consumed).toMatchObject({ mode: 'quantity', removed: false, remaining: 1 });

    // Segundo consume: deja en 0 → removed.
    const r2 = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().consumed).toMatchObject({ mode: 'quantity', removed: true, remaining: 0 });
    expect(
      r2.json().character.inventory.find((it: any) => it.instanceId === instanceId),
    ).toBeUndefined();
  });

  it('consume scroll (type SC|DMG) decrementa quantity', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('spell-scroll-1st-level', 'DMG', { quantity: 1 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().consumed).toMatchObject({ mode: 'quantity', removed: true });
  });

  it('consume sobre ítem no consumible → 400 ITEM_NOT_CONSUMABLE', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('amulet-of-health', 'DMG');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('ITEM_NOT_CONSUMABLE');
  });

  it('outsider no puede consumir', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('wand-of-magic-missiles', 'DMG');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}/consume`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('401 sin token', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/00000000-0000-0000-0000-000000000000/consume`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('instanceId inexistente → 404 INSTANCE_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory/00000000-0000-0000-0000-000000000000/consume`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().issues[0].code).toBe('INSTANCE_NOT_FOUND');
  });

  it('PATCH puede setear charges manualmente dentro del rango', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('wand-of-magic-missiles', 'DMG');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { charges: 3 },
    });

    expect(res.statusCode).toBe(200);
    const item = res.json().character.inventory.find((it: any) => it.instanceId === instanceId);
    expect(item.charges).toBe(3);
  });

  it('PATCH rechaza charges > max', async () => {
    const app = await getTestApp();
    const { instanceId } = await addItem('wand-of-magic-missiles', 'DMG');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${aliceCharId}/inventory/${instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { charges: 99 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]).toMatchObject({ code: 'CHARGES_EXCEEDS_MAX', max: 7 });
  });

  describe('long rest — recarga charges en items con recharge=dawn', () => {
    it('recarga wand consumido durante el long rest', async () => {
      const app = await getTestApp();

      // Crear char fresco para no contaminar inventario de tests anteriores.
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: aliceCampaignId, name: 'Rester' },
        })
        .then((r) => r.json());
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/stats`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 14, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
        },
      });
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/class`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          class: { slug: 'wizard', source: 'PHB' },
          level: 3,
          skillChoices: ['arcana', 'investigation'],
        },
      });

      // Wand con 2/7 charges.
      const add = await app
        .inject({
          method: 'POST',
          url: `/api/v1/characters/${c.id}/inventory`,
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { item: { slug: 'wand-of-magic-missiles', source: 'DMG' }, charges: 2 },
        })
        .then((r) => r.json());

      const wandId = add.addedInstanceId;

      const restRes = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/rest/long`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {},
      });

      expect(restRes.statusCode).toBe(200);
      const restBody = restRes.json();
      expect(restBody.longRest.itemsRecharged).toContainEqual({ instanceId: wandId, to: 7 });

      const wand = restBody.character.inventory.find((it: any) => it.instanceId === wandId);
      expect(wand.charges).toBe(7);
    });

    it('no toca items sin charges en compendio (longsword)', async () => {
      const app = await getTestApp();
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: aliceCampaignId, name: 'Sword Only' },
        })
        .then((r) => r.json());
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/stats`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
        },
      });
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/class`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' } },
      });

      const restRes = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/rest/long`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {},
      });

      expect(restRes.statusCode).toBe(200);
      expect(restRes.json().longRest.itemsRecharged).toEqual([]);
    });
  });

  describe('ammunition — auto-merge en POST /inventory', () => {
    it('agregar arrows-20 dos veces con mismo state mergea en un solo stack', async () => {
      const app = await getTestApp();
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: aliceCampaignId, name: 'Archer' },
        })
        .then((r) => r.json());

      const r1 = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'arrows-20', source: 'PHB' }, quantity: 1, state: 'carried' },
      });
      expect(r1.statusCode).toBe(201);
      const firstId = r1.json().addedInstanceId;

      const r2 = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'arrows-20', source: 'PHB' }, quantity: 2, state: 'carried' },
      });
      expect(r2.statusCode).toBe(201);
      const body2 = r2.json();
      expect(body2.addedInstanceId).toBe(firstId);
      const stacks = body2.character.inventory.filter(
        (it: any) => it.itemSlug === 'arrows-20',
      );
      expect(stacks).toHaveLength(1);
      expect(stacks[0].quantity).toBe(3);
    });

    it('mismo ammo con state distinto crea stacks separados', async () => {
      const app = await getTestApp();
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: aliceCampaignId, name: 'Split Archer' },
        })
        .then((r) => r.json());

      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'arrows-20', source: 'PHB' }, quantity: 1, state: 'carried' },
      });
      const r2 = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'arrows-20', source: 'PHB' }, quantity: 1, state: 'stowed' },
      });
      expect(r2.statusCode).toBe(201);
      const stacks = r2.json().character.inventory.filter(
        (it: any) => it.itemSlug === 'arrows-20',
      );
      expect(stacks).toHaveLength(2);
    });

    it('consume sobre ammo decrementa quantity', async () => {
      const app = await getTestApp();
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: aliceCampaignId, name: 'Shooter' },
        })
        .then((r) => r.json());

      const add = await app
        .inject({
          method: 'POST',
          url: `/api/v1/characters/${c.id}/inventory`,
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { item: { slug: 'arrow', source: 'PHB' }, quantity: 20 },
        })
        .then((r) => r.json());

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory/${add.addedInstanceId}/consume`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { count: 4 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().consumed).toMatchObject({ mode: 'quantity', remaining: 16 });
    });

  });
});

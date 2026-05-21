import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Tests de containers anidados + Bag of Holding (Inv Fase B #5).
 *
 * Items reales del compendio:
 *   - backpack/PHB: weight 5, cap 30, mundano.
 *   - bag-of-holding/DMG: weight 15, cap 500, weightless.
 *   - hewards-handy-haversack/DMG: weight 5, cap 120 (3 comp sumados), weightless.
 *   - plate-armor/PHB: weight 65 — pesado para testear cancelación.
 *   - longsword/PHB: non-container.
 */
describe('inventory containers — POST/PATCH/DELETE con containerId', () => {
  let alice: TestUser;
  let aliceCampaignId: string;
  let aliceCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();

    aliceCampaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { name: 'Container Campaign' },
        })
        .then((r) => r.json())
    ).id;

    aliceCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: aliceCampaignId, name: 'Packrat' },
        })
        .then((r) => r.json())
    ).id;

    // STR 8 → max carry = 120. Bajo para que un plate (65) se note.
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'sorcerer', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'persuasion'],
      },
    });
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    await closeTestApp();
  });

  async function freshChar(name: string): Promise<string> {
    const app = await getTestApp();
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId: aliceCampaignId, name },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'sorcerer', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'persuasion'],
      },
    });
    return c.id;
  }

  async function addItem(
    charId: string,
    slug: string,
    source: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ instanceId: string; body: any }> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug, source }, ...extra },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    return { instanceId: body.addedInstanceId, body };
  }

  it('agrega un item dentro de un backpack via containerId', async () => {
    const charId = await freshChar('Backpack User');
    const back = await addItem(charId, 'backpack', 'PHB');
    const { body } = await addItem(charId, 'longsword', 'PHB', { containerId: back.instanceId });
    const sword = body.character.inventory.find((it: any) => it.itemSlug === 'longsword');
    expect(sword.containerId).toBe(back.instanceId);
  });

  it('rechaza containerId apuntando a non-container', async () => {
    const app = await getTestApp();
    const charId = await freshChar('Bad Pack');
    const sword = await addItem(charId, 'longsword', 'PHB');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        item: { slug: 'plate-armor', source: 'PHB' },
        containerId: sword.instanceId,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('NOT_A_CONTAINER');
  });

  it('plate-armor dentro de bag-of-holding NO genera ENCUMBERED (weightless cancela contenido)', async () => {
    const charId = await freshChar('Bag User');
    const bag = await addItem(charId, 'bag-of-holding', 'DMG');
    const { body } = await addItem(charId, 'plate-armor', 'PHB', { containerId: bag.instanceId });
    const enc = body.warnings.find((w: any) => w.code === 'ENCUMBERED');
    expect(enc).toBeUndefined();
  });

  it('plate-armor dentro de un backpack mundano SÍ suma al wearer (ENCUMBERED a STR 8)', async () => {
    const charId = await freshChar('Bag Mundane');
    const back = await addItem(charId, 'backpack', 'PHB');
    // 2 plates dentro del backpack = 130 + backpack(5) = 135 > 120 max.
    await addItem(charId, 'plate-armor', 'PHB', { containerId: back.instanceId });
    const { body } = await addItem(charId, 'plate-armor', 'PHB', {
      containerId: back.instanceId,
    });
    expect(body.warnings.some((w: any) => w.code === 'ENCUMBERED')).toBe(true);
  });

  it('PATCH mueve un item de root a un container', async () => {
    const app = await getTestApp();
    const charId = await freshChar('Mover');
    const back = await addItem(charId, 'backpack', 'PHB');
    const sword = await addItem(charId, 'longsword', 'PHB');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}/inventory/${sword.instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { containerId: back.instanceId },
    });
    expect(res.statusCode).toBe(200);
    const moved = res.json().character.inventory.find((it: any) => it.instanceId === sword.instanceId);
    expect(moved.containerId).toBe(back.instanceId);
  });

  it('PATCH rechaza ciclo (mover container a sí mismo)', async () => {
    const app = await getTestApp();
    const charId = await freshChar('Cycler');
    const back = await addItem(charId, 'backpack', 'PHB');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}/inventory/${back.instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { containerId: back.instanceId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('CONTAINER_CYCLE');
  });

  it('DELETE de container reparentea hijos a root (no los borra)', async () => {
    const app = await getTestApp();
    const charId = await freshChar('Spiller');
    const back = await addItem(charId, 'backpack', 'PHB');
    const sword = await addItem(charId, 'longsword', 'PHB', { containerId: back.instanceId });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${charId}/inventory/${back.instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(del.statusCode).toBe(200);
    const inv = del.json().character.inventory;
    expect(inv).toHaveLength(1);
    expect(inv[0].instanceId).toBe(sword.instanceId);
    expect(inv[0].containerId).toBeNull();
  });

  it('warning CAPACITY_EXCEEDED si contenido > weightLb del container (backpack)', async () => {
    const charId = await freshChar('Overpacker');
    const back = await addItem(charId, 'backpack', 'PHB');
    // plate (65) > backpack cap 30.
    const { body } = await addItem(charId, 'plate-armor', 'PHB', {
      containerId: back.instanceId,
    });
    const cap = body.warnings.find((w: any) => w.code === 'CAPACITY_EXCEEDED');
    expect(cap).toBeDefined();
    expect(cap.containerId).toBe(back.instanceId);
    expect(cap.capacityLb).toBe(30);
    expect(cap.weight).toBe(65);
  });
});

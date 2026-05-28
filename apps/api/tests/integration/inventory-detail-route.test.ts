/**
 * Integration tests for GET /characters/:id/inventory/:instanceId/detail.
 *
 * Reqs: ACIDE-SHAPE-01, ACIDE-AUTH-02, ACIDE-NONN1-03 (spec #1070)
 * Design: DB1, DB3 (design #1071)
 *
 * PHB p.144-145 — Armor (chain shirt: LA/MA, stealth, STR req).
 * PHB p.149 — Weapons (longsword type='M').
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import * as loadItemDataModule from '../../src/use-cases/characters/load-item-data.js';

describe('GET /characters/:id/inventory/:instanceId/detail (ACIDE-SHAPE-01)', () => {
  let user: TestUser;
  let characterId: string;
  let armorInstanceId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Detail Route Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId: campaign.worldId, name: 'Beira the Fighter' },
      })
      .then((r) => r.json());
    characterId = character.id;

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // Set stats so proficiency bonus is calculable
    await expectOk(
      'stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 13, con: 14, int: 8, wis: 10, cha: 12 },
        },
      }),
    );

    // Add chain shirt (MA type armor)
    const addArmorRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/inventory`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { item: { slug: 'chain-shirt', source: 'PHB' }, state: 'carried' },
    });
    await expectOk('add chain-shirt', addArmorRes);
    const armorBody = addArmorRes.json();
    // Extract instanceId from the inventory after adding
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    const sheetBody = sheetRes.json();
    const chainShirt = sheetBody.inventory.find((it: { itemSlug: string }) => it.itemSlug === 'chain-shirt');
    armorInstanceId = chainShirt?.instanceId;
    void armorBody; // suppress unused warning
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('6.1 returns 200 with armor variant shape for chain-shirt (ACIDE-SHAPE-01)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/inventory/${armorInstanceId}/detail`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.detail).toBeTruthy();
    expect(body.detail.v3Type).toBe('armor');
    // PHB p.145: chain shirt is Medium Armor → dexCapNote = '+ DEX (máx +2)'
    expect(body.detail.dexCapNote).toBe('+ DEX (máx +2)');
    expect(typeof body.detail.acBase).toBe('number');
    expect(body.detail.instanceId).toBe(armorInstanceId);
    expect(body.detail.displayName).toBe('Chain Shirt');
  });

  describe('ACIDE-NONN1-03 — no N+1: loadItemDataDetailMany called once per request', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      spy?.mockRestore();
    });

    it('6.2 loadItemDataDetailMany called exactly once per detail request (ACIDE-NONN1-03)', async () => {
      spy = vi.spyOn(loadItemDataModule, 'loadItemDataDetailMany');

      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/inventory/${armorInstanceId}/detail`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});

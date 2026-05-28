/**
 * Integration tests for inventoryEnriched[] in GET /characters/:id/sheet.
 *
 * ACSE-SHAPE-01 — enriched inventory items in sheet response (spec #1063).
 * ACSE-NONN1-01 — no N+1 regression: enrichment uses existing loadItemDataMany batch.
 *
 * Design decision DA2 (design #1064): magicFlag derived at API projection layer
 * from (rarity != null && rarity !== 'common') || reqAttune != null.
 * Design decision DA3 (design #1064): inventoryEnriched is ADDITIVE — inventory[] kept verbatim.
 *
 * PHB p.149 — Weapons (longsword type='M').
 * DMG p.135 — Rarity (ring-of-protection is "rare, requires attunement").
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import * as loadItemDataModule from '../../src/use-cases/characters/load-item-data.js';

describe('GET /characters/:id/sheet — inventoryEnriched[] (ACSE-SHAPE-01)', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Enriched Inventory Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId: campaign.worldId, name: 'Ragnor the Bold' },
      })
      .then((r) => r.json());
    characterId = character.id;

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // Minimal stats (standard array) — just need a valid character
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

    // Add 3 items to inventory: weapon (longsword), magic ring (ring-of-protection), torch
    await expectOk(
      'add longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/inventory`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'carried' },
      }),
    );

    await expectOk(
      'add ring-of-protection',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/inventory`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { item: { slug: 'ring-of-protection', source: 'DMG' }, state: 'carried' },
      }),
    );

    await expectOk(
      'add torch',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/inventory`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { item: { slug: 'torch', source: 'PHB' }, state: 'carried' },
      }),
    );
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('5.4 inventoryEnriched[] is present on sheet response with correct shape per item (ACSE-SHAPE-01)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // ACSE-SHAPE-01: inventoryEnriched must be present
    expect(Array.isArray(body.inventoryEnriched)).toBe(true);
    expect(body.inventoryEnriched).toHaveLength(3);

    // DA3: existing inventory[] must still be present verbatim (read-path tolerance)
    expect(Array.isArray(body.inventory)).toBe(true);
    expect(body.inventory).toHaveLength(3);

    // Find longsword in enriched array
    const sword = body.inventoryEnriched.find(
      (it: { itemSlug: string }) => it.itemSlug === 'longsword',
    );
    expect(sword).toBeTruthy();
    expect(sword.v3Type).toBe('weapon'); // PHB p.149 — longsword type='M' → weapon
    expect(sword.displayName).toBeTypeOf('string');
    expect(sword.instanceId).toBeTypeOf('string');
    expect(sword.qty).toBe(1);
    expect(sword.equipped).toBe(false); // state='carried'
    expect(sword.magicFlag).toBe(false); // longsword has no rarity, no reqAttune

    // Find ring-of-protection in enriched array
    const ring = body.inventoryEnriched.find(
      (it: { itemSlug: string }) => it.itemSlug === 'ring-of-protection',
    );
    expect(ring).toBeTruthy();
    expect(ring.v3Type).toBe('magic'); // RG type or rare rarity
    // Ring of Protection requires attunement (PHB/DMG) → magicFlag = true
    expect(ring.magicFlag).toBe(true);
    // Must have v3Type, rarity, magicFlag, displayName keys per ACSE-SHAPE-01
    expect('v3Type' in ring).toBe(true);
    expect('rarity' in ring).toBe(true);
    expect('magicFlag' in ring).toBe(true);
    expect('displayName' in ring).toBe(true);

    // Find torch in enriched array
    const torch = body.inventoryEnriched.find(
      (it: { itemSlug: string }) => it.itemSlug === 'torch',
    );
    expect(torch).toBeTruthy();
    expect(torch.qty).toBe(1);
    // Torch is type 'G' with charges (it burns for 1 hour — 5etools models this with charges)
    // OR falls through to 'trinket'/'consumable' depending on compendium data. Either is valid.
    expect(['consumable', 'trinket']).toContain(torch.v3Type);
  });

  describe('ACSE-NONN1-01 — no N+1: loadItemDataMany called exactly once per sheet request', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      spy?.mockRestore();
    });

    it('5.5 inventoryEnriched uses existing batch — loadItemDataMany called once + inventory[] still present (ACSE-NONN1-01 + DA3)', async () => {
      spy = vi.spyOn(loadItemDataModule, 'loadItemDataMany');

      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/sheet`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // ACSE-NONN1-01: loadItemDataMany must be called exactly once (batch, not per-item).
      // inventoryEnriched reuses the same itemWeights batch — zero additional DB queries.
      expect(spy).toHaveBeenCalledTimes(1);

      // DA3: inventory[] kept verbatim — additive enrichment, no replacement
      expect(body.inventory).toHaveLength(body.inventoryEnriched.length);

      // Each entry in inventoryEnriched must match a corresponding row in inventory[]
      const inventoryIds = new Set(body.inventory.map((it: { instanceId: string }) => it.instanceId));
      for (const enriched of body.inventoryEnriched) {
        expect(inventoryIds.has(enriched.instanceId)).toBe(true);
      }
    });
  });
});

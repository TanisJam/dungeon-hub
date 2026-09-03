import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * POST /characters/:id/shop/buy — mundane item purchase.
 *
 * REQ-BUY-01: owner buys an affordable mundane visible item → 200/201, currency
 *   deducted by DB costCp, item added to inventory.
 * REQ-PRICE-AUTH-01: price is server-authoritative (DB costCp), body carries no price.
 * REQ-MAGIC-REJECT-01: magic items (rarity tier / RD|ST|WD|RG / reqAttune) are not
 *   purchasable via the shop → 400 ITEM_NOT_PURCHASABLE, no mutation.
 * REQ-HIDDEN-REJECT-01: items disabled via world rulesProfile.disabledEntities.items
 *   are invisible to the shop → 404, no mutation.
 * REQ-FUNDS-01: insufficient funds → 400 INSUFFICIENT_FUNDS, no mutation.
 * REQ-OWNER-01: non-owner is forbidden → 403, no mutation.
 * REQ-QTY-01: quantity > 1 charges N× cost and adds a single instance with that qty.
 * REQ-ATOMIC-01: a rejected buy never partially mutates currency or inventory.
 * REQ-CURATION-01 (market-shop-dm-stock-api 3d): when world rulesProfile.shopCuration
 *   is enabled, only items listed in `forSale` (slug|source) are purchasable; anything
 *   else 404s (same no-leak response as a genuinely nonexistent item), no mutation.
 * REQ-CURATION-02: when shopCuration.enabled is true and the item IS in forSale, the
 *   purchase succeeds normally (curation is an allowlist, not an extra block).
 * REQ-CURATION-03: default profile (shopCuration.enabled: false) is unaffected — the
 *   full mundane catalog stays purchasable (regression, covered by BUY-01 above).
 */
describe('POST /characters/:id/shop/buy', () => {
  let alice: TestUser; // owner
  let bob: TestUser; // outsider
  let aliceCampaignId: string;
  let aliceWorldId: string;

  let longswordCostCp: number;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();
    bob = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Shop Buy Campaign' },
      })
      .then((r) => r.json());
    aliceCampaignId = campaign.id;
    aliceWorldId = campaign.worldId;

    const itemRes = await app
      .inject({
        method: 'GET',
        url: `/api/v1/compendium/items/longsword?source=PHB&world=${aliceWorldId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    longswordCostCp = itemRes.costCp;
    expect(longswordCostCp).toBeTypeOf('number');
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    await closeTestApp();
  });

  async function makeCharacter(name: string): Promise<string> {
    const app = await getTestApp();
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name },
      })
      .then((r) => r.json());
    return c.id as string;
  }

  async function grantGold(charId: string, gp: number): Promise<void> {
    const app = await getTestApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${charId}/currency`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { gp },
    });
  }

  it('401 sin token', async () => {
    const app = await getTestApp();
    const charId = await makeCharacter('NoToken');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/shop/buy`,
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('BUY-01 + PRICE-AUTH-01: owner compra longsword, se cobra el costCp de la DB (body sin price)', async () => {
    const app = await getTestApp();
    const charId = await makeCharacter('Buyer');
    await grantGold(charId, 1000);

    const before = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    const beforeGpCp = before.data.currency.gp * 100 + (before.data.currency.cp ?? 0);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      // No price field in the body — server is authoritative on cost.
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.addedInstanceId).toBeTypeOf('string');
    const added = body.character.inventory.find(
      (it: { instanceId: string }) => it.instanceId === body.addedInstanceId,
    );
    expect(added.itemSlug).toBe('longsword');
    expect(added.itemSource).toBe('PHB');
    expect(added.quantity).toBe(1);

    const afterGpCp =
      body.currency.gp * 100 + body.currency.sp * 10 + body.currency.cp
      + body.currency.pp * 1000 + body.currency.ep * 50;
    expect(beforeGpCp - afterGpCp).toBe(longswordCostCp);
  });

  it('MAGIC-REJECT-01: ring-of-protection (magic, DMG) → 400 ITEM_NOT_PURCHASABLE, sin mutación', async () => {
    const app = await getTestApp();
    const charId = await makeCharacter('MagicBuyer');
    await grantGold(charId, 10000);

    const before = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'ring-of-protection', source: 'DMG' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('ITEM_NOT_PURCHASABLE');

    const after = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    expect(after.data.currency).toEqual(before.data.currency);
    expect(after.inventory ?? []).toHaveLength((before.inventory ?? []).length);
  });

  it('HIDDEN-REJECT-01: item deshabilitado via disabledEntities.items → 404, sin mutación', async () => {
    const app = await getTestApp();

    // Campaign propia para no contaminar el resto de la suite con el profile alterado.
    const hiddenCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Hidden Item Campaign' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${hiddenCampaign.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        rulesProfile: {
          sources: {
            PHB: true, DMG: true, XGE: true, TCE: true, MPMM: true,
            MTF: true, SCAG: true, FTD: true, VGM: true, EGW: true,
          },
          disabledEntities: {
            races: [], subraces: [], classes: [], subclasses: [],
            backgrounds: [], spells: [], items: ['longsword|PHB'], feats: [],
          },
          variantRules: {
            multiclassing: true,
            feats: true,
            variantHumanAndCustomLineage: true,
            encumbranceVariant: false,
            tashasCustomOrigin: false,
            tashasOptionalClassFeatures: false,
          },
          statGeneration: { standardArray: true, pointBuy: true, roll: true },
          hpOnLevelUp: 'player-choice',
        },
      },
    });

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: hiddenCampaign.worldId, name: 'HiddenBuyer' },
      })
      .then((r) => r.json());
    await grantGold(c.id, 1000);

    const before = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${c.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(404);

    const after = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${c.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    expect(after.data.currency).toEqual(before.data.currency);
    expect(after.inventory ?? []).toHaveLength((before.inventory ?? []).length);
  });

  async function makeCurationCampaign(
    shopCuration: { enabled: boolean; forSale: string[] },
    name: string,
  ): Promise<{ campaignId: string; worldId: string }> {
    const app = await getTestApp();
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        rulesProfile: {
          sources: {
            PHB: true, DMG: true, XGE: true, TCE: true, MPMM: true,
            MTF: true, SCAG: true, FTD: true, VGM: true, EGW: true,
          },
          disabledEntities: {
            races: [], subraces: [], classes: [], subclasses: [],
            backgrounds: [], spells: [], items: [], feats: [],
          },
          variantRules: {
            multiclassing: true,
            feats: true,
            variantHumanAndCustomLineage: true,
            encumbranceVariant: false,
            tashasCustomOrigin: false,
            tashasOptionalClassFeatures: false,
          },
          statGeneration: { standardArray: true, pointBuy: true, roll: true },
          hpOnLevelUp: 'player-choice',
          shopCuration,
        },
      },
    });

    return { campaignId: campaign.id, worldId: campaign.worldId };
  }

  it('CURATION-01: shopCuration.enabled=true + item NOT in forSale → 404, sin mutación', async () => {
    const app = await getTestApp();
    const { worldId } = await makeCurationCampaign(
      { enabled: true, forSale: ['dagger|PHB'] },
      'Curation Blocklist Campaign',
    );

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'CurationBlockedBuyer' },
      })
      .then((r) => r.json());
    await grantGold(c.id, 1000);

    const before = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${c.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(404);

    const after = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${c.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    expect(after.data.currency).toEqual(before.data.currency);
    expect(after.inventory ?? []).toHaveLength((before.inventory ?? []).length);
  });

  it('CURATION-02: shopCuration.enabled=true + item IN forSale → 201, compra exitosa', async () => {
    const app = await getTestApp();
    const { worldId } = await makeCurationCampaign(
      { enabled: true, forSale: ['longsword|PHB'] },
      'Curation Allowlist Campaign',
    );

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'CurationAllowedBuyer' },
      })
      .then((r) => r.json());
    await grantGold(c.id, 1000);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const added = body.character.inventory.find(
      (it: { instanceId: string }) => it.instanceId === body.addedInstanceId,
    );
    expect(added.itemSlug).toBe('longsword');
  });

  it('FUNDS-01: sin oro suficiente → 400 INSUFFICIENT_FUNDS, sin mutación', async () => {
    const app = await getTestApp();
    const charId = await makeCharacter('PoorBuyer');
    // No gold granted — starts at 0.

    const before = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('INSUFFICIENT_FUNDS');

    const after = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    expect(after.data.currency).toEqual(before.data.currency);
    expect(after.inventory ?? []).toHaveLength((before.inventory ?? []).length);
  });

  it('OWNER-01: usuario ajeno → 403, sin mutación', async () => {
    const app = await getTestApp();
    const charId = await makeCharacter('OwnedByAlice');
    await grantGold(charId, 1000);

    const before = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/shop/buy`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(403);

    const after = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    expect(after.data.currency).toEqual(before.data.currency);
    expect(after.inventory ?? []).toHaveLength((before.inventory ?? []).length);
  });

  it('QTY-01: quantity=3 cobra 3× costo y agrega UNA instancia con quantity=3 (no ammo → sin stacking auto-merge)', async () => {
    const app = await getTestApp();
    const charId = await makeCharacter('BulkBuyer');
    await grantGold(charId, 1000);

    const before = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${charId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());
    const beforeCp =
      before.data.currency.gp * 100 + before.data.currency.sp * 10 + before.data.currency.cp
      + before.data.currency.pp * 1000 + before.data.currency.ep * 50;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, quantity: 3 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const added = body.character.inventory.find(
      (it: { instanceId: string }) => it.instanceId === body.addedInstanceId,
    );
    expect(added.quantity).toBe(3);

    const afterCp =
      body.currency.gp * 100 + body.currency.sp * 10 + body.currency.cp
      + body.currency.pp * 1000 + body.currency.ep * 50;
    expect(beforeCp - afterCp).toBe(longswordCostCp * 3);
  });

  // Documents existing codebase convention (verified against POST /inventory,
  // same file, same zod .parse() pattern): an invalid body that fails Zod
  // schema validation (e.g. quantity below the min(1) bound) is NOT caught by
  // a custom error handler anywhere in this API — Fastify's default handler
  // returns 500 for the uncaught ZodError. This is pre-existing behavior
  // across every mutation route in characters.ts, not something introduced
  // by this endpoint; matching it keeps the new route consistent with all
  // its siblings rather than silently inventing a bespoke 400 path.
  it('QTY-01b: quantity=0 → 500 (existing Zod-throw convention, not a bespoke 400)', async () => {
    const app = await getTestApp();
    const charId = await makeCharacter('ZeroQtyBuyer');
    await grantGold(charId, 1000);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/shop/buy`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, quantity: 0 },
    });

    expect(res.statusCode).toBe(500);
  });
});

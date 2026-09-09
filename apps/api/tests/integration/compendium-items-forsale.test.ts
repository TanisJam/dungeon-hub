/**
 * Integration tests: GET /compendium/items ?forSale= filter
 * (market-shop-dm-stock-api, sub-slice 3d — opt-in DM shop curation list)
 *
 * REQ-CURATION-LIST-01: ?forSale=true + world rulesProfile.shopCuration.enabled=true
 *   → only items whose "slug|source" key is in shopCuration.forSale are returned.
 * REQ-CURATION-LIST-02: omitting ?forSale= (any curation state) → unaffected, full
 *   mundane list (Codex/mercado default browsing untouched).
 * REQ-CURATION-LIST-03: ?forSale=true but shopCuration.enabled=false (default profile)
 *   → no-op, full mundane list (opt-in filter never activates on a non-curated world).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

async function setShopCuration(
  app: Awaited<ReturnType<typeof getTestApp>>,
  token: string,
  campaignId: string,
  shopCuration: { enabled: boolean; forSale: string[] },
): Promise<void> {
  await app.inject({
    method: 'PATCH',
    url: `/api/v1/campaigns/${campaignId}`,
    headers: { authorization: `Bearer ${token}` },
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
}

describe('GET /compendium/items — ?forSale= filter (REQ-CURATION-LIST-01..03)', () => {
  let user: TestUser;
  let curatedCampaignId: string;
  let curatedWorldId: string;
  let _defaultCampaignId: string;
  let defaultWorldId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const curated = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'ForSale Curated Campaign' },
      })
      .then((r) => r.json());
    curatedCampaignId = curated.id;
    curatedWorldId = curated.worldId;
    await setShopCuration(app, user.accessToken, curatedCampaignId, {
      enabled: true,
      forSale: ['longsword|PHB'],
    });

    const defaultCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'ForSale Default Campaign' },
      })
      .then((r) => r.json());
    _defaultCampaignId = defaultCampaign.id;
    defaultWorldId = defaultCampaign.worldId;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('[REQ-CURATION-LIST-01] curation enabled + forSale=true → only forSale-listed items', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${curatedWorldId}&magic=false&forSale=true&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json<{ data: Array<{ name: string }>; total: number }>();
    expect(total).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0]?.name).toBe('Longsword');
  });

  it('[REQ-CURATION-LIST-02] curation enabled but forSale= omitted → unaffected, full mundane list', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${curatedWorldId}&magic=false&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { total } = res.json<{ total: number }>();
    expect(total).toBeGreaterThan(1);
  });

  it('[REQ-CURATION-LIST-03] curation disabled (default profile) + forSale=true → no-op, full mundane list', async () => {
    const app = await getTestApp();
    const [withForSale, withoutForSale] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?world=${defaultWorldId}&magic=false&forSale=true&limit=200`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?world=${defaultWorldId}&magic=false&limit=200`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      }),
    ]);

    expect(withForSale.statusCode).toBe(200);
    expect(withoutForSale.statusCode).toBe(200);
    expect(withForSale.json<{ total: number }>().total).toBe(
      withoutForSale.json<{ total: number }>().total,
    );
    expect(withForSale.json<{ total: number }>().total).toBeGreaterThan(1);
  });
});

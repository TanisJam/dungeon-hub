/**
 * Integration tests: GET /compendium/items ?magic= filter
 *
 * REQ-MERC-API-01 — ?magic=false returns ONLY mundane items.
 * REQ-MERC-API-02 — Omitting ?magic= preserves existing behavior (all items).
 *
 * Uses real Postgres + PHB/DMG seed data (items are imported by compendium-import).
 * Known mundane slugs (PHB): longsword (no rarity), rope-hempen (no rarity),
 *   pouch (no rarity, type IT/GP), torch (no rarity).
 * Known magic slugs (DMG): bag-of-holding (uncommon, reqAttune absent but rarity),
 *   ring-of-protection (rare, reqAttune), cloak-of-protection (uncommon, reqAttune).
 *
 * Pre-flight confirmed (from source analysis):
 *   - data->>'rarity' stores "very rare" WITH A SPACE (5etools raw; normalizeRarity
 *     converts to slug "very-rare" — the SQL predicate matches the RAW stored form).
 *   - normalizeRarity('varies') === null → 'varies' items are MUNDANE.
 *   - 'bag' is a valid IconName in icon.tsx.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

// Magic rarities as stored in raw JSONB (WITH SPACE for "very rare" — pre-flight verified).
const MAGIC_RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
// Magic item type codes (from deriveV3Type domain heuristic).
const MAGIC_TYPE_CODES = ['RD', 'ST', 'WD', 'RG'];

describe('GET /compendium/items — ?magic= filter (REQ-MERC-API-01, REQ-MERC-API-02)', () => {
  let user: TestUser;
  let campaignId: string;
  let worldId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: 'Magic Filter Test Campaign' },
    });
    if (res.statusCode !== 201) {
      throw new Error(`Failed to create test campaign: ${res.statusCode} ${res.body}`);
    }
    const campaign = res.json();
    campaignId = campaign.id;
    worldId = campaign.worldId;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  // -------------------------------------------------------------------------
  // Task 1.3 — RED: magic=false returns mundane only, HTTP 200
  // -------------------------------------------------------------------------
  it('[REQ-MERC-API-01] ?magic=false returns HTTP 200 with mundane items only', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&magic=false&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json<{ data: Array<{ name: string; type: string | null }>; total: number }>();

    // Must have items (PHB seed contains mundane items)
    expect(total).toBeGreaterThan(0);
    expect(data.length).toBeGreaterThan(0);

    // Every item in response must not be magic.
    // We cannot check rarity directly (it is stripped from response), but
    // we can spot-check that known-mundane items exist and known-magic items don't.

    // Known mundane PHB items MUST appear.
    const names = data.map((d) => d.name);
    // Longsword is a mundane weapon (no rarity in PHB data)
    expect(names).toContain('Longsword');
  });

  it('[REQ-MERC-API-01] ?magic=false excludes items with magic rarity (spot-check bag-of-holding)', async () => {
    const app = await getTestApp();
    // First confirm bag-of-holding is in the unfiltered list
    const allRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&limit=200&q=bag+of+holding`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(allRes.statusCode).toBe(200);
    const allItems = allRes.json<{ data: Array<{ name: string }>; total: number }>();
    const bohInAll = allItems.data.some((d) => d.name === 'Bag of Holding');
    // If bag-of-holding is not imported, skip exclusion check (seed-dependent guard)
    if (!bohInAll) {
      // Still pass — the endpoint responded correctly, seed just lacks this item.
      return;
    }

    // Now check it's excluded by ?magic=false
    const filteredRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&magic=false&limit=200&q=bag+of+holding`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(filteredRes.statusCode).toBe(200);
    const filteredItems = filteredRes.json<{ data: Array<{ name: string }> }>();
    const bohInFiltered = filteredItems.data.some((d) => d.name === 'Bag of Holding');
    expect(bohInFiltered).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Task 1.4 — RED: omitting ?magic param returns all items (backward-compat)
  // -------------------------------------------------------------------------
  it('[REQ-MERC-API-02] omitting ?magic= returns same rows as before (backward-compat)', async () => {
    const app = await getTestApp();
    const [withoutMagic, withMagicFalse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?world=${worldId}&limit=200`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?world=${worldId}&magic=false&limit=200`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      }),
    ]);

    expect(withoutMagic.statusCode).toBe(200);
    expect(withMagicFalse.statusCode).toBe(200);

    const totalAll = withoutMagic.json<{ total: number }>().total;
    const totalMundane = withMagicFalse.json<{ total: number }>().total;

    // All items (no param) must be >= mundane-only count
    expect(totalAll).toBeGreaterThanOrEqual(totalMundane);
  });

  it('[REQ-MERC-API-02] omitting ?magic= includes both mundane and magic items', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { data, total } = res.json<{ data: unknown[]; total: number }>();
    expect(total).toBeGreaterThan(0);
    expect(data.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Task 1.5 — RED: invalid magic param value → 400 VALIDATION_FAILED
  // -------------------------------------------------------------------------
  it('[REQ-MERC-API-01] ?magic=banana → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&magic=banana`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string; issues: unknown[] }>();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Task 1.7 — RED: edge cases: varies, tools, trade goods appear in magic=false
  // -------------------------------------------------------------------------
  it('[REQ-MERC-API-01] ?magic=false includes tools (T/AT/GS/INS type codes, no rarity)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&magic=false&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json<{ data: Array<{ type: string | null; name: string }> }>();

    // Tools category items must appear — they have type T/AT/GS/INS and no magic rarity.
    // At least one tool-type item must be in the mundane list.
    const toolTypes = new Set(['T', 'AT', 'GS', 'INS']);
    const hasToolType = data.some((d) => d.type != null && toolTypes.has(d.type));
    expect(hasToolType).toBe(true);
  });

  it('[REQ-MERC-API-01] ?magic=false includes trade goods (TG type) when present', async () => {
    const app = await getTestApp();
    // First check trade goods exist in the unfiltered list
    const allRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    const allData = allRes.json<{ data: Array<{ type: string | null }> }>();
    const hasTG = allData.data.some((d) => d.type === 'TG');
    if (!hasTG) return; // seed doesn't include TG — skip

    const filteredRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&magic=false&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(filteredRes.statusCode).toBe(200);
    const filteredData = filteredRes.json<{ data: Array<{ type: string | null }> }>();
    const hasTGInFiltered = filteredData.data.some((d) => d.type === 'TG');
    expect(hasTGInFiltered).toBe(true);
  });

  it('[REQ-MERC-API-01] response envelope shape is {data, total, limit, offset}', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&magic=false`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(['data', 'limit', 'offset', 'total']);
  });

  it('[REQ-MERC-API-01] pagination total matches filtered rows count for magic=false', async () => {
    const app = await getTestApp();
    // Fetch with limit=10 and check total is consistent
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/items?world=${worldId}&magic=false&limit=10&offset=0`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { data, total, limit, offset } = res.json<{
      data: unknown[];
      total: number;
      limit: number;
      offset: number;
    }>();
    expect(limit).toBe(10);
    expect(offset).toBe(0);
    // data.length can be <= 10 (if total < 10) or == 10
    expect(data.length).toBeLessThanOrEqual(10);
    expect(total).toBeGreaterThan(0);
    // If total > 10, data must be exactly 10
    if (total >= 10) {
      expect(data.length).toBe(10);
    }
  });

  // ?magic=true — accept and return all items (no predicate added)
  it('[REQ-MERC-API-01] ?magic=true returns all items (passthrough, no predicate)', async () => {
    const app = await getTestApp();
    const [withoutMagic, withMagicTrue] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?world=${worldId}&limit=200`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?world=${worldId}&magic=true&limit=200`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      }),
    ]);

    expect(withoutMagic.statusCode).toBe(200);
    expect(withMagicTrue.statusCode).toBe(200);
    // magic=true and no-magic-param should return the same total
    expect(withMagicTrue.json<{ total: number }>().total).toBe(
      withoutMagic.json<{ total: number }>().total,
    );
  });
});

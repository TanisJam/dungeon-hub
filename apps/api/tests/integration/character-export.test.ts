/**
 * Integration tests for GET /characters/:id/export
 *
 * Covers: SCEN-AUTH-01–04, SCEN-ENV-01, SCEN-INV-01–02, SCEN-RAW-01, SCEN-SLUG-01–03
 * from sdd/character-json-export/spec (#1880).
 *
 * Stack required: Supabase + Postgres must be running locally.
 * Runs sequentially (singleFork) per vitest.config.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

describe('GET /characters/:id/export', () => {
  let owner: TestUser;
  let member: TestUser; // world-member but not owner
  let outsider: TestUser; // no relation at all
  let worldId: string;
  let campaignId: string;
  let charId: string;

  // ---- Fixture setup -------------------------------------------------------

  beforeAll(async () => {
    const app = await getTestApp();
    owner = await createTestUser();
    member = await createTestUser();
    outsider = await createTestUser();

    // Owner creates a campaign → world
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { name: 'Export Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // Add member as a world-member player (non-owner)
    await addCampaignAndWorldMember(campaignId, member.id, 'player');

    // Owner creates a character
    const charRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { worldId, name: 'Aria Stormwind' },
      })
      .then((r) => r.json());
    charId = charRes.id;
  });

  afterAll(async () => {
    if (owner) await deleteTestUser(owner.id);
    if (member) await deleteTestUser(member.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ---- Auth matrix ---------------------------------------------------------

  it('SCEN-AUTH-01: no token → 401', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charId}/export`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('SCEN-AUTH-02: valid JWT but unknown character id → 404', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/characters/00000000-0000-0000-0000-000000000000/export',
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('SCEN-AUTH-03: world-member (non-owner) → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charId}/export`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('SCEN-AUTH-04: owner → 200 with correct headers', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charId}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    // SCEN-SLUG-01: "Aria Stormwind" → "aria-stormwind"
    expect(res.headers['content-disposition']).toBe('attachment; filename="aria-stormwind.json"');
  });

  // ---- Envelope shape completeness -----------------------------------------

  it('SCEN-ENV-01: envelope has exactly the required keys, userId is ABSENT', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charId}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;

    // Top-level keys
    const topKeys = Object.keys(body).sort();
    expect(topKeys).toEqual(['character', 'exportedAt', 'schemaVersion']);

    // schemaVersion is the number 1 (REQ-EXP-ENV-04)
    expect(body['schemaVersion']).toBe(1);
    expect(typeof body['schemaVersion']).toBe('number');

    // exportedAt is a valid ISO 8601 string (REQ-EXP-ENV-05)
    expect(typeof body['exportedAt']).toBe('string');
    expect(new Date(body['exportedAt'] as string).getTime()).toBeGreaterThan(0);
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(body['exportedAt'] as string)).toBe(true);

    // character object keys
    const char = body['character'] as Record<string, unknown>;
    const charKeys = Object.keys(char).sort();
    expect(charKeys).toEqual(['data', 'id', 'inventory', 'name', 'status', 'worldId', 'xp']);

    // userId MUST NOT be present (REQ-EXP-ENV-03)
    expect(char['userId']).toBeUndefined();

    // Basic field values
    expect(char['id']).toBe(charId);
    expect(char['name']).toBe('Aria Stormwind');
    expect(char['worldId']).toBe(worldId);
    expect(typeof char['xp']).toBe('number');
  });

  // ---- Inventory non-lossy -------------------------------------------------

  it('SCEN-INV-01: inventory with items is preserved verbatim', async () => {
    const app = await getTestApp();
    // Seed inventory via the API (POST /characters/:id/inventory expects { item: { slug, source } })
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${charId}/inventory`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, quantity: 1 },
    });
    // 200 or 201 depending on API version; skip if item not in compendium (compendium may be empty)
    if (addRes.statusCode !== 200 && addRes.statusCode !== 201) {
      // Seed directly via DB instead
      const { db } = await import('../../src/infra/db/client.js');
      const { characters } = await import('../../src/infra/db/schema.js');
      const { eq } = await import('drizzle-orm');
      await db
        .update(characters)
        .set({
          inventory: [{ instanceId: 'iid-001', itemSlug: 'longsword', itemSource: 'PHB', quantity: 1, state: 'carried' }],
          updatedAt: new Date(),
        })
        .where(eq(characters.id, charId));
    }

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charId}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { character: { inventory: unknown } };
    // inventory must be an array (non-null, non-omitted) with the added item
    expect(Array.isArray(body.character.inventory)).toBe(true);
    const inv = body.character.inventory as Array<Record<string, unknown>>;
    const longsword = inv.find((i) => i['itemSlug'] === 'longsword');
    expect(longsword).toBeTruthy();
    expect(longsword!['itemSource']).toBe('PHB');
  });

  it('SCEN-INV-02: empty inventory is [] not null', async () => {
    // Create a fresh character with empty inventory
    const app = await getTestApp();
    const freshChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { worldId, name: 'EmptyInv Char' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${freshChar.id}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { character: { inventory: unknown } };
    expect(Array.isArray(body.character.inventory)).toBe(true);
    expect((body.character.inventory as unknown[]).length).toBe(0);
  });

  // ---- Raw passthrough -----------------------------------------------------

  it('SCEN-RAW-01: play-time fields in data survive verbatim (hp.current, exhaustion, etc.)', async () => {
    const app = await getTestApp();
    // Directly update the character data to inject play-time fields
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');

    await db
      .update(characters)
      .set({
        data: {
          hp: { current: 14, max: 22, temp: 5 },
          spellSlotsUsed: { '1': 2 },
          exhaustion: 1,
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, charId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charId}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { character: { data: Record<string, unknown> } };
    const data = body.character.data as Record<string, unknown>;
    const hp = data['hp'] as Record<string, unknown>;
    expect(hp['current']).toBe(14);
    expect(hp['temp']).toBe(5);
    const slots = data['spellSlotsUsed'] as Record<string, unknown>;
    expect(slots['1']).toBe(2);
    expect(data['exhaustion']).toBe(1);
  });

  // ---- Slug / Content-Disposition ------------------------------------------

  it('SCEN-SLUG-01: "Aria Stormwind" → "aria-stormwind.json"', async () => {
    // Already covered in SCEN-AUTH-04; re-verify explicitly
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charId}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.headers['content-disposition']).toBe('attachment; filename="aria-stormwind.json"');
  });

  // The accent-stripped form, not the old `bj-rn`: the API's private slug copy never
  // did the NFD decompose its own docstring described, so it disagreed with the web
  // download button on every accented name. Both now use the one shared slugify.
  it('SCEN-SLUG-02: "Björn, the 2nd!" → "bjorn-the-2nd.json"', async () => {
    const app = await getTestApp();
    const bjornChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { worldId, name: 'Björn, the 2nd!' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${bjornChar.id}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="bjorn-the-2nd.json"');
  });

  it('SCEN-SLUG-03: blank/whitespace name falls back to character-<id>.json', async () => {
    const app = await getTestApp();
    // Create a char then patch name to empty via DB direct (API may reject empty name)
    const blankChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { worldId, name: 'ToBeBlank' },
      })
      .then((r) => r.json());

    // Force empty name via DB
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db
      .update(characters)
      .set({ name: '', updatedAt: new Date() })
      .where(eq(characters.id, blankChar.id));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${blankChar.id}/export`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="character-${blankChar.id}.json"`,
    );
  });
});

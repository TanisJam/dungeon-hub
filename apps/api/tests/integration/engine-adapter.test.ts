import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Integration test — engine-adapter (Slice 4).
 *
 * Verifies that GET /characters/:id/sheet returns an additive `engineAc` field
 * derived by the engine modifier pipeline:
 *   REQ-ENGINEAC-01: engineAc.value = sheet.armorClass.value + 1 for a char
 *                    with equipped+attuned Cloak of Protection (DMG 159: +1 AC).
 *   REQ-ENGINEAC-02: legacy armorClass field is UNCHANGED (additive, non-breaking).
 *   REQ-ENGINEAC-03: engineAc.value = sheet.armorClass.value for a char with NO Cloak.
 */
describe('GET /characters/:id/sheet — engineAc (engine-adapter Slice 4)', () => {
  let user: TestUser;
  let charWithCloakId: string;
  let charNoCloakId: string;

  // Source tag for test data — easy to clean up without touching real data.
  const TEST_SOURCE = 'TEST_ENGINEAC';

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    // Create campaign (world) for both test characters.
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Engine Adapter Test Campaign' },
      })
      .then((r) => r.json());

    const worldId: string = campaign.worldId;

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // ── Character 1: Fighter unarmored (deterministic base AC = 10 + DEX mod) ──
    const char1 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId, name: 'Cloak Wearer' },
      })
      .then((r) => r.json());
    charWithCloakId = char1.id;

    // DEX 14 (mod +2) → unarmored AC = 12.
    await expectOk(
      'stats-char1',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charWithCloakId}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
        },
      }),
    );
    await expectOk(
      'class-char1',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charWithCloakId}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );

    // ── Character 2: same stat block, no Cloak (control) ──────────────────────
    const char2 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId, name: 'No Cloak Fighter' },
      })
      .then((r) => r.json());
    charNoCloakId = char2.id;

    await expectOk(
      'stats-char2',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charNoCloakId}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
        },
      }),
    );
    await expectOk(
      'class-char2',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charNoCloakId}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );

    // ── Seed Cloak of Protection compendium row (direct DB insert) ─────────────
    // Pattern from character-rests.test.ts L455 — raw insert to avoid HTTP flow.
    // Using TEST_SOURCE so afterAll cleanup is safe and scoped.
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems, characters } = await import('../../src/infra/db/schema.js');

    await db.insert(compendiumItems).values({
      slug: 'cloak-of-protection',
      source: TEST_SOURCE,
      name: 'Cloak of Protection',
      type: null,
      data: { wondrous: true, reqAttune: true },
    });

    // ── Equip Cloak on char1 via direct DB update ──────────────────────────────
    // Direct DB update mirrors the rests-test pattern (avoids attunement-cap
    // and HTTP validation noise when testing derive-on-read behavior).
    // InventoryItem requires: instanceId, itemSlug, itemSource, quantity, state,
    // attuned, customName, notes.
    const cloakInstanceId = randomUUID();
    await db
      .update(characters)
      .set({
        inventory: [
          {
            instanceId: cloakInstanceId,
            itemSlug: 'cloak-of-protection',
            itemSource: TEST_SOURCE,
            quantity: 1,
            state: 'equipped',
            attuned: true,
            customName: null,
            notes: '',
          },
        ],
      })
      .where(eq(characters.id, charWithCloakId));
  });

  afterAll(async () => {
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems } = await import('../../src/infra/db/schema.js');

    // Clean up seeded compendium row (scoped by TEST_SOURCE).
    await db.delete(compendiumItems).where(eq(compendiumItems.source, TEST_SOURCE));

    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  // REQ-ENGINEAC-01: equipped+attuned Cloak → engineAc.value = armorClass.value + 1.
  // REQ-ENGINEAC-02: legacy armorClass field present and unchanged (additive).
  it('REQ-ENGINEAC-01/02: engineAc.value = armorClass.value + 1 for char with equipped+attuned Cloak', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charWithCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Sanity: legacy armorClass present.
    const legacyAc: number = body.sheet.armorClass.value;
    expect(typeof legacyAc).toBe('number');

    // REQ-ENGINEAC-01: engine adds +1 from Cloak (DMG 159).
    expect(body.engineAc.value).toBe(legacyAc + 1);

    // REQ-ENGINEAC-01: breakdown contains at least a base source and a Cloak source.
    expect(Array.isArray(body.engineAc.breakdown)).toBe(true);
    expect(body.engineAc.breakdown.length).toBeGreaterThanOrEqual(2);

    // REQ-ENGINEAC-02: legacy armorClass is unchanged (additive field, not replaced).
    expect(body.sheet.armorClass.value).toBe(legacyAc);

    // REQ-ENGINEAC-02: other legacy fields still present.
    expect(body.inventory).toBeDefined();
    expect(body.inventoryEnriched).toBeDefined();
    expect(body.character).toBeDefined();
  });

  // REQ-ENGINEAC-03: no Cloak → engineAc.value = armorClass.value (empty modifier set).
  it('REQ-ENGINEAC-03: engineAc.value = armorClass.value for char with no Cloak', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charNoCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    const legacyAc: number = body.sheet.armorClass.value;
    expect(typeof legacyAc).toBe('number');

    // REQ-ENGINEAC-03: no modifier registered → engine resolves to base AC.
    expect(body.engineAc.value).toBe(legacyAc);

    // At least a base source present in breakdown.
    expect(Array.isArray(body.engineAc.breakdown)).toBe(true);
    expect(body.engineAc.breakdown.length).toBeGreaterThanOrEqual(1);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Integration test — engine-adapter (Slice 4 → Gate B migration).
 *
 * After engine-ac-authoritative Gate B, engineAc is no longer a top-level field.
 * AC is now served via sheet.armorClass.{value,formula} (engine-authoritative).
 *
 * REQ-AC-NATIVE-01: sheet.armorClass.value = no-item-baseline + 1 for char with
 *                   equipped+attuned Cloak of Protection (DMG 159: +1 AC).
 * REQ-AC-CONTRACT-02: body.engineAc must be undefined (top-level field removed).
 * REQ-AC-FORMULA-01: sheet.armorClass.formula contains the item label.
 */
describe('GET /characters/:id/sheet — engine-authoritative armorClass (Gate B)', () => {
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
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems, characters, modifierDefinitions } = await import('../../src/infra/db/schema.js');
    const { cloakOfProtectionRuleDoc } = await import('@dungeon-hub/domain/engine');

    await db.insert(compendiumItems).values({
      slug: 'cloak-of-protection',
      source: TEST_SOURCE,
      name: 'Cloak of Protection',
      type: null,
      data: { wondrous: true, reqAttune: true },
    });

    await db
      .insert(modifierDefinitions)
      .values({
        slug: 'cloak-of-protection',
        source: 'DMG 159',
        name: 'Cloak of Protection',
        kind: 'item',
        ruleDoc: cloakOfProtectionRuleDoc,
      })
      .onConflictDoNothing();

    // ── Equip Cloak on char1 via direct DB update ──────────────────────────────
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

  // REQ-AC-NATIVE-01: engine-authoritative sheet.armorClass.value includes Cloak +1.
  // REQ-AC-CONTRACT-02: body.engineAc must be absent (top-level field removed).
  it('REQ-AC-NATIVE-01: sheet.armorClass.value = no-item-baseline + 1 for char with equipped+attuned Cloak', async () => {
    const app = await getTestApp();

    // Capture no-item baseline from char2 (no Cloak, same stat block).
    const baselineRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charNoCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(baselineRes.statusCode).toBe(200);
    const baselineBody = baselineRes.json();
    const noItemBaseline: number = baselineBody.sheet.armorClass.value;
    expect(typeof noItemBaseline).toBe('number');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charWithCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // REQ-AC-NATIVE-01: Cloak +1 now lives INSIDE sheet.armorClass.value.
    expect(body.sheet.armorClass.value).toBe(noItemBaseline + 1);

    // REQ-AC-CONTRACT-02: top-level engineAc must be gone.
    expect(body.engineAc).toBeUndefined();

    // REQ-AC-FORMULA-01: item label appears in formula string.
    expect(typeof body.sheet.armorClass.formula).toBe('string');
    expect(body.sheet.armorClass.formula).toContain('Cloak of Protection');

    // Contract: other legacy fields still present.
    expect(body.inventory).toBeDefined();
    expect(body.inventoryEnriched).toBeDefined();
    expect(body.character).toBeDefined();
  });

  // REQ-AC-NATIVE-01: no-item char → sheet.armorClass.value is the unarmored baseline.
  it('REQ-AC-NATIVE-01: no-Cloak char → sheet.armorClass.value is unarmored baseline (no engineAc)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charNoCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(typeof body.sheet.armorClass.value).toBe('number');

    // REQ-AC-CONTRACT-02: engineAc must be absent.
    expect(body.engineAc).toBeUndefined();
  });
});

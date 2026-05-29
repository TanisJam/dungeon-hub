/**
 * Integration test — engine-catalog (Slice 6 → Gate B migration).
 *
 * After engine-ac-authoritative Gate B, item modifier AC contributions are
 * folded into sheet.armorClass.value (engine-authoritative). No top-level engineAc.
 *
 *   REQ-MDREFACTOR-01: Cloak equipped+attuned → sheet.armorClass.value = baseline + 1.
 *   REQ-CATALOG-HOMEBREW-01 (§1.2 proof): homebrew amulet row inserted directly →
 *     sheet.armorClass.value = baseline + 2. NO code change. Sentinel = +2.
 *   REQ-MDLOAD-01 tolerate-read: malformed modifier_definitions row → GET /sheet 200,
 *     sheet.armorClass.value is a number (valid entries still resolve).
 *   REQ-AC-CONTRACT-02: body.engineAc must be undefined (top-level field removed).
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-catalog (Slice 6) — modifier_definitions runtime source (Gate B)', () => {
  let user: TestUser;
  let charCloakId: string;
  let charAmuletId: string;
  let charMalformedId: string;
  let charBaselineId: string; // no items — baseline AC

  // Scoped source tag for safe afterAll cleanup.
  const TEST_SOURCE = 'TEST_ENGCAT';

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // Create a campaign for all test characters.
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Engine Catalog Test Campaign' },
      })
      .then((r) => r.json());
    const worldId: string = campaign.worldId;

    // Helper: create a minimal Fighter character (DEX 14, unarmored AC = 12).
    const makeChar = async (name: string): Promise<string> => {
      const created = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { worldId, name },
        })
        .then((r) => r.json());
      const id: string = created.id;

      await expectOk(
        `stats-${name}`,
        await app.inject({
          method: 'PUT',
          url: `/api/v1/characters/${id}/stats`,
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: {
            method: 'standard-array',
            scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
          },
        }),
      );
      await expectOk(
        `class-${name}`,
        await app.inject({
          method: 'PUT',
          url: `/api/v1/characters/${id}/class`,
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: {
            class: { slug: 'fighter', source: 'PHB' },
            level: 1,
            skillChoices: ['athletics', 'perception'],
          },
        }),
      );
      return id;
    };

    charCloakId = await makeChar('Catalog Cloak Wearer');
    charAmuletId = await makeChar('Catalog Amulet Wearer');
    charMalformedId = await makeChar('Catalog Malformed Row Char');
    charBaselineId = await makeChar('Catalog Baseline (no items)');

    // ── Direct DB seeding ─────────────────────────────────────────────────────
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems, characters, modifierDefinitions } = await import(
      '../../src/infra/db/schema.js'
    );
    const { cloakOfProtectionRuleDoc } = await import('@dungeon-hub/domain/engine');

    // ── 1. Seed Cloak modifier_definition row ─────────────────────────────────
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

    // ── 2. Seed homebrew amulet-of-test modifier_definition row (§1.2 proof) ──
    const amuletRuleDoc = {
      id: 'amulet-of-test',
      source: 'homebrew',
      ruleText: '+2 bonus to AC while worn.',
      params: [
        { name: 'charId', type: 'EntityId' },
        { name: 'itemId', type: 'string' },
      ],
      emits: [
        {
          def: { kind: 'num', op: 'add', value: 2, stat: 'ac', category: 'item' },
          scope: { owner: '{charId}', target: { axis: 'self' }, trigger: 'always' },
          label: 'Amulet of Test',
          idTemplate: '{ruleId}-ac-{charId}-{itemId}',
        },
      ],
      testCases: [],
    };

    await db
      .insert(modifierDefinitions)
      .values({
        slug: 'amulet-of-test',
        source: 'homebrew',
        name: 'Amulet of Test',
        kind: 'item',
        ruleDoc: amuletRuleDoc,
      })
      .onConflictDoNothing();

    // ── 3. Seed compendium_items rows ─────────────────────────────────────────
    await db.insert(compendiumItems).values([
      {
        slug: 'cloak-of-protection',
        source: TEST_SOURCE,
        name: 'Cloak of Protection',
        type: null,
        data: { wondrous: true, reqAttune: true },
      },
      {
        slug: 'amulet-of-test',
        source: TEST_SOURCE,
        name: 'Amulet of Test',
        type: null,
        data: { wondrous: true, reqAttune: true },
      },
    ]);

    // ── 4. Equip + attune Cloak on charCloakId ────────────────────────────────
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
      .where(eq(characters.id, charCloakId));

    // ── 5. Equip + attune amulet-of-test on charAmuletId ─────────────────────
    const amuletInstanceId = randomUUID();
    await db
      .update(characters)
      .set({
        inventory: [
          {
            instanceId: amuletInstanceId,
            itemSlug: 'amulet-of-test',
            itemSource: TEST_SOURCE,
            quantity: 1,
            state: 'equipped',
            attuned: true,
            customName: null,
            notes: '',
          },
        ],
      })
      .where(eq(characters.id, charAmuletId));
  });

  afterAll(async () => {
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems, modifierDefinitions } = await import('../../src/infra/db/schema.js');

    // Clean up test-scoped compendium rows.
    await db.delete(compendiumItems).where(eq(compendiumItems.source, TEST_SOURCE));
    // Clean up homebrew modifier_definition rows created in this test.
    await db.delete(modifierDefinitions).where(eq(modifierDefinitions.source, 'homebrew'));

    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  // Helper: capture baseline AC for a no-item char.
  async function captureBaseline(): Promise<number> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charBaselineId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json().sheet.armorClass.value as number;
  }

  // ── Case (a): REQ-MDREFACTOR-01 ──────────────────────────────────────────────
  // Cloak equipped+attuned → sheet.armorClass.value = baseline + 1 (via DB catalog).
  it('(a) REQ-MDREFACTOR-01: Cloak from DB catalog → sheet.armorClass.value = baseline + 1', async () => {
    const app = await getTestApp();
    const baseline = await captureBaseline();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // REQ-MDREFACTOR-01: Cloak +1 comes from the DB catalog, now inside sheet.armorClass.value.
    expect(body.sheet.armorClass.value).toBe(baseline + 1);

    // REQ-AC-FORMULA-01: formula contains the Cloak label.
    expect(body.sheet.armorClass.formula).toContain('Cloak of Protection');

    // REQ-AC-CONTRACT-02: engineAc must be gone.
    expect(body.engineAc).toBeUndefined();
  });

  // ── Case (b): REQ-CATALOG-HOMEBREW-01 (§1.2 proof) ───────────────────────────
  // Homebrew amulet-of-test row inserted directly → sheet.armorClass.value = baseline + 2.
  it('(b) REQ-CATALOG-HOMEBREW-01: homebrew amulet +2 — §1.2 proof, NO code change', async () => {
    const app = await getTestApp();
    const baseline = await captureBaseline();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charAmuletId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // §1.2 sentinel: +2. Slug-miss → +0 → test fails → proves catalog is live.
    expect(body.sheet.armorClass.value).toBe(baseline + 2);

    // REQ-AC-FORMULA-01: formula contains the amulet label.
    expect(body.sheet.armorClass.formula).toContain('Amulet of Test');

    // REQ-AC-CONTRACT-02: engineAc must be gone.
    expect(body.engineAc).toBeUndefined();
  });

  // ── Case (c): REQ-MDLOAD-01 tolerate-read ────────────────────────────────────
  // A malformed modifier_definitions row must NEVER crash GET /sheet.
  it('(c) REQ-MDLOAD-01: malformed ruleDoc row → GET /sheet 200, sheet.armorClass.value is a number', async () => {
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierDefinitions } = await import('../../src/infra/db/schema.js');

    const malformedSlug = `broken-def-${randomUUID()}`;
    await db.insert(modifierDefinitions).values({
      slug: malformedSlug,
      source: 'homebrew',
      name: 'Broken Definition',
      kind: 'item',
      ruleDoc: {
        id: malformedSlug,
        source: 'homebrew',
        ruleText: 'Broken.',
        params: [],
        emits: [
          {
            def: { kind: 'BOGUS_KIND_UNKNOWN', value: 99, stat: 'ac' },
            scope: { owner: '{charId}', target: { axis: 'self' }, trigger: 'always' },
            label: 'Broken',
            idTemplate: '{ruleId}-{charId}',
          },
        ],
        testCases: [],
      },
    });

    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charMalformedId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    // §11 tolerate-read: the malformed row is warn-skipped; GET /sheet must return 200.
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Sheet must be present and armorClass is a number.
    expect(body.sheet).toBeDefined();
    expect(typeof body.sheet.armorClass.value).toBe('number');

    // REQ-AC-CONTRACT-02: engineAc must be gone.
    expect(body.engineAc).toBeUndefined();

    // Cloak character still resolves correctly after the malformed row was inserted.
    const baseline = await captureBaseline();
    const cloakRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(cloakRes.statusCode).toBe(200);
    const cloakBody = cloakRes.json();
    // The +1 must still hold after malformed row insertion.
    expect(cloakBody.sheet.armorClass.value).toBe(baseline + 1);
  });
});

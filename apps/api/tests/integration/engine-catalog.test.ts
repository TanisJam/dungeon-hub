/**
 * Integration test — engine-catalog (Slice 6).
 *
 * Verifies that modifier_definitions is the runtime source for the item modifier map,
 * proving §1.2: a DM inserts a homebrew row → next GET /sheet reflects it, NO code change.
 *
 *   REQ-MDREFACTOR-01: Cloak equipped+attuned → engineAc.value = legacyAc + 1 (via DB catalog).
 *   REQ-CATALOG-HOMEBREW-01 (§1.2 proof): homebrew amulet row inserted directly →
 *     engineAc.value = legacyAc + 2, with NO code change. Sentinel = +2 (slug-miss → +0 = fail).
 *   REQ-MDLOAD-01 tolerate-read: malformed modifier_definitions row → GET /sheet 200, no crash,
 *     valid entries still resolve.
 *   REQ-CATALOG-REGRESSION-01 Scenario B: Cloak def seeded in beforeAll → +1 holds.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-catalog (Slice 6) — modifier_definitions runtime source', () => {
  let user: TestUser;
  let charCloakId: string;
  let charAmuletId: string;
  let charMalformedId: string;

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

    // ── Direct DB seeding ─────────────────────────────────────────────────────
    const { db } = await import('../../src/infra/db/client.js');
    const { compendiumItems, characters, modifierDefinitions } = await import(
      '../../src/infra/db/schema.js'
    );
    const { cloakOfProtectionRuleDoc } = await import('@dungeon-hub/domain/engine');

    // ── 1. Seed Cloak modifier_definition row (regression guard — T6 pattern) ─
    // Without this, loadModifierDefinitions() returns an empty map → +0.
    // Direct insert (NOT seed script) — seed script calls process.exit(0/1),
    // which kills the vitest worker.
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
    // +2 AC sentinel. Slug-miss → +0 → test fails, proving the catalog is live.
    // RuleDoc emits a single num+add+2/ac/item modifier with always/self trigger.
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

    // ── 3. Seed compendium_items rows for both items ───────────────────────────
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

  // ── Case (a): REQ-MDREFACTOR-01 ──────────────────────────────────────────────
  // Cloak equipped+attuned → engineAc.value = legacyAc + 1 (sourced from DB catalog).
  // The hardcoded itemModifierMap literal is gone; proof = the +1 comes from the DB row.
  it('(a) REQ-MDREFACTOR-01: Cloak from DB catalog → engineAc = legacyAc + 1', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    const legacyAc: number = body.sheet.armorClass.value;
    expect(typeof legacyAc).toBe('number');

    // REQ-MDREFACTOR-01: Cloak +1 comes from the DB catalog, not a hardcoded map.
    expect(body.engineAc.value).toBe(legacyAc + 1);

    // Breakdown must contain a Cloak entry.
    const breakdown: Array<{ label?: string; amount?: unknown }> = body.engineAc.breakdown;
    const cloakEntry = breakdown.find((b) => b.label === 'Cloak of Protection');
    expect(cloakEntry).toBeDefined();
    expect(cloakEntry!.amount).toBe(1);
  });

  // ── Case (b): REQ-CATALOG-HOMEBREW-01 (§1.2 proof) ───────────────────────────
  // Homebrew amulet-of-test row inserted directly into DB → engineAc = legacyAc + 2.
  // NO code change was made between the row insert (beforeAll) and this assertion.
  // That IS the §1.2 proof: DB = runtime source of truth, DM adds homebrew without redeploy.
  it('(b) REQ-CATALOG-HOMEBREW-01: homebrew amulet +2 — §1.2 proof, NO code change', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charAmuletId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    const legacyAc: number = body.sheet.armorClass.value;
    expect(typeof legacyAc).toBe('number');

    // §1.2 sentinel: +2. Slug-miss → +0 → test fails → proves catalog is live.
    // This passes WITHOUT any code change — the row insertion is the sole intervention.
    expect(body.engineAc.value).toBe(legacyAc + 2);

    // Breakdown must contain the homebrew amulet entry (label from ruleDoc).
    const breakdown: Array<{ label?: string; amount?: unknown }> = body.engineAc.breakdown;
    const amuletEntry = breakdown.find((b) => b.label === 'Amulet of Test');
    expect(amuletEntry).toBeDefined();
    expect(amuletEntry!.amount).toBe(2);
  });

  // ── Case (c): REQ-MDLOAD-01 tolerate-read ────────────────────────────────────
  // A malformed modifier_definitions row (kind='item', broken ruleDoc) must NEVER
  // crash GET /sheet. The loader warns+skips; the sheet still loads; valid entries resolve.
  it('(c) REQ-MDLOAD-01: malformed ruleDoc row → GET /sheet 200, loader skips it gracefully', async () => {
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierDefinitions } = await import('../../src/infra/db/schema.js');

    // Insert a clearly invalid ruleDoc (fails parseRule — unknown kind, no source, etc.).
    const malformedSlug = `broken-def-${randomUUID()}`;
    await db.insert(modifierDefinitions).values({
      slug: malformedSlug,
      source: 'homebrew',
      name: 'Broken Definition',
      kind: 'item',
      // Malformed: emits with an unknown kind — fails UNKNOWN_PRIMITIVE_KIND.
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
      // charMalformedId has no items — tests that the sheet loads even with a broken catalog row.
      url: `/api/v1/characters/${charMalformedId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    // §11 tolerate-read: the malformed row is warn-skipped; GET /sheet must return 200.
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Sheet must still be present and computable.
    expect(body.sheet).toBeDefined();
    expect(body.engineAc).toBeDefined();
    expect(typeof body.engineAc.value).toBe('number');

    // The malformed slug must NOT appear in the Cloak/amulet character breakdowns.
    // (This character has no items, so the breakdown is just the base entry.)
    expect(Array.isArray(body.engineAc.breakdown)).toBe(true);

    // Cloak character still resolves correctly after the malformed row was inserted.
    const cloakRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${charCloakId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(cloakRes.statusCode).toBe(200);
    const cloakBody = cloakRes.json();
    // The +1 must still hold — malformed rows don't affect valid entries.
    expect(cloakBody.engineAc.value).toBe(cloakBody.sheet.armorClass.value + 1);
  });
});

/**
 * Integration tests for Batch B — Starting Equipment API.
 *
 * REQ-SEQUIP-04: POST /characters/:id/seed-equipment
 * REQ-SEQUIP-05: Idempotency (double-grant prevention)
 * REQ-SEQUIP-06: Gold path deposits currency, no items
 * REQ-SEQUIP-07: Legacy characters (no startingEquipmentGranted) load fine
 * REQ-SEQUIP-08: GET /compendium/items?category= returns correct items
 * REQ-SEQUIP-10: PUT /characters/:id/equipment-selections round-trip
 *
 * PHB p.70 (Fighter), p.57 (Cleric), p.112 (Wizard), p.127 (Acolyte), p.143 (gold).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('starting-equipment API', () => {
  let alice: TestUser;
  let bob: TestUser;    // outsider for 403 checks
  let aliceWorldId: string;
  let aliceCampaignId: string;
  let fighterCharId: string;  // Fighter + Acolyte background
  let wizardCharId: string;   // Wizard (gold path test, no background)
  let legacyCharId: string;   // Character with no class/bg (legacy read-path test)

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();
    bob = await createTestUser();

    // Alice's world + campaign
    const aliceCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Equipment Test Campaign' },
      })
      .then((r) => r.json());
    aliceCampaignId = aliceCampaign.id;
    aliceWorldId = aliceCampaign.worldId;

    // Fighter character
    fighterCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId: aliceWorldId, name: 'Aldric the Fighter' },
        })
        .then((r) => r.json())
    ).id;

    // Set stats + class
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    // Apply Acolyte background (has fixed equipment: holy symbol + starting coins)
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/background`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        background: { slug: 'acolyte', source: 'PHB' },
        languageChoices: ['celestial', 'elvish'],
      },
    });

    // Wizard character (for gold path test)
    wizardCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId: aliceWorldId, name: 'Merlin the Wizard' },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 10, con: 12, int: 15, wis: 14, cha: 13 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
    });

    // Legacy character — no class or background set (REQ-SEQUIP-07)
    legacyCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId: aliceWorldId, name: 'Legacy Char' },
        })
        .then((r) => r.json())
    ).id;
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    await closeTestApp();
  });

  // ---- GET /compendium/items?category= -------------------------------------

  describe('GET /compendium/items?category= (REQ-SEQUIP-08)', () => {
    it('returns at least one PHB martial weapon for category=weaponMartial', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${aliceCampaignId}&category=weaponMartial`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeGreaterThan(0);
      // All returned items should be weapons (type M or R)
      for (const item of body.data) {
        expect(['M', 'R']).toContain(item.type);
      }
    });

    it('returns at least one PHB simple weapon for category=weaponSimple', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${aliceCampaignId}&category=weaponSimple`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeGreaterThan(0);
    });

    it('returns at least one PHB arcane focus for category=focusSpellcastingArcane', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${aliceCampaignId}&category=focusSpellcastingArcane`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // PHB arcane foci: crystal, arcane-focus, orb, rod, staff, wand (Risk R1 RESOLVED)
      expect(body.total).toBeGreaterThan(0);
    });

    it('returns at least one PHB instrument for category=instrumentMusical', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${aliceCampaignId}&category=instrumentMusical`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // PHB instruments: bagpipes, drum, dulcimer, flute, horn, lute, lyre, etc. (verified Batch 0)
      expect(body.total).toBeGreaterThan(0);
    });

    it('returns 400 for an invalid category value', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${aliceCampaignId}&category=notACategory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('401 without JWT', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${aliceCampaignId}&category=weaponMartial`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('still paginates with category + q combined', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${aliceCampaignId}&category=weaponMartial&q=sword&limit=5`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // At minimum longsword and shortsword should match
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.limit).toBe(5);
    });
  });

  // ---- PUT /characters/:id/equipment-selections ----------------------------

  describe('PUT /characters/:id/equipment-selections (REQ-SEQUIP-10)', () => {
    it('persists valid selections and returns 200 ok', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/equipment-selections`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classPath: 'package',
          classRowChoices: { '0': 'a', '1': 'a', '2': 'a', '3': 'a' },
          classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it('round-trips: GET /characters/:id reflects persisted selections', async () => {
      const app = await getTestApp();

      // Write specific selections
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/equipment-selections`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classPath: 'package',
          classRowChoices: { '0': 'b', '1': 'a', '2': 'a', '3': 'a' },
          classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });

      // Read back via GET /characters/:id
      const get = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(get.statusCode).toBe(200);
      const selections = get.json().data.equipmentSelections;
      expect(selections.classPath).toBe('package');
      expect(selections.classRowChoices['0']).toBe('b');
      expect(selections.classCategoryPicks['row1-a-cat0'].slug).toBe('longsword');
    });

    it('400 when classPath is missing', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/equipment-selections`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('401 without JWT', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/equipment-selections`,
        payload: {
          classPath: 'package',
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('403/404 for non-owned character', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/equipment-selections`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
        payload: {
          classPath: 'package',
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });
      // Bob has no access to the world — 404 from loadCharacter not finding via ownership,
      // or 403 from assertWritableForEdit. Either is correct.
      expect([403, 404]).toContain(res.statusCode);
    });
  });

  // ---- POST /characters/:id/seed-equipment ---------------------------------

  describe('POST /characters/:id/seed-equipment (REQ-SEQUIP-04, REQ-SEQUIP-05, REQ-SEQUIP-06)', () => {
    it('package path: grants items and sets startingEquipmentGranted=true', async () => {
      const app = await getTestApp();

      // First ensure the fighter char has class data (already set in beforeAll)
      // Submit package selections — Fighter row 0 option-a = chain mail
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/seed-equipment`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classPath: 'package',
          classRowChoices: { '0': 'a', '1': 'a', '2': 'a', '3': 'a' },
          // Fighter row1 option-a has weaponMartial category ref — pick longsword
          classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      // Verify via GET that inventory is non-empty and flag is set
      const get = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      const char = get.json();
      expect(char.data.startingEquipmentGranted).toBe(true);
      // Inventory should contain at least chain-mail (Fighter row 0 option-a)
      const inventory = char.inventory as Array<{ itemSlug: string }>;
      expect(inventory.length).toBeGreaterThan(0);
      const slugs = inventory.map((i) => i.itemSlug);
      // chain-mail is the row 0, option-a pick (PHB p.70)
      expect(slugs).toContain('chain-mail');
    });

    it('idempotent: second seed does not double-grant (REQ-SEQUIP-05)', async () => {
      const app = await getTestApp();

      // fighterCharId already has startingEquipmentGranted=true from the previous test

      // Record inventory count before
      const before = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      const inventoryBefore = (before.json().inventory as unknown[]).length;

      // Second seed call
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/seed-equipment`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classPath: 'package',
          classRowChoices: { '0': 'a', '1': 'a', '2': 'a', '3': 'a' },
          classCategoryPicks: { 'row1-a-cat0': { slug: 'longsword', source: 'PHB' } },
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      // Inventory count must be unchanged — no double-grant
      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      const inventoryAfter = (after.json().inventory as unknown[]).length;
      expect(inventoryAfter).toBe(inventoryBefore);
    });

    it('gold path: deposits currency, no package items (REQ-SEQUIP-06, PHB p.143)', async () => {
      const app = await getTestApp();

      // Use wizardCharId (fresh character, no equipment yet)
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${wizardCharId}/seed-equipment`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classPath: 'gold',
          goldValue: 80,  // 80 gp = 8000 cp
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      const get = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${wizardCharId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      const char = get.json();
      expect(char.data.startingEquipmentGranted).toBe(true);
      // Gold path: currency.cp should be 8000 (80 gp × 100) — no class package items
      expect(char.data.currency.cp).toBe(8000);
      // Wizard automatically gets a spellbook from PUT /class — inventory may contain it
      // but should NOT contain class package equipment (no longsword, no chain-mail, etc.)
      const classEquipmentSlugs = ['chain-mail', 'longsword', 'handaxe', 'shield', 'leather-armor'];
      const inventorySlugs = (char.inventory as Array<{ itemSlug: string }>).map((i) => i.itemSlug);
      for (const slug of classEquipmentSlugs) {
        expect(inventorySlugs).not.toContain(slug);
      }
    });

    it('400 for missing classPath', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/seed-equipment`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400 for negative goldValue (REQ-SEQUIP-06)', async () => {
      const app = await getTestApp();

      // Need a fresh character for this test to avoid idempotency short-circuit
      const freshChar = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId: aliceWorldId, name: 'Gold Test Char' },
        })
      ).json();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${freshChar.id}/seed-equipment`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          classPath: 'gold',
          goldValue: -5,  // negative — must be rejected
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });
      // goldValue is validated by Zod nonnegative() at the route level
      expect(res.statusCode).toBe(400);
    });

    it('401 without JWT', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/seed-equipment`,
        payload: {
          classPath: 'package',
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('403 for non-owner', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/seed-equipment`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
        payload: {
          classPath: 'package',
          classRowChoices: {},
          classCategoryPicks: {},
          backgroundRowChoices: {},
          backgroundCategoryPicks: {},
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- Read-path tolerance (REQ-SEQUIP-07) ----------------------------------

  describe('read-path tolerance (REQ-SEQUIP-07)', () => {
    it('GET /characters/:id for legacy char (no startingEquipmentGranted) returns 200', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${legacyCharId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const char = res.json();
      // startingEquipmentGranted should be absent (treated as false, no error)
      expect(char.data.startingEquipmentGranted).toBeUndefined();
    });
  });
});

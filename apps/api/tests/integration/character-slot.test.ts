/**
 * Integration tests for POST /characters/:id/spell-slots/use (SP-05).
 * REQ-SP05-ENDPOINT-CONSUME, REQ-SP05-ENDPOINT-PERSISTS, REQ-SP05-READ-PATH-TOLERANCE.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('POST /characters/:id/spell-slots/use', () => {
  let player: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let wizardCharId: string;
  let warlockCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    player = await createTestUser();
    outsider = await createTestUser();

    // DM = player for simplicity (campaign owner).
    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${player.accessToken}` },
          payload: { name: 'Slot Test Campaign' },
        })
        .then((r) => r.json())
    ).id;

    // --- Wizard L3: slots L1=4, L2=2 (PHB p.113).
    // Use PATCH to directly set class data — avoids brittle level-up chain in test setup.
    {
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${player.accessToken}` },
          payload: { campaignId, name: 'Ariane Wizard' },
        })
        .then((r) => r.json());
      wizardCharId = c.id;

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/characters/${wizardCharId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: {
          data: {
            classes: [
              {
                slug: 'wizard',
                source: 'PHB',
                level: 3,
                hitDie: 'd6',
                subclass: null,
                savingThrows: ['int', 'wis'],
                armorProficiencies: [],
                weaponProficiencies: [],
                toolProficiencies: [],
                skillChoices: ['arcana', 'investigation'],
              },
            ],
            baseStats: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
            spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
            warlockSlotsUsed: 0,
          },
        },
      });
    }

    // --- Warlock L5: pactMagic slotLevel=3, slotCount=2 (PHB p.107).
    // Direct PATCH to avoid level-up chain complexity.
    {
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${player.accessToken}` },
          payload: { campaignId, name: 'Elias Warlock' },
        })
        .then((r) => r.json());
      warlockCharId = c.id;

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/characters/${warlockCharId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: {
          data: {
            classes: [
              {
                slug: 'warlock',
                source: 'PHB',
                level: 5,
                hitDie: 'd8',
                subclass: { slug: 'warlock--fiend', source: 'PHB' },
                savingThrows: ['wis', 'cha'],
                armorProficiencies: ['light'],
                weaponProficiencies: ['simple'],
                toolProficiencies: [],
                skillChoices: ['arcana', 'deception'],
              },
            ],
            baseStats: { str: 8, dex: 12, con: 13, int: 10, wis: 14, cha: 15 },
            spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
            warlockSlotsUsed: 0,
          },
        },
      });
    }
  });

  afterAll(async () => {
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // SP-07: REQ-SP07-SLOTS-USE-401 — unauthenticated request must return 401 ----

  it('SP-07 REQ-SP07-SLOTS-USE-401: POST /spell-slots/use without Bearer token → 401 UNAUTHORIZED', async () => {
    // No auth header — server must reject with 401 per API conventions (CLAUDE.md §6)
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spell-slots/use`,
      // No authorization header
      payload: { level: 1, slotType: 'regular' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('200 happy path regular: Wizard L3 consumes L1 slot → spellSlotsUsed[0] = 1', async () => {
    const app = await getTestApp();

    // Ensure clean state.
    const charPre = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    }).then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charPre.data, spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spell-slots/use`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { level: 1, slotType: 'regular' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spellSlotsUsed[0]).toBe(1);
  });

  it('200 happy path pact: Warlock L5 consumes L3 pact slot → warlockSlotsUsed = 1', async () => {
    const app = await getTestApp();

    // Ensure clean pact state.
    const charPre = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${warlockCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    }).then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${warlockCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charPre.data, warlockSlotsUsed: 0 } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${warlockCharId}/spell-slots/use`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { level: 3, slotType: 'pact' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.warlockSlotsUsed).toBe(1);
  });

  it('400 SLOT_NOT_AVAILABLE: Wizard with all L1 slots spent', async () => {
    const app = await getTestApp();

    // Spend all L1 slots (Wizard L3 has 4 L1 slots).
    const charPre = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    }).then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charPre.data, spellSlotsUsed: [4, 0, 0, 0, 0, 0, 0, 0, 0] } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spell-slots/use`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { level: 1, slotType: 'regular' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues[0].code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('400 PACT_LEVEL_MISMATCH: Warlock requests wrong pact level', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${warlockCharId}/spell-slots/use`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { level: 2, slotType: 'pact' }, // L5 warlock has pact at L3
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues[0].code).toBe('PACT_LEVEL_MISMATCH');
  });

  it('400 NO_PACT_MAGIC: Wizard (non-warlock) requests pact slot', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spell-slots/use`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { level: 1, slotType: 'pact' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues[0].code).toBe('NO_PACT_MAGIC');
  });

  it('403 non-owner attempt', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spell-slots/use`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { level: 1, slotType: 'regular' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('404 non-existent character', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/00000000-0000-0000-0000-000000000000/spell-slots/use',
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { level: 1, slotType: 'regular' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('legacy GET sheet (no spellSlotsUsed in JSONB) → 200 with slotsUsed=[0×9] (REQ-SP05-READ-PATH-TOLERANCE)', async () => {
    const app = await getTestApp();

    // Remove spellSlotsUsed from JSONB to simulate pre-SP-05 character.
    const charPre = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    }).then((r) => r.json());
    const { spellSlotsUsed: _removed, ...dataWithout } = charPre.data as Record<string, unknown>;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: dataWithout },
    });

    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}/sheet`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });

    expect(sheetRes.statusCode).toBe(200);
    const sheet = sheetRes.json();
    expect(sheet.sheet.spellSlots.slotsUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sheet.sheet.spellSlots.pactSlotsUsed).toBe(0);
  });

  it('JSONB round-trip: consume L2 slot → GET sheet shows slotsUsed[1]=1 (REQ-SP05-ENDPOINT-PERSISTS)', async () => {
    const app = await getTestApp();

    // Reset slots.
    const charPre = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    }).then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { data: { ...charPre.data, spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    });

    // Consume a L2 slot.
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spell-slots/use`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { level: 2, slotType: 'regular' },
    });

    // Verify via GET sheet.
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}/sheet`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });

    expect(sheetRes.statusCode).toBe(200);
    const sheet = sheetRes.json();
    expect(sheet.sheet.spellSlots.slotsUsed[1]).toBe(1);
  });
});

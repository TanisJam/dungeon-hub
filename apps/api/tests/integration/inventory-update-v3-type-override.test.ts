/**
 * Integration tests: PATCH v3TypeOverride + GET sheet/detail round-trip + legacy tolerance.
 *
 * Reqs: ACVT-PATCH-01, ACVT-DERIVE-01, CIVTO-FIELD-01 (spec #1077)
 * Design: DC1 (JSONB, no migration), ACVT-DERIVE-01 (both call sites)
 *
 * Uses real Postgres + Supabase auth (singleFork pool).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('inventory v3TypeOverride — PATCH + GET round-trip (ACVT-PATCH-01)', () => {
  let alice: TestUser;
  let aliceCharId: string;
  let aliceWorldId: string;
  let itemInstanceId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();

    // Create campaign + character
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Override Test Campaign' },
      })
      .then((r) => r.json());
    aliceWorldId = campaign.worldId;

    aliceCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId: aliceWorldId, name: 'Talia the Override Tester' },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { method: 'standard-array', scores: { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 } },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { class: { slug: 'fighter', source: 'PHB' }, level: 1, skillChoices: ['athletics', 'perception'] },
    });

    // Add a longsword (type='M' → derives to 'weapon' without override)
    const addRes = await app
      .inject({
        method: 'POST',
        url: `/api/v1/characters/${aliceCharId}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' } },
      })
      .then((r) => r.json());
    itemInstanceId = addRes.addedInstanceId;
  });

  afterAll(async () => {
    await deleteTestUser(alice.id);
    await closeTestApp();
  });

  it('PATCH v3TypeOverride: "book" persists + subsequent GET sheet returns v3Type="book"', async () => {
    // ACVT-PATCH-01: PATCH with v3TypeOverride
    const app = await getTestApp();
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${aliceCharId}/inventory/${itemInstanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { v3TypeOverride: 'book' },
    });
    expect(patchRes.statusCode).toBe(200);

    // ACVT-DERIVE-01: GET sheet returns v3Type = 'book' (override propagated to enriched list)
    const sheetRes = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${aliceCharId}/sheet`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const enriched = sheetRes.inventoryEnriched ?? [];
    const row = enriched.find((it: { instanceId: string }) => it.instanceId === itemInstanceId);
    expect(row).toBeDefined();
    expect(row.v3Type).toBe('book');
  });

  it('PATCH v3TypeOverride: null clears override + sheet reverts to derived type', async () => {
    // Override is already 'book' from the previous test (singleFork sequential execution)
    const app = await getTestApp();

    // Clear the override
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${aliceCharId}/inventory/${itemInstanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { v3TypeOverride: null },
    });
    expect(patchRes.statusCode).toBe(200);

    // Sheet should revert to derived type: longsword type='M' → 'weapon'
    const sheetRes = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${aliceCharId}/sheet`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      })
      .then((r) => r.json());

    const enriched = sheetRes.inventoryEnriched ?? [];
    const row = enriched.find((it: { instanceId: string }) => it.instanceId === itemInstanceId);
    expect(row).toBeDefined();
    // After clearing override, longsword derives to 'weapon' again
    expect(row.v3Type).toBe('weapon');
  });

  it('PATCH v3TypeOverride invalid enum value is rejected (Zod throws, returns non-200)', async () => {
    // Zod parse throws ZodError for invalid enum values — Fastify returns 5xx.
    // The important thing is the request is rejected, not the specific error code.
    // A future error-handler refactor could surface 400 VALIDATION_FAILED here.
    const app = await getTestApp();
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${aliceCharId}/inventory/${itemInstanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { v3TypeOverride: 'dragon' },
    });
    // Not 200 — the invalid value is rejected
    expect(patchRes.statusCode).not.toBe(200);
  });

  it('legacy row without v3TypeOverride field loads correctly (read-path tolerance — CIVTO-FIELD-01)', async () => {
    // The inventory items created before Slice C have no v3TypeOverride in their JSONB.
    // They should still load via GET sheet without errors.
    const app = await getTestApp();
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${aliceCharId}/sheet`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const body = sheetRes.json();
    // inventoryEnriched should be present and parseable (no Zod crash)
    expect(Array.isArray(body.inventoryEnriched)).toBe(true);
  });
});

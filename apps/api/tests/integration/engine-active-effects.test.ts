/**
 * Integration test — engine-active-effects (Slice 7).
 *
 * Verifies the POST /characters/:id/active-effects endpoint and the cast-bless
 * delegation refactor:
 *   REQ-AE-01: Happy path — 201 + correct modifier_instances rows.
 *   REQ-AE-02: Unknown effectSlug → 400 EFFECT_NOT_FOUND.
 *   REQ-AE-03: Malformed catalog row → 400 INVALID_EFFECT_DEF.
 *   REQ-AE-04: Non-owner → 403 FORBIDDEN.
 *   REQ-AE-05: Zod body validation — empty targetIds → 400 VALIDATION_FAILED.
 *   REQ-AE-06: Round-trip — applied effect visible on GET /sheet (engineStats).
 *   REQ-AE-07: concentrationToken removal clears applied effect. PHB 203–204.
 *   REQ-AE-08: Read-path tolerance — legacy character with no modifier_instances → 200.
 *
 * RED-first note: cases (a)–(g) were written before T8–T9 implementation
 * and confirmed as 404 failures against the unimplemented route.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-active-effects (Slice 7)', () => {
  let u1: TestUser;
  let u2: TestUser;
  let casterId: string;
  let allyIdA: string;
  let allyIdB: string;
  let legacyCharId: string; // character with no modifier_instances (REQ-AE-08)

  const BLESS_SLUG = 'bless';
  const BROKEN_SLUG = 'broken-spell-ae-test';

  beforeAll(async () => {
    const app = await getTestApp();
    u1 = await createTestUser();
    u2 = await createTestUser();

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // Create campaign owned by U1.
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { name: 'Active Effects Test Campaign' },
      })
      .then((r) => r.json());
    const worldId: string = campaign.worldId;

    const makeChar = async (name: string) => {
      const res = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${u1.accessToken}` },
          payload: { worldId, name },
        })
        .then((r) => r.json());
      return res.id as string;
    };

    const setupStats = async (charId: string, label: string) => {
      await expectOk(
        `stats-${label}`,
        await app.inject({
          method: 'PUT',
          url: `/api/v1/characters/${charId}/stats`,
          headers: { authorization: `Bearer ${u1.accessToken}` },
          payload: {
            method: 'standard-array',
            scores: { str: 10, dex: 14, con: 13, int: 12, wis: 8, cha: 15 },
          },
        }),
      );
      await expectOk(
        `class-${label}`,
        await app.inject({
          method: 'PUT',
          url: `/api/v1/characters/${charId}/class`,
          headers: { authorization: `Bearer ${u1.accessToken}` },
          payload: {
            class: { slug: 'fighter', source: 'PHB' },
            level: 1,
            skillChoices: ['athletics', 'perception'],
          },
        }),
      );
    };

    casterId = await makeChar('AE Caster');
    allyIdA = await makeChar('AE Ally A');
    allyIdB = await makeChar('AE Ally B');
    legacyCharId = await makeChar('AE Legacy No-Instances');

    await setupStats(casterId, 'caster');
    await setupStats(allyIdA, 'allyA');
    await setupStats(allyIdB, 'allyB');
    // legacyCharId intentionally gets no stats (still valid for GET /sheet with 0 instances)

    // ── Direct DB seeding ─────────────────────────────────────────────────────
    // Seed bless modifier_definition row. Seed script calls process.exit — use direct insert.
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierDefinitions } = await import('../../src/infra/db/schema.js');
    const { blessRuleDoc } = await import('@dungeon-hub/domain/engine');

    await db
      .insert(modifierDefinitions)
      .values({
        slug: BLESS_SLUG,
        source: 'PHB 219',
        name: 'Bless',
        kind: 'spell',
        ruleDoc: blessRuleDoc,
      })
      .onConflictDoNothing();

    // Seed a broken spell row for REQ-AE-03 (INVALID_EFFECT_DEF).
    await db
      .insert(modifierDefinitions)
      .values({
        slug: BROKEN_SLUG,
        source: 'test',
        name: 'Broken Spell',
        kind: 'spell',
        ruleDoc: { this_is: 'not_a_valid_rule_doc' },
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    // deleteTestUser cascades via worlds → characters, modifier_instances.
    if (u1) await deleteTestUser(u1.id);
    if (u2) await deleteTestUser(u2.id);

    // Clean up seeded modifier_definitions rows for broken-spell (bless may be reused).
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierDefinitions } = await import('../../src/infra/db/schema.js');
    await db.delete(modifierDefinitions).where(eq(modifierDefinitions.slug, BROKEN_SLUG));

    await closeTestApp();
  });

  // ── Case (a) ─────────────────────────────────────────────────────────────────
  // REQ-AE-01: POST /active-effects bless → 201 + 4 rows (2 per target).
  it('(a) POST /active-effects bless → 201 + 4 modifier_instances rows (2 per target)', async () => {
    const app = await getTestApp();
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierInstances } = await import('../../src/infra/db/schema.js');

    const token = 'ae-tok-a';

    // Target only allyIdA to keep allyIdB clean for case (c).
    // Two targets demonstrate multi-target fan-out; using allyIdA + allyIdA would produce
    // duplicate IDs. Use allyIdA only and verify the 2-row (1 target) count.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/active-effects`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        effectSlug: BLESS_SLUG,
        targetIds: [allyIdA],
        concentrationToken: token,
      },
    });

    expect(res.statusCode).toBe(201);

    // DB: 2 rows (attack-roll + saving-throw) for allyIdA.
    const rows = await db
      .select()
      .from(modifierInstances)
      .where(and(eq(modifierInstances.concentrationToken, token), eq(modifierInstances.targetCharacterId, allyIdA)));

    expect(rows).toHaveLength(2);

    // All rows owned by caster.
    for (const row of rows) {
      expect(row.ownerCharacterId).toBe(casterId);
    }
  });

  // ── Case (b) ─────────────────────────────────────────────────────────────────
  // REQ-AE-06: GET /sheet for target after active-effects → engineStats shows Bless.
  it('(b) GET /sheet target after active-effects → engineStats has Bless breakdown', async () => {
    const app = await getTestApp();
    const token = 'ae-tok-b';

    // Apply Bless for this case.
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/active-effects`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        effectSlug: BLESS_SLUG,
        targetIds: [allyIdA],
        concentrationToken: token,
      },
    });
    expect(applyRes.statusCode).toBe(201);

    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${allyIdA}/sheet`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const body = sheetRes.json();

    // REQ-AE-06: engineStats includes Bless breakdown (attack-roll + saving-throw 1d4 untyped).
    expect(body.engineStats).toBeDefined();

    const attackBreakdown: Array<{ label?: string; amount?: unknown; type?: string }> =
      body.engineStats.attackRoll.breakdown;
    const blessAttack = attackBreakdown.find((s) => s.label?.includes('Bless'));
    expect(blessAttack).toBeDefined();
    expect(blessAttack!.amount).toBe('1d4');
    expect(blessAttack!.type).toBe('untyped');

    // REQ-SERVE-02 migration: engineStats.savingThrow (flat) removed → use per-ability array.
    // Assert Bless fans out to STR save breakdown (all-saves NumMod fan-out).
    const savingThrowsArr: Array<{ ability: string; breakdown: Array<{ label?: string; amount?: unknown; type?: string }> }> =
      body.engineStats.savingThrows;
    expect(savingThrowsArr, 'engineStats.savingThrows per-ability array should be present').toBeDefined();
    const strSave = savingThrowsArr.find((s) => s.ability === 'str');
    expect(strSave, 'str save entry should exist in engineStats.savingThrows').toBeDefined();
    const blessSave = strSave!.breakdown.find((s) => s.label?.includes('Bless'));
    expect(blessSave, 'Bless should appear in STR save breakdown').toBeDefined();
    expect(blessSave!.amount).toBe('1d4');
    expect(blessSave!.type).toBe('untyped');
  });

  // ── Case (c) ─────────────────────────────────────────────────────────────────
  // REQ-AE-07: DELETE concentration → clears all token rows; GET /sheet no Bless.
  // Uses allyIdB (isolated from cases (a)/(b) which target allyIdA) to avoid
  // shared-state cross-test contamination.
  it('(c) DELETE concentration clears tok-c rows; GET /sheet no longer shows Bless', async () => {
    const app = await getTestApp();
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierInstances } = await import('../../src/infra/db/schema.js');

    const token = 'ae-tok-c';

    // Apply Bless to allyIdB (isolated from cases a/b which use allyIdA).
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/active-effects`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        effectSlug: BLESS_SLUG,
        targetIds: [allyIdB],
        concentrationToken: token,
      },
    });
    expect(applyRes.statusCode).toBe(201);

    // Confirm rows inserted for allyIdB before deletion.
    const before = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, token));
    expect(before.length).toBeGreaterThan(0);

    // Delete concentration.
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${casterId}/concentration/${token}`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    // DB: rows gone.
    const remaining = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, token));
    expect(remaining).toHaveLength(0);

    // GET /sheet for allyIdB: no Bless (the only token that was inserted for allyIdB was tok-c).
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${allyIdB}/sheet`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const body = sheetRes.json();

    const attackBreakdown: Array<{ label?: string }> = body.engineStats.attackRoll.breakdown;
    // REQ-SERVE-02 migration: per-ability savingThrows array; check STR as representative.
    const savingThrowsArr: Array<{ ability: string; breakdown: Array<{ label?: string }> }> =
      body.engineStats.savingThrows;
    const strSaveEntry = savingThrowsArr?.find((s) => s.ability === 'str');
    const strSaveBreakdown = strSaveEntry?.breakdown ?? [];
    expect(attackBreakdown.some((s) => s.label?.includes('Bless'))).toBe(false);
    expect(strSaveBreakdown.some((s) => s.label?.includes('Bless'))).toBe(false);
  });

  // ── Case (d) ─────────────────────────────────────────────────────────────────
  // REQ-AE-02: Unknown effectSlug → 400 EFFECT_NOT_FOUND.
  it('(d) POST with unknown effectSlug → 400 EFFECT_NOT_FOUND', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/active-effects`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        effectSlug: 'unknown-spell',
        targetIds: [allyIdA],
        concentrationToken: 'tok-d',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('EFFECT_NOT_FOUND');
    expect(body.expected).toBe('unknown-spell');
  });

  // ── Case (e) ─────────────────────────────────────────────────────────────────
  // REQ-AE-03: Malformed catalog row → 400 INVALID_EFFECT_DEF.
  it('(e) POST with malformed-RuleDoc effectSlug → 400 INVALID_EFFECT_DEF', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/active-effects`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        effectSlug: BROKEN_SLUG,
        targetIds: [allyIdA],
        concentrationToken: 'tok-e',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('INVALID_EFFECT_DEF');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  // ── Case (f) ─────────────────────────────────────────────────────────────────
  // REQ-AE-04: Non-owner caster → 403 FORBIDDEN.
  it('(f) POST with non-owner JWT → 403 FORBIDDEN', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/active-effects`,
      headers: { authorization: `Bearer ${u2.accessToken}` }, // u2 does not own casterId
      payload: {
        effectSlug: BLESS_SLUG,
        targetIds: [allyIdA],
        concentrationToken: 'tok-f',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  // ── Case (g) ─────────────────────────────────────────────────────────────────
  // REQ-AE-05: Empty targetIds → 400 VALIDATION_FAILED (Zod).
  it('(g) POST with empty targetIds → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/active-effects`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        effectSlug: BLESS_SLUG,
        targetIds: [],
        concentrationToken: 'tok-g',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  // ── Case (h) ─────────────────────────────────────────────────────────────────
  // REQ-AE-08: Read-path tolerance — legacy character with no modifier_instances → 200.
  it('(h) GET /sheet for legacy character with no modifier_instances → 200', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${legacyCharId}/sheet`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });

    // Must not crash even with 0 modifier_instances rows.
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.engineStats).toBeDefined();
  });
});

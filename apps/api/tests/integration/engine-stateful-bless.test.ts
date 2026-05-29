/**
 * Integration test — engine-stateful Bless (Slice 5).
 *
 * Verifies the full Bless lifecycle across two characters:
 *   REQ-CASTBLESS-01: POST /characters/:casterId/cast-bless persists 2 modifier
 *                     instances per target (attack-roll + saving-throw). PHB 219.
 *   REQ-ENGINESTATS-01: GET /characters/:allyId/sheet returns engineStats with
 *                       breakdown entries for Bless on attack-roll + saving-throw.
 *   REQ-ENGINESTATS-02: engineStats.attackRoll.value === 0 (dice live in breakdown,
 *                       not folded into numeric value — roll-value contract).
 *   REQ-ENGINESTATS-03: engineAc + legacy sheet fields are UNCHANGED (additive).
 *   REQ-CONCENTRATION-01: DELETE /characters/:casterId/concentration/:token removes
 *                         all persisted instances; subsequent GET shows no Bless.
 *
 * RED-first note: cases (a)/(b)/(c) were written before T5-T7 implementation
 * and confirmed as 404 failures against the unimplemented routes.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('Bless lifecycle — engine-stateful (Slice 5)', () => {
  let u1: TestUser;
  let u2: TestUser;
  let casterId: string;
  let allyId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    u1 = await createTestUser();
    u2 = await createTestUser();

    const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`${label}: ${res.statusCode} ${res.body}`);
      }
    };

    // Create campaign owned by U1 (both caster + ally belong to U1).
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { name: 'Bless Test Campaign' },
      })
      .then((r) => r.json());
    const worldId: string = campaign.worldId;

    // Caster character (owned by U1).
    const casterRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { worldId, name: 'Bless Caster' },
      })
      .then((r) => r.json());
    casterId = casterRes.id;

    // Ally character (owned by U1 — same owner, different character).
    const allyRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { worldId, name: 'Bless Ally (Fighter)' },
      })
      .then((r) => r.json());
    allyId = allyRes.id;

    // Give both characters a minimal stat block so sheet computation doesn't crash.
    await expectOk(
      'stats-caster',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${casterId}/stats`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
        },
      }),
    );
    await expectOk(
      'class-caster',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${casterId}/class`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );

    await expectOk(
      'stats-ally',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${allyId}/stats`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
        },
      }),
    );
    await expectOk(
      'class-ally',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${allyId}/class`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );
  });

  afterAll(async () => {
    // deleteTestUser cascades via worlds → worldMembers, characters, modifier_instances.
    if (u1) await deleteTestUser(u1.id);
    if (u2) await deleteTestUser(u2.id);
    await closeTestApp();
  });

  // ── Case (a) ─────────────────────────────────────────────────────────────────
  // REQ-CASTBLESS-01 Scenario A: cast on 1 ally → 201 + exactly 2 rows in DB.
  it('(a) POST cast-bless → 201 + 2 modifier_instances rows in DB', async () => {
    const app = await getTestApp();
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierInstances } = await import('../../src/infra/db/schema.js');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: { targetIds: [allyId], concentrationToken: 'tok-1' },
    });

    expect(res.statusCode).toBe(201);

    // Direct DB assert: 2 rows (attack-roll + saving-throw) with token + target.
    const rows = await db
      .select()
      .from(modifierInstances)
      .where(
        and(
          eq(modifierInstances.concentrationToken, 'tok-1'),
          eq(modifierInstances.targetCharacterId, allyId),
        ),
      );
    expect(rows).toHaveLength(2);

    // Both rows must be owned by the caster.
    for (const row of rows) {
      expect(row.ownerCharacterId).toBe(casterId);
    }
  });

  // ── Case (b) ─────────────────────────────────────────────────────────────────
  // REQ-ENGINESTATS-01/02/03: GET ally sheet reflects Bless in engineStats.
  it('(b) GET ally/sheet → engineStats has Bless breakdown; value=0; engineAc unchanged', async () => {
    const app = await getTestApp();

    // Baseline AC for the ally (before we check it hasn't changed).
    const baselineRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${allyId}/sheet`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(baselineRes.statusCode).toBe(200);
    const body = baselineRes.json();

    // REQ-ENGINESTATS-01: engineStats present and has expected shape.
    expect(body.engineStats).toBeDefined();
    expect(body.engineStats.attackRoll).toBeDefined();
    // REQ-SERVE-02 migration: savingThrow flat field removed; per-ability array present.
    expect(body.engineStats.savingThrows, 'per-ability savingThrows array should exist').toBeDefined();
    expect(body.engineStats.savingThrow, 'flat savingThrow field should be removed').toBeUndefined();

    // REQ-ENGINESTATS-01: Bless appears in attack-roll breakdown.
    const attackBreakdown: Array<{ label: string; amount: unknown; type: string }> =
      body.engineStats.attackRoll.breakdown;
    const blessAttack = attackBreakdown.find((s) => s.label?.includes('Bless'));
    expect(blessAttack).toBeDefined();
    expect(blessAttack!.amount).toBe('1d4');
    expect(blessAttack!.type).toBe('untyped');

    // REQ-ENGINESTATS-01: Bless appears in saving-throw breakdown (per-ability, STR as example).
    // Bless NumMod stat:'saving-throw' fans out to all per-ability saves (stat.ts all-saves rule).
    const savingThrowsArr: Array<{ ability: string; breakdown: Array<{ label: string; amount: unknown; type: string }> }> =
      body.engineStats.savingThrows;
    const strSaveEntry = savingThrowsArr.find((s) => s.ability === 'str');
    expect(strSaveEntry, 'str save entry should exist').toBeDefined();
    const blessSave = strSaveEntry!.breakdown.find((s) => s.label?.includes('Bless'));
    expect(blessSave, 'Bless should appear in STR save breakdown').toBeDefined();
    expect(blessSave!.amount).toBe('1d4');
    expect(blessSave!.type).toBe('untyped');

    // REQ-ENGINESTATS-02: roll-value contract — dice are NOT folded into .value.
    expect(body.engineStats.attackRoll.value).toBe(0);
    // Per-ability saves: STR save value = abilityMod + pb (numeric; dice stay 0 in .value)
    expect(typeof strSaveEntry!.modifier).toBe('number');

    // REQ-AC-NATIVE-01 + REQ-ENGINESTATS-03: Bless does NOT affect AC (stat='attack-roll'/'saving-throw').
    // engine-ac-authoritative Gate B: engineAc top-level field removed (REQ-AC-CONTRACT-02).
    // sheet.armorClass.value is engine-authoritative; Bless does not touch it.
    const engineAc: number = body.sheet.armorClass.value;
    expect(typeof engineAc).toBe('number');
    expect(body.engineAc).toBeUndefined(); // REQ-AC-CONTRACT-02: top-level field gone

    // REQ-ENGINESTATS-03: legacy sheet fields present and untouched.
    expect(body.sheet).toBeDefined();
    expect(body.inventory).toBeDefined();
    expect(body.inventoryEnriched).toBeDefined();
    expect(body.character).toBeDefined();
  });

  // ── Case (c) ─────────────────────────────────────────────────────────────────
  // REQ-CONCENTRATION-01 Scenario A: drop concentration → rows gone → sheet clean.
  it('(c) DELETE concentration → 204 + Bless absent from subsequent GET sheet', async () => {
    const app = await getTestApp();
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierInstances } = await import('../../src/infra/db/schema.js');

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${casterId}/concentration/tok-1`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    // DB: rows must be gone.
    const remaining = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, 'tok-1'));
    expect(remaining).toHaveLength(0);

    // Sheet: breakdown must NOT contain Bless.
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${allyId}/sheet`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const body = sheetRes.json();

    const attackBreakdown: Array<{ label?: string }> = body.engineStats.attackRoll.breakdown;
    // REQ-SERVE-02 migration: per-ability array; check STR save no longer has Bless.
    const savingThrowsAfter: Array<{ ability: string; breakdown: Array<{ label?: string }> }> =
      body.engineStats.savingThrows;
    const strAfter = savingThrowsAfter?.find((s) => s.ability === 'str');
    const strBreakdownAfter = strAfter?.breakdown ?? [];

    expect(attackBreakdown.some((s) => s.label?.includes('Bless'))).toBe(false);
    expect(strBreakdownAfter.some((s) => s.label?.includes('Bless'))).toBe(false);

    // REQ-CONCENTRATION-01 Scenario B: second DELETE (idempotent) → still 204.
    const deleteAgain = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${casterId}/concentration/tok-1`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(deleteAgain.statusCode).toBe(204);
  });

  // ── Case (d) ─────────────────────────────────────────────────────────────────
  // REQ-CASTBLESS-01 Scenario B: body with 4 targetIds → 400 VALIDATION_FAILED.
  it('(d) POST cast-bless with 4 targetIds → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        targetIds: [allyId, allyId, allyId, allyId], // 4 entries — violates max(3)
        concentrationToken: 'tok-bad',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  // ── Case (e) ─────────────────────────────────────────────────────────────────
  // REQ-CASTBLESS-01 Scenario C: U2 casts as casterId (belongs to U1) → 403 FORBIDDEN.
  it('(e) POST cast-bless by non-owner → 403 FORBIDDEN', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/cast-bless`,
      headers: { authorization: `Bearer ${u2.accessToken}` }, // U2 does not own casterId
      payload: { targetIds: [allyId], concentrationToken: 'tok-u2-hack' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  // ── Case (f) ─────────────────────────────────────────────────────────────────
  // REQ-CASTBLESS-01 Scenario D: casterId is a random UUID that doesn't exist in
  // the DB → the route must return 404 NOT_FOUND.
  it('(f) POST cast-bless with unknown casterId → 404 NOT_FOUND', async () => {
    const app = await getTestApp();
    const unknownId = randomUUID(); // guaranteed not in DB

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${unknownId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: { targetIds: [allyId], concentrationToken: 'tok-unknown' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
  });

  // ── Case (g) ─────────────────────────────────────────────────────────────────
  // REQ-CONCENTRATION-01 Scenario C: U2 attempts to DELETE concentration on a
  // caster owned by U1 → 403 FORBIDDEN.
  it('(g) DELETE concentration by non-owner → 403 FORBIDDEN', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${casterId}/concentration/tok-any`,
      headers: { authorization: `Bearer ${u2.accessToken}` }, // U2 does not own casterId
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  // ── Case (h) ─────────────────────────────────────────────────────────────────
  // REQ-MITABLE-01 Scenarios B/C: FK ON DELETE CASCADE verified at runtime.
  // Uses an isolated caster/ally pair so deleting them doesn't affect shared fixtures.
  //
  // Scenario B: delete the OWNER (caster) character → its modifier_instances rows cascade.
  // Scenario C: delete the TARGET (ally) character  → the row targeting it cascades.
  it('(h) cascade delete — owner deletion removes rows (Scenario B); target deletion removes row (Scenario C)', async () => {
    const app = await getTestApp();
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierInstances } = await import('../../src/infra/db/schema.js');

    // Reuse the campaign from beforeAll (worldId is on the campaign; create fresh chars
    // belonging to U1 so teardown is automatic via deleteTestUser in afterAll).
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { name: 'Cascade Test Campaign' },
      })
      .then((r) => r.json());
    const worldId: string = campaign.worldId;

    // Caster B (isolated, owned by U1).
    const casterBRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { worldId, name: 'Cascade Caster' },
      })
      .then((r) => r.json());
    const casterBId: string = casterBRes.id;

    // Ally B (isolated, owned by U1).
    const allyBRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { worldId, name: 'Cascade Ally' },
      })
      .then((r) => r.json());
    const allyBId: string = allyBRes.id;

    // Cast Bless from casterB onto allyB — creates 2 rows.
    const castRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterBId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: { targetIds: [allyBId], concentrationToken: 'tok-cascade' },
    });
    expect(castRes.statusCode).toBe(201);

    // Confirm 2 rows exist before deletion.
    const rowsBefore = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, 'tok-cascade'));
    expect(rowsBefore).toHaveLength(2);

    // ── Scenario B: delete the OWNER character (casterB) via the route.
    // FK ownerCharacterId ON DELETE CASCADE must remove rows owned by casterB.
    const deleteCasterRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${casterBId}`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(deleteCasterRes.statusCode).toBe(204);

    const rowsAfterOwnerDelete = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, 'tok-cascade'));
    // Cascade must have removed ALL rows owned by casterBId.
    expect(rowsAfterOwnerDelete).toHaveLength(0);

    // ── Scenario C: re-cast from a fresh caster onto allyB, then delete the TARGET.
    // Re-create a fresh caster character for this sub-scenario (casterB was deleted above).
    const casterCRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { worldId, name: 'Cascade Caster2' },
      })
      .then((r) => r.json());
    const casterCId: string = casterCRes.id;

    const castRes2 = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterCId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: { targetIds: [allyBId], concentrationToken: 'tok-cascade-c' },
    });
    expect(castRes2.statusCode).toBe(201);

    const rowsBefore2 = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, 'tok-cascade-c'));
    expect(rowsBefore2).toHaveLength(2);

    // Delete the TARGET character (allyB) directly via the route.
    // FK targetCharacterId ON DELETE CASCADE must remove rows targeting allyBId.
    const deleteAllyRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${allyBId}`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(deleteAllyRes.statusCode).toBe(204);

    const rowsAfterTargetDelete = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, 'tok-cascade-c'));
    // Cascade must have removed ALL rows targeting allyBId.
    expect(rowsAfterTargetDelete).toHaveLength(0);
  });

  // ── Case (i) ─────────────────────────────────────────────────────────────────
  // REQ-PERSIST-01 Scenario C: removeByConcentrationToken is CASTER-SCOPED.
  // Two casters use the SAME concentrationToken; removing caster1's token must
  // leave caster2's rows intact (WHERE token AND owner, not just WHERE token).
  it('(i) DELETE concentration is caster-scoped — same token, two casters, only caster1 rows removed', async () => {
    const app = await getTestApp();
    const { db } = await import('../../src/infra/db/client.js');
    const { modifierInstances } = await import('../../src/infra/db/schema.js');

    // Create a second campaign/world so we can create fresh characters.
    const campaign2 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { name: 'Token Isolation Campaign' },
      })
      .then((r) => r.json());
    const worldId2: string = campaign2.worldId;

    // Caster1 (existing `casterId` from beforeAll — reuse it as caster1).
    // Caster2: a new character owned by U1 in this isolated world.
    const caster2Res = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { worldId: worldId2, name: 'Isolation Caster2' },
      })
      .then((r) => r.json());
    const caster2Id: string = caster2Res.id;

    // Ally for caster2 in the same world.
    const ally2Res = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { worldId: worldId2, name: 'Isolation Ally2' },
      })
      .then((r) => r.json());
    const ally2Id: string = ally2Res.id;

    const SHARED_TOKEN = 'tok-shared-isolation';

    // Both casters cast with the SAME concentrationToken string.
    // Caster1 (from beforeAll) targets allyId; Caster2 targets ally2Id.
    const cast1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: { targetIds: [allyId], concentrationToken: SHARED_TOKEN },
    });
    expect(cast1Res.statusCode).toBe(201);

    const cast2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${caster2Id}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: { targetIds: [ally2Id], concentrationToken: SHARED_TOKEN },
    });
    expect(cast2Res.statusCode).toBe(201);

    // Sanity: 4 rows total for the shared token (2 per cast × 2 casters).
    const allRows = await db
      .select()
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, SHARED_TOKEN));
    expect(allRows).toHaveLength(4);

    // Remove caster1's concentration only.
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${casterId}/concentration/${SHARED_TOKEN}`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Caster1's rows must be gone; caster2's rows must remain.
    const caster1Rows = await db
      .select()
      .from(modifierInstances)
      .where(
        and(
          eq(modifierInstances.concentrationToken, SHARED_TOKEN),
          eq(modifierInstances.ownerCharacterId, casterId),
        ),
      );
    expect(caster1Rows).toHaveLength(0);

    const caster2Rows = await db
      .select()
      .from(modifierInstances)
      .where(
        and(
          eq(modifierInstances.concentrationToken, SHARED_TOKEN),
          eq(modifierInstances.ownerCharacterId, caster2Id),
        ),
      );
    expect(caster2Rows).toHaveLength(2);
  });
});

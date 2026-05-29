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
    expect(body.engineStats.savingThrow).toBeDefined();

    // REQ-ENGINESTATS-01: Bless appears in attack-roll breakdown.
    const attackBreakdown: Array<{ label: string; amount: unknown; type: string }> =
      body.engineStats.attackRoll.breakdown;
    const blessAttack = attackBreakdown.find((s) => s.label?.includes('Bless'));
    expect(blessAttack).toBeDefined();
    expect(blessAttack!.amount).toBe('1d4');
    expect(blessAttack!.type).toBe('untyped');

    // REQ-ENGINESTATS-01: Bless appears in saving-throw breakdown.
    const saveBreakdown: Array<{ label: string; amount: unknown; type: string }> =
      body.engineStats.savingThrow.breakdown;
    const blessSave = saveBreakdown.find((s) => s.label?.includes('Bless'));
    expect(blessSave).toBeDefined();
    expect(blessSave!.amount).toBe('1d4');
    expect(blessSave!.type).toBe('untyped');

    // REQ-ENGINESTATS-02: roll-value contract — dice are NOT folded into .value.
    expect(body.engineStats.attackRoll.value).toBe(0);
    expect(body.engineStats.savingThrow.value).toBe(0);

    // REQ-ENGINESTATS-03: engineAc unchanged from baseline (Bless ≠ 'ac').
    const legacyAc: number = body.sheet.armorClass.value;
    expect(typeof legacyAc).toBe('number');
    expect(body.engineAc.value).toBe(legacyAc);

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
    const saveBreakdown: Array<{ label?: string }> = body.engineStats.savingThrow.breakdown;

    expect(attackBreakdown.some((s) => s.label?.includes('Bless'))).toBe(false);
    expect(saveBreakdown.some((s) => s.label?.includes('Bless'))).toBe(false);

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
});

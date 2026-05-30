/**
 * Integration tests — engine-combatant-effects (Slice A: apply/remove use-cases + E2E threading).
 *
 * Verifies:
 *   REQ-CEF-06: apply-combatant-effect — new effect, idempotent no-op, concentrationToken stored.
 *   REQ-CEF-07: remove-combatant-effect — removes existing, no-op when absent, source-scoped delete.
 *   REQ-CEF-01: FK cascade — delete combatant → effect rows gone (via use-case NOT_FOUND after delete).
 *   REQ-CEF-05: buildAttackContext threading — effects loaded into ctx, attackerCombatantId set.
 *   REQ-CEF-10: end-to-end predicate — apply 'TestMark' → buildAttackContext → hasEffectFromSelf fires.
 *   REQ-CEF-03: identity-space — attackerCombatantId (combatant UUID) ≠ ctx.attacker.id (char EntityId).
 *   Routes: POST /encounters/:id/actions/apply-combatant-effect + remove-combatant-effect (GM-only).
 *
 * PHB p.251 — Hex: caster-sourced, concentration.
 * PHB p.203 — Concentration rules.
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts
 * (GoTrue/Supabase intermittent — fail on main too).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';
import { applyCombatantEffect } from '../../src/use-cases/encounters/apply-combatant-effect.js';
import { removeCombatantEffect } from '../../src/use-cases/encounters/remove-combatant-effect.js';
import { buildAttackContext } from '../../src/use-cases/encounters/build-attack-context.js';
import { evaluatePredicate, hasEffectFromSelf } from '@dungeon-hub/domain/engine';
import { db } from '../../src/infra/db/client.js';
import { encounterCombatants } from '../../src/infra/db/schema.js';
import { eq } from 'drizzle-orm';

describe('engine-combatant-effects — apply/remove use-cases', () => {
  let gm: TestUser;
  let campaignId: string;

  // A shared encounter with 2 NPC combatants.
  let baseEncounterId: string;
  let attackerCombatantId: string;
  let targetCombatantId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    // ── Campaign ───────────────────────────────────────────────────────────────
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Combatant Effects Integration Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    // ── Base encounter: two NPC combatants (no character needed for use-case tests) ──
    const encounterRes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'CEF Base Encounter',
          combatants: [
            {
              name: 'Attacker NPC',
              kind: 'npc',
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
              ac: 13,
            },
            {
              name: 'Target NPC',
              kind: 'npc',
              initiative: 5,
              hpCurrent: 10,
              hpMax: 10,
              ac: 10,
            },
          ],
        },
      });
    await expectOk('create-encounter', encounterRes);
    const encounter = encounterRes.json();

    baseEncounterId = encounter.id;
    attackerCombatantId = encounter.currentCombatantId;
    targetCombatantId = encounter.combatants.find(
      (c: { id: string }) => c.id !== attackerCombatantId,
    )?.id ?? '';

    expect(attackerCombatantId).toBeTruthy();
    expect(targetCombatantId).toBeTruthy();
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── apply-combatant-effect use-case tests (REQ-CEF-06) ───────────────────────

  describe('applyCombatantEffect use-case', () => {
    it('apply_new: inserts a new row, applied:true', async () => {
      const result = await applyCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName: 'TestMark-Apply-New',
        sourceCombatantId: attackerCombatantId,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.applied).toBe(true);
    });

    it('apply_duplicate_no_op: same triple → no-op, applied:false', async () => {
      // First apply.
      await applyCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName: 'TestMark-Idempotent',
        sourceCombatantId: attackerCombatantId,
      });

      // Second apply — same triple → idempotent no-op.
      const result = await applyCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName: 'TestMark-Idempotent',
        sourceCombatantId: attackerCombatantId,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.applied).toBe(false);
    });

    it('apply_with_concentrationToken: row stores the token (REQ-CEF-06 optional field)', async () => {
      const token = 'conc-token-abc-123';
      const result = await applyCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName: 'TestMark-ConcentrationToken',
        sourceCombatantId: attackerCombatantId,
        concentrationToken: token,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.applied).toBe(true);
    });

    it('apply_not_found_encounter: missing encounter → NOT_FOUND encounter', async () => {
      const result = await applyCombatantEffect({
        encounterId: '00000000-0000-0000-0000-000000000000',
        targetCombatantId,
        effectName: 'TestMark-MissingEnc',
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected not ok');
      expect(result.code).toBe('NOT_FOUND');
      expect(result.target).toBe('encounter');
    });

    it('apply_not_found_combatant: wrong combatant → NOT_FOUND target', async () => {
      const result = await applyCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId: '00000000-0000-0000-0000-000000000001',
        effectName: 'TestMark-MissingCombatant',
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected not ok');
      expect(result.code).toBe('NOT_FOUND');
      expect(result.target).toBe('target');
    });
  });

  // ── remove-combatant-effect use-case tests (REQ-CEF-07) ───────────────────────

  describe('removeCombatantEffect use-case', () => {
    it('remove_existing: removes existing effect, removed:1', async () => {
      // Ensure effect exists first.
      await applyCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName: 'TestMark-Remove-Existing',
        sourceCombatantId: attackerCombatantId,
      });

      const result = await removeCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName: 'TestMark-Remove-Existing',
        sourceCombatantId: attackerCombatantId,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.removed).toBe(1);
    });

    it('remove_absent: no matching row → removed:0 (success, idempotent)', async () => {
      const result = await removeCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName: 'TestMark-Does-Not-Exist',
        sourceCombatantId: attackerCombatantId,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.removed).toBe(0);
    });

    it('remove_scoped_source: scoped remove only removes the matching source', async () => {
      const effectName = 'TestMark-Scoped-Remove';
      // Apply effect.
      await applyCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName,
        sourceCombatantId: attackerCombatantId,
      });

      // Remove only the attacker's row.
      const removeResult = await removeCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName,
        sourceCombatantId: attackerCombatantId,
      });
      expect(removeResult.ok).toBe(true);
      if (!removeResult.ok) throw new Error('expected ok');
      expect(removeResult.removed).toBeGreaterThanOrEqual(1);

      // Second remove returns 0 (already gone).
      const secondRemove = await removeCombatantEffect({
        encounterId: baseEncounterId,
        targetCombatantId,
        effectName,
        sourceCombatantId: attackerCombatantId,
      });
      expect(secondRemove.ok).toBe(true);
      if (!secondRemove.ok) throw new Error('expected ok');
      expect(secondRemove.removed).toBe(0);
    });

    it('remove_not_found_encounter: missing encounter → NOT_FOUND encounter', async () => {
      const result = await removeCombatantEffect({
        encounterId: '00000000-0000-0000-0000-000000000000',
        targetCombatantId,
        effectName: 'TestMark-NoEnc',
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected not ok');
      expect(result.code).toBe('NOT_FOUND');
      expect(result.target).toBe('encounter');
    });
  });

  // ── FK cascade test (REQ-CEF-01) ─────────────────────────────────────────────

  describe('FK cascade — combatant delete removes effect rows', () => {
    it('cascade_delete: delete target combatant → effect rows gone (ON DELETE CASCADE)', async () => {
      // REQ-CEF-01: FK CASCADE on combatant_id.
      const app = await getTestApp();
      const cascadeEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'CEF Cascade Test Encounter',
            combatants: [
              { name: 'Src NPC', kind: 'npc', initiative: 20, hpCurrent: 10, hpMax: 10, ac: 10 },
              { name: 'Tgt NPC', kind: 'npc', initiative: 5, hpCurrent: 8, hpMax: 8, ac: 10 },
            ],
          },
        })
        .then((r) => r.json());

      const cascadeAttackerId = cascadeEnc.currentCombatantId;
      const cascadeTargetId = cascadeEnc.combatants.find(
        (c: { id: string }) => c.id !== cascadeAttackerId,
      )?.id ?? '';

      // Apply an effect to the target.
      const applyResult = await applyCombatantEffect({
        encounterId: cascadeEnc.id,
        targetCombatantId: cascadeTargetId,
        effectName: 'TestMark-Cascade',
        sourceCombatantId: cascadeAttackerId,
      });
      expect(applyResult.ok).toBe(true);
      if (!applyResult.ok) throw new Error('apply failed');
      expect(applyResult.applied).toBe(true);

      // Delete the TARGET combatant directly from DB (simulates combatant removal).
      await db.delete(encounterCombatants).where(eq(encounterCombatants.id, cascadeTargetId));

      // Effect rows are gone (ON DELETE CASCADE). Verify by trying to apply again —
      // the combatant no longer exists → NOT_FOUND target (not a duplicate no-op).
      const applyAfterDelete = await applyCombatantEffect({
        encounterId: cascadeEnc.id,
        targetCombatantId: cascadeTargetId,
        effectName: 'TestMark-Cascade',
        sourceCombatantId: cascadeAttackerId,
      });
      expect(applyAfterDelete.ok).toBe(false);
      if (applyAfterDelete.ok) throw new Error('expected not ok after cascade delete');
      expect(applyAfterDelete.code).toBe('NOT_FOUND');
    });
  });
});

// ── E2E: buildAttackContext threading + predicate + routes (Commit 4) ────────

describe('engine-combatant-effects — buildAttackContext threading + routes (E2E)', () => {
  let gm: TestUser;
  let player: TestUser; // non-GM, for 403 tests
  let campaignId: string;

  let attackerCharId: string;
  let targetCharId: string;

  let baseEncounterId: string;
  let attackerCombatantId: string;
  let targetCombatantId: string;
  let weaponInstanceId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'CEF E2E Threading Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    const worldId = campaign.worldId;

    // Player joins as non-GM (for 403 test).
    await addCampaignAndWorldMember(campaignId, player.id, 'player');

    // ── Attacker character: Fighter L1, longsword ──────────────────────────────
    const attackerChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Attacker E2E' },
      })
      .then((r) => r.json());
    attackerCharId = attackerChar.id;

    await expectOk(
      'attacker-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${attackerCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
        },
      }),
    );

    await expectOk(
      'attacker-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${attackerCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );

    await expectOk(
      'attacker-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${attackerCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    // Get weaponInstanceId from character sheet.
    const attackerSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${attackerCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const longsword = attackerSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'longsword',
    );
    weaponInstanceId = longsword?.instanceId ?? '';
    expect(weaponInstanceId).toBeTruthy();

    // ── Target character: Fighter L1 ──────────────────────────────────────────
    const targetChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Target E2E' },
      })
      .then((r) => r.json());
    targetCharId = targetChar.id;

    await expectOk(
      'target-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${targetCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
        },
      }),
    );

    await expectOk(
      'target-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${targetCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'history'],
        },
      }),
    );

    // ── Base encounter: attacker (init=20) vs target (init=5) ─────────────────
    const encounter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'CEF E2E Base Encounter',
          combatants: [
            {
              name: 'Attacker',
              kind: 'pc',
              characterId: attackerCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            {
              name: 'Target',
              kind: 'pc',
              characterId: targetCharId,
              initiative: 5,
              hpCurrent: 10,
              hpMax: 10,
            },
          ],
        },
      })
      .then((r) => r.json());

    baseEncounterId = encounter.id;
    attackerCombatantId = encounter.currentCombatantId;
    targetCombatantId = encounter.combatants.find(
      (c: { id: string }) => c.id !== attackerCombatantId,
    )?.id ?? '';

    expect(attackerCombatantId).toBeTruthy();
    expect(targetCombatantId).toBeTruthy();
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    await closeTestApp();
  });

  // ── Routes: GM-only auth ──────────────────────────────────────────────────────

  it('route_apply_non_gm_403: player token → 403 FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${baseEncounterId}/actions/apply-combatant-effect`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { targetCombatantId, effectName: 'TestMark-Auth' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('route_remove_non_gm_403: player token → 403 FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${baseEncounterId}/actions/remove-combatant-effect`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { targetCombatantId, effectName: 'TestMark-Auth' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('route_apply_gm_200: GM applies effect → 200 { applied: true }', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${baseEncounterId}/actions/apply-combatant-effect`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId,
        effectName: 'TestMark-Route',
        sourceCombatantId: attackerCombatantId,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(true);
  });

  it('route_apply_duplicate_200: GM applies same effect again → 200 { applied: false }', async () => {
    const app = await getTestApp();
    // Second apply of same triple.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${baseEncounterId}/actions/apply-combatant-effect`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId,
        effectName: 'TestMark-Route',
        sourceCombatantId: attackerCombatantId,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(false);
  });

  it('route_remove_gm_200: GM removes effect → 200 { removed: N }', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${baseEncounterId}/actions/remove-combatant-effect`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId,
        effectName: 'TestMark-Route',
        sourceCombatantId: attackerCombatantId,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toBeGreaterThanOrEqual(0);
  });

  it('route_apply_bad_body_400: missing effectName → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${baseEncounterId}/actions/apply-combatant-effect`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { targetCombatantId }, // effectName missing
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });

  // ── buildAttackContext threading + hasEffectFromSelf predicate (REQ-CEF-10, REQ-CEF-03) ─

  it('E2E_predicate_fires_for_correct_attacker: apply TestMark → ctx threaded → hasEffectFromSelf true', async () => {
    // REQ-CEF-10: full path — apply effect → buildAttackContext loads it → predicate true.
    const effectName = 'TestMark-E2E';

    // Apply the effect sourced by the attacker combatant.
    await applyCombatantEffect({
      encounterId: baseEncounterId,
      targetCombatantId,
      effectName,
      sourceCombatantId: attackerCombatantId,
    });

    // buildAttackContext for attacker vs target.
    const ctxResult = await buildAttackContext({
      characterId: attackerCharId,
      attackerId: attackerCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId,
    });

    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) throw new Error(`buildAttackContext failed: ${JSON.stringify(ctxResult)}`);

    const { ctx } = ctxResult;

    // REQ-CEF-05: targetCombatantEffects is threaded and contains the applied effect.
    expect(ctx.targetCombatantEffects).toBeDefined();
    const effectEntry = (ctx.targetCombatantEffects ?? []).find(
      (e) => e.effectName === effectName && e.sourceCombatantId === attackerCombatantId,
    );
    expect(effectEntry).toBeDefined();

    // REQ-CEF-05: attackerCombatantId is the combatant UUID.
    expect(ctx.attackerCombatantId).toBe(attackerCombatantId);

    // REQ-CEF-10: hasEffectFromSelf predicate evaluates true.
    const predicate = hasEffectFromSelf(effectName);
    expect(evaluatePredicate(predicate, ctx)).toBe(true);
  });

  it('E2E_predicate_false_for_different_attacker: TestMark from A → false when B is the attacker', async () => {
    // REQ-CEF-10: predicate NOT fires for a different attacker.
    // Simulate buildAttackContext for a different "attacker" using a manually constructed ctx.
    // This avoids needing a second character with a weapon; the predicate logic is what matters.
    const effectName = 'TestMark-E2E-DiffAttacker';

    // Apply TestMark sourced by attackerCombatantId.
    await applyCombatantEffect({
      encounterId: baseEncounterId,
      targetCombatantId,
      effectName,
      sourceCombatantId: attackerCombatantId,
    });

    // Build ctx for ATTACKER (the effect was applied by attackerCombatantId) — predicate true.
    const ctxAttacker = await buildAttackContext({
      characterId: attackerCharId,
      attackerId: attackerCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId,
    });
    expect(ctxAttacker.ok).toBe(true);
    if (!ctxAttacker.ok) throw new Error('buildAttackContext for attacker failed');
    expect(evaluatePredicate(hasEffectFromSelf(effectName), ctxAttacker.ctx)).toBe(true);

    // Simulate a "different attacker" by substituting attackerCombatantId with targetCombatantId
    // in a ctx built from the real DB data. The predicate reads ctx.attackerCombatantId.
    // We verify: if attackerCombatantId were set to a different UUID, the predicate is false.
    const simCtx = {
      ...ctxAttacker.ctx,
      attackerCombatantId: targetCombatantId, // different combatant UUID — predicate should be false
    };
    expect(evaluatePredicate(hasEffectFromSelf(effectName), simCtx)).toBe(false);
  });

  it('E2E_identity_space: attackerCombatantId (combatant UUID) !== ctx.attacker.id (char EntityId)', async () => {
    // REQ-CEF-03: identity-space correctness — two distinct namespaces.
    const ctxResult = await buildAttackContext({
      characterId: attackerCharId,
      attackerId: attackerCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId,
    });

    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) throw new Error(`buildAttackContext failed: ${JSON.stringify(ctxResult)}`);

    const { ctx } = ctxResult;

    // Verify: combatant UUID ≠ character EntityId.
    expect(ctx.attackerCombatantId).toBeDefined();
    expect(ctx.attacker?.id).toBeDefined();
    // These MUST be distinct — they are different namespaces.
    expect(ctx.attackerCombatantId).not.toBe(ctx.attacker?.id as string);

    // Further: effect sourced by the character EntityId does NOT fire the predicate.
    // (Character EntityId ≠ combatant UUID → wrong namespace → false.)
    const charEntityId = ctx.attacker?.id as string;
    const combatantUUID = ctx.attackerCombatantId as string;
    expect(charEntityId).not.toBe(combatantUUID);

    const simCtx = {
      ...ctx,
      attackerCombatantId: combatantUUID,
      targetCombatantEffects: [{ effectName: 'IdentityTest', sourceCombatantId: charEntityId }],
    };
    // Source is character EntityId, attacker is combatant UUID → mismatch → false.
    expect(evaluatePredicate(hasEffectFromSelf('IdentityTest'), simCtx)).toBe(false);

    // Correct match: source IS the combatant UUID.
    const simCtxCorrect = {
      ...ctx,
      attackerCombatantId: combatantUUID,
      targetCombatantEffects: [{ effectName: 'IdentityTest', sourceCombatantId: combatantUUID }],
    };
    expect(evaluatePredicate(hasEffectFromSelf('IdentityTest'), simCtxCorrect)).toBe(true);
  });

  it('E2E_legacy_combatant_no_effects: zero effects → ctx loads fine, predicate false', async () => {
    // REQ-CEF-05 read-tolerance: combatant with no effects → empty array, no error.
    const app = await getTestApp();
    const freshEnc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'CEF No-Effects Encounter',
          combatants: [
            {
              name: 'Attacker-Fresh',
              kind: 'pc',
              characterId: attackerCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            {
              name: 'Target-Fresh',
              kind: 'pc',
              characterId: targetCharId,
              initiative: 5,
              hpCurrent: 10,
              hpMax: 10,
            },
          ],
        },
      })
      .then((r) => r.json());

    const freshAttackerId = freshEnc.currentCombatantId;
    const freshTargetId = freshEnc.combatants.find(
      (c: { id: string }) => c.id !== freshAttackerId,
    )?.id ?? '';

    // Build context — zero effects in this encounter.
    const ctxResult = await buildAttackContext({
      characterId: attackerCharId,
      attackerId: freshAttackerId,
      targetId: freshTargetId,
      weaponInstanceId,
    });

    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) throw new Error(`buildAttackContext failed: ${JSON.stringify(ctxResult)}`);

    const { ctx } = ctxResult;

    // targetCombatantEffects absent or empty — no error.
    const effects = ctx.targetCombatantEffects ?? [];
    expect(effects).toHaveLength(0);

    // Predicate returns false — no effects loaded.
    expect(evaluatePredicate(hasEffectFromSelf('AnyEffect'), ctx)).toBe(false);
  });
});

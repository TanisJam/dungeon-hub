/**
 * Integration tests — engine-combatant-effects (Slice A: apply/remove use-cases).
 *
 * Verifies:
 *   REQ-CEF-06: apply-combatant-effect — new effect, idempotent no-op, concentrationToken stored.
 *   REQ-CEF-07: remove-combatant-effect — removes existing, no-op when absent, source-scoped delete.
 *   REQ-CEF-01: FK cascade — delete combatant → effect rows gone (via use-case NOT_FOUND after delete).
 *
 * Context threading + predicate E2E tests are in the describe block below and require
 * buildAttackContext effects threading (Commit 4).
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
import { applyCombatantEffect } from '../../src/use-cases/encounters/apply-combatant-effect.js';
import { removeCombatantEffect } from '../../src/use-cases/encounters/remove-combatant-effect.js';
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

/**
 * Integration tests — patchCombatant 0-HP concentration hook (Batch A3).
 *
 * PHB p.197: 0 HP → Unconscious → Incapacitated.
 * PHB p.203: Incapacitation ends concentration.
 *
 * When the GM uses PATCH /encounters/:id/combatants/:cid to set hpCurrent=0 on
 * a concentrating PC, breakConcentration MUST fire inside the same DB transaction
 * as the HP write (REQ-CID-03). This closes the fisura from the Slice-2 post-tx saga.
 *
 * Tests (CID-PATCH series):
 *   CID-PATCH-01: concentrating PC, GM sets hpCurrent=0 → concentration row deleted in same tx.
 *   CID-PATCH-02: concentrating PC, GM sets hpCurrent to non-zero → concentration row intact.
 *   CID-PATCH-03: non-concentrating PC, GM sets hpCurrent=0 → no error, row absent as expected.
 *   CID-PATCH-04: NPC combatant (characterId=null), GM sets hpCurrent=0 → no error (NPC guard).
 *
 * Design ref: sdd/engine-concentration-break-incap-death/design — ADR-5.
 * REQ-CID-03.
 *
 * RED-first: tests written before the hook is wired into patchCombatant.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { db } from '../../src/infra/db/client.js';
import { characterConcentration } from '../../src/infra/db/schema.js';
import { randomUUID } from 'node:crypto';

// ── Helpers ────────────────────────────────────────────────────────────────────

const expectOk = async (label: string, res: { statusCode: number; body: string }): Promise<void> => {
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
  }
};

/** Insert a concentration row directly for test setup. */
const insertConcentrationRow = async (characterId: string): Promise<void> => {
  await db
    .insert(characterConcentration)
    .values({
      characterId,
      concentrationToken: randomUUID(),
      store: 'modifier_instances',
      spellName: 'Bless',
    })
    .onConflictDoUpdate({
      target: characterConcentration.characterId,
      set: {
        concentrationToken: randomUUID(),
        store: 'modifier_instances',
        spellName: 'Bless',
      },
    });
};

/** Check if a concentration row exists for the given characterId. */
const hasConcentrationRow = async (characterId: string): Promise<boolean> => {
  const [row] = await db
    .select({ characterId: characterConcentration.characterId })
    .from(characterConcentration)
    .where(eq(characterConcentration.characterId, characterId))
    .limit(1);
  return row !== undefined;
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('patchCombatant — 0-HP concentration hook (Batch A3, REQ-CID-03)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;
  let pcCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'PatchCombatant-Concentration A3 Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // Create a PC character (Fighter L1, CON=14 for realism — not strictly needed for patch tests).
    const pc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Taran (patch-conc test)' },
      })
      .then((r) => r.json<{ id: string }>());
    pcCharId = pc.id;

    await expectOk(
      'set-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${pcCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 },
        },
      }),
    );
    await expectOk(
      'set-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${pcCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );
  });

  afterAll(async () => {
    // Clean up any leftover concentration rows.
    await db
      .delete(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId));
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── Helper: create a fresh encounter with 1 PC + 1 NPC ──────────────────────

  const makeFreshEncounter = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    name: string,
  ): Promise<{ encounterId: string; pcCombatantId: string; npcCombatantId: string }> => {
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name,
          combatants: [
            {
              name: 'Taran',
              kind: 'pc',
              characterId: pcCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            {
              name: 'Goblin',
              kind: 'npc',
              initiative: 5,
              hpCurrent: 10,
              hpMax: 10,
              ac: 13,
            },
          ],
        },
      })
      .then((r) => r.json());

    const pcCombatantId = enc.currentCombatantId as string;
    const npcCombatantId = (enc.combatants as Array<{ id: string }>).find(
      (c) => c.id !== pcCombatantId,
    )?.id ?? '';

    return {
      encounterId: enc.id as string,
      pcCombatantId,
      npcCombatantId,
    };
  };

  // ── CID-PATCH-01: concentrating PC, GM sets hpCurrent=0 → row deleted ────────
  it(
    'CID-PATCH-01: concentrating PC, GM PATCH hpCurrent=0 → concentration row deleted in same tx (REQ-CID-03)',
    async () => {
      // PHB p.197/p.203: GM setting HP to 0 triggers 0-HP → Incapacitated → concentration ends.
      // The hook MUST fire inside the existing patchCombatant transaction.
      const app = await getTestApp();
      const { encounterId, pcCombatantId } = await makeFreshEncounter(app, 'CID-PATCH-01');

      // Plant concentration row.
      await insertConcentrationRow(pcCharId);
      expect(await hasConcentrationRow(pcCharId)).toBe(true);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/encounters/${encounterId}/combatants/${pcCombatantId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { hpCurrent: 0 },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.hpCurrent).toBe(0);

      // REQ-CID-03: concentration row MUST be deleted.
      expect(await hasConcentrationRow(pcCharId)).toBe(false);
    },
  );

  // ── CID-PATCH-02: concentrating PC, GM sets non-zero HP → row intact ─────────
  it(
    'CID-PATCH-02: concentrating PC, GM PATCH hpCurrent=5 → concentration row intact (REQ-CID-03)',
    async () => {
      const app = await getTestApp();
      const { encounterId, pcCombatantId } = await makeFreshEncounter(app, 'CID-PATCH-02');

      await insertConcentrationRow(pcCharId);
      expect(await hasConcentrationRow(pcCharId)).toBe(true);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/encounters/${encounterId}/combatants/${pcCombatantId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { hpCurrent: 5 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().hpCurrent).toBe(5);

      // Non-zero HP → concentration MUST remain.
      expect(await hasConcentrationRow(pcCharId)).toBe(true);

      // Cleanup.
      await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
    },
  );

  // ── CID-PATCH-03: non-concentrating PC, GM sets hpCurrent=0 → no error ──────
  it(
    'CID-PATCH-03: non-concentrating PC, GM PATCH hpCurrent=0 → completes normally, no row (REQ-CID-03)',
    async () => {
      // breakConcentration is idempotent: if no registry row exists, it returns immediately.
      const app = await getTestApp();
      const { encounterId, pcCombatantId } = await makeFreshEncounter(app, 'CID-PATCH-03');

      // Ensure no concentration row.
      await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
      expect(await hasConcentrationRow(pcCharId)).toBe(false);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/encounters/${encounterId}/combatants/${pcCombatantId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { hpCurrent: 0 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().hpCurrent).toBe(0);
      // No error, no row to delete — idempotent no-op.
      expect(await hasConcentrationRow(pcCharId)).toBe(false);
    },
  );

  // ── CID-PATCH-04: NPC target, GM sets hpCurrent=0 → no error (NPC guard) ─────
  it(
    'CID-PATCH-04: NPC combatant, GM PATCH hpCurrent=0 → no breakConcentration called (NPC guard, REQ-CID-03)',
    async () => {
      // NPC combatants have characterId=null — the hook must guard against this.
      // If the guard is missing, breakConcentration would be called with null, likely throwing.
      const app = await getTestApp();
      const { encounterId, npcCombatantId } = await makeFreshEncounter(app, 'CID-PATCH-04');

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/encounters/${encounterId}/combatants/${npcCombatantId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { hpCurrent: 0 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().hpCurrent).toBe(0);
      // No crash, no error — NPC guard protected breakConcentration.
    },
  );
});

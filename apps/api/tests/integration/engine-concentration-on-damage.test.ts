/**
 * Integration tests — concentration-on-damage helper guard branches + success/fail paths.
 *
 * PHB p.203: "Whenever you take damage while you are concentrating on a spell, you
 * must make a Constitution saving throw to maintain your concentration."
 * PHB p.197: "0 HP → Unconscious → Incapacitated → concentration ends (no save)." REQ-CID-02.
 *
 * Tests prepareConcentrationCheck / resolveConcentrationCheck in isolation (not via HTTP).
 * Path-wiring integration tests live in engine-concentration-break-damage.test.ts.
 *
 * B1 guard tests (migrated from checkConcentrationOnDamage to prepare/resolve split — ADR-1):
 *   BCB-01: NPC target (characterId=null) → prepare returns null (no registry query).
 *   BCB-02: finalDamage=0 (newHp>0) → prepare returns null (zero-damage guard — REQ-CB-08).
 *   BCB-03: non-concentrating PC (no registry row) → prepare returns null (REQ-CB-09).
 *   BCB-04: concentrating PC + newHp>0 + damage>0 → save block with all 6 fields (REQ-CB-12).
 *   BCB-05: concentrating PC + guaranteed DC fail → broke=true, registry row deleted (REQ-CB-04).
 *   BCB-06: ConcentrationSaveBlock has all 6 required fields on fail path (REQ-CB-12).
 *
 * BEHAVIOR-CHANGE NOTE (ADR-2, REQ-CID-02, Batch B):
 *   Lethal damage (newHp===0) now breaks outright — NO save is rolled.
 *   Response is { broke: true, reason: 'incapacitated-0hp' }, NOT a ConcentrationSaveBlock.
 *   BCB-01..06 use newHp>0 and therefore exercise the Slice-2 save path unchanged.
 *   The new 0-HP path is covered by CID-0HP-01..03 (in this file) and CBW-07/CBS-04/CBR-06 (break-damage file).
 *
 * Source rule: PHB p.203 — "Maintaining Concentration"
 * Source rule: PHB p.197 — "0 HP → Unconscious → Incapacitated"
 * Design ref: sdd/engine-concentration-break-incap-death/design — ADR-1, ADR-2.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { db } from '../../src/infra/db/client.js';
import { characterConcentration } from '../../src/infra/db/schema.js';
import { randomUUID } from 'node:crypto';
import {
  prepareConcentrationCheck,
  resolveConcentrationCheck,
  type ConcentrationPlan,
  type ConcentrationResolution,
} from '../../src/use-cases/encounters/check-concentration-on-damage.js';
import { db as dbClient } from '../../src/infra/db/client.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
  }
};

/** Create a minimal PC character in the given world. Returns characterId. */
const makeCharacter = async (
  app: Awaited<ReturnType<typeof getTestApp>>,
  token: string,
  worldId: string,
  name: string,
): Promise<string> => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/characters',
    headers: { authorization: `Bearer ${token}` },
    payload: { worldId, name },
  });
  if (res.statusCode !== 201) throw new Error(`makeCharacter ${name}: ${res.statusCode} ${res.body}`);
  return res.json<{ id: string }>().id;
};

/** Insert a concentration row directly into the registry for test setup. */
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

describe('prepare/resolveConcentrationCheck — guard branches + success/fail (B1c migration)', () => {
  let gm: TestUser;
  let worldId: string;
  let _campaignId: string;
  let pcCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Conc-on-damage B1c test campaign' },
      })
      .then((r) => r.json());
    _campaignId = campaign.id;
    worldId = campaign.worldId;

    pcCharId = await makeCharacter(app, gm.accessToken, worldId, 'Kyros (conc-damage test)');

    // Give the character a CON score so resolveTargetSave has a real value to work with.
    // Standard array [15,14,13,12,10,8] — distribute with CON=14 for +2 mod.
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

    // Assign a class so the character is valid (needed for resolveTargetSave sheet build).
    // Fighter L1: CON save proficiency (PHB p.72). No subclass required at L1.
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
    // Clean up any leftover concentration rows for this character.
    await db
      .delete(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId));
    await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // BCB-01: NPC target (characterId=null) → prepare returns null (no registry query).
  // ADR-1 guard 1: NPC → null. REQ-CB-10.
  it('BCB-01: NPC target → prepare returns null (no registry query)', async () => {
    const plan = await prepareConcentrationCheck({ kind: 'npc', characterId: null }, 20, 5);
    expect(plan).toBeNull();
  });

  // BCB-02: finalDamage=0, newHp>0 → prepare returns null (zero-damage guard).
  // ADR-1 guard 4: PHB p.203: save only triggered by damage TAKEN. REQ-CB-08.
  // BEHAVIOR-CHANGE NOTE: with the split, this guard fires AFTER registry check but BEFORE
  // the save branch. A non-concentrating PC with 0 damage would hit guard 2 first.
  // This test uses a concentrating PC to reach guard 4.
  it('BCB-02: concentrating PC + finalDamage=0 + newHp>0 → prepare returns null (zero-damage guard)', async () => {
    await insertConcentrationRow(pcCharId);
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 0, 5);
    expect(plan).toBeNull();
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
  });

  // BCB-03: non-concentrating PC (no registry row) → prepare returns null.
  // ADR-1 guard 2: registry SELECT → no row → null. REQ-CB-09.
  it('BCB-03: non-concentrating PC → prepare returns null (no registry row)', async () => {
    await db
      .delete(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId));

    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 10, 5);
    expect(plan).toBeNull();
  });

  // BCB-04: concentrating PC + damage>0 + newHp>0 → save-branch plan; resolve returns 6-field block.
  // PHB p.203: CON save total >= DC → concentration maintained.
  // BEHAVIOR-CHANGE NOTE (ADR-2): if newHp were 0 instead of 5, plan.breakOutright would be true
  // and resolve would return { broke:true, reason:'incapacitated-0hp' } — no save block.
  // This test uses newHp=5 to exercise the Slice-2 save path unchanged.
  it('BCB-04: concentrating PC + save result shape has all 6 fields (REQ-CB-12)', async () => {
    await insertConcentrationRow(pcCharId);

    // damage=1, newHp=5 → guard 3 (0-HP) skipped, guard 4 (zero-damage) skipped.
    // DC = max(10, floor(1/2)) = 10. Fighter L1 CON+2, CON-save proficiency → +4.
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 1, 5);
    expect(plan).not.toBeNull();
    expect(plan!.breakOutright).toBe(false);

    let resolution: ConcentrationResolution | undefined;
    await dbClient.transaction(async (tx) => {
      resolution = await resolveConcentrationCheck(plan!, tx);
    });

    expect(resolution).not.toBeUndefined();
    // Must be a ConcentrationSaveBlock (not an outright-break object).
    const r = resolution as Record<string, unknown>;
    // REQ-CB-12: all 6 sub-fields must be present.
    expect(typeof r['dc']).toBe('number');
    expect(typeof r['d20']).toBe('number');
    expect(typeof r['total']).toBe('number');
    expect(typeof r['saveMod']).toBe('number');
    expect(typeof r['success']).toBe('boolean');
    expect(typeof r['broke']).toBe('boolean');

    // PHB p.203: DC = max(10, floor(1/2)) = 10.
    expect(r['dc']).toBe(10);
    // success and broke are inverses (V1 — no War Caster nuance).
    expect(r['broke']).toBe(!r['success']);

    // BEHAVIOR-CHANGE ASSERTION (ADR-2): the outright-break shape is NOT a ConcentrationSaveBlock.
    // Verify this is the save-branch shape (has 'd20' field) NOT the outright shape.
    expect('reason' in r).toBe(false); // outright shape has `reason: 'incapacitated-0hp'`

    // Clean up for subsequent tests (whether row was deleted or not).
    await db
      .delete(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId));
  });

  // BCB-05: concentrating PC + guaranteed DC fail → broke=true, registry row deleted.
  // DC = max(10, floor(100/2)) = 50. Fighter L1 max save = 20+4 = 24 < 50 → guaranteed FAIL.
  // BEHAVIOR-CHANGE NOTE (ADR-2): if newHp were 0, this would be an outright break (no save).
  // newHp=5 ensures we exercise the save-fail path.
  it('BCB-05: concentrating PC + save fails (newHp=5) → broke=true, registry deleted (REQ-CB-04)', async () => {
    await insertConcentrationRow(pcCharId);
    expect(await hasConcentrationRow(pcCharId)).toBe(true);

    // damage=100, newHp=5 → save-branch, DC=50.
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 100, 5);
    expect(plan).not.toBeNull();
    expect(plan!.breakOutright).toBe(false);

    let resolution: ConcentrationResolution | undefined;
    await dbClient.transaction(async (tx) => {
      resolution = await resolveConcentrationCheck(plan!, tx);
    });

    const r = resolution as Record<string, unknown>;
    expect(r['dc']).toBe(50);
    expect(r['success']).toBe(false);
    expect(r['broke']).toBe(true);

    // REQ-CB-04: registry row must be deleted on break.
    expect(await hasConcentrationRow(pcCharId)).toBe(false);
  });

  // BCB-06: re-verify shape completeness on the guaranteed-fail path.
  it('BCB-06: ConcentrationSaveBlock has all 6 required fields on fail path (REQ-CB-12)', async () => {
    await insertConcentrationRow(pcCharId);

    // damage=100, newHp=5 → save-branch, DC=50 → guaranteed fail.
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 100, 5);
    expect(plan).not.toBeNull();

    let resolution: ConcentrationResolution | undefined;
    await dbClient.transaction(async (tx) => {
      resolution = await resolveConcentrationCheck(plan!, tx);
    });

    const r = resolution as Record<string, unknown>;
    expect(Object.keys(r)).toContain('dc');
    expect(Object.keys(r)).toContain('d20');
    expect(Object.keys(r)).toContain('total');
    expect(Object.keys(r)).toContain('saveMod');
    expect(Object.keys(r)).toContain('success');
    expect(Object.keys(r)).toContain('broke');

    // Cleanup.
    await db
      .delete(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId));
  });
});

// ── A1 suite: prepareConcentrationCheck + resolveConcentrationCheck ────────────
//
// Tests guard ordering, breakOutright, and resolve outright-vs-save paths.
// REQ-CID-02, ADR-1, ADR-2.
//
// Guard order (per design ADR-1):
//   1. NPC (characterId=null) → null
//   2. registry SELECT → no row → null
//   3. newHp===0 → { breakOutright: true }   ← NEW (PHB p.197/p.203)
//   4. finalDamage===0 → null
//   5. save branch → { breakOutright: false, dc, saveBonus }

describe('prepareConcentrationCheck + resolveConcentrationCheck — Batch A1 guard branches', () => {
  let gm: TestUser;
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
        payload: { name: 'Prepare-resolve A1 test campaign' },
      })
      .then((r) => r.json());
    worldId = campaign.worldId;

    pcCharId = await makeCharacter(app, gm.accessToken, worldId, 'Aryn (prepare-resolve test)');

    // Fighter L1 — CON save proficient (+4 total with CON=14).
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
    await db
      .delete(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId));
    if (gm) await deleteTestUser(gm.id);
  });

  // ── Guard 1: NPC → null ─────────────────────────────────────────────────────
  // REQ-CB-10 / ADR-1 guard 1.
  it('CID-PREP-01: NPC target (characterId=null) → prepareConcentrationCheck returns null', async () => {
    const plan = await prepareConcentrationCheck({ kind: 'npc', characterId: null }, 20, 5);
    expect(plan).toBeNull();
  });

  // ── Guard 2: no registry row → null ────────────────────────────────────────
  // REQ-CB-09 / ADR-1 guard 2.
  it('CID-PREP-02: non-concentrating PC → prepareConcentrationCheck returns null', async () => {
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 10, 5);
    expect(plan).toBeNull();
  });

  // ── Guard 3: 0-HP PRECEDENCE → breakOutright:true ─────────────────────────
  // REQ-CID-02 / ADR-2. Registry read must pass (concentrating), THEN 0-HP short-circuits.
  // This confirms guard order: registry (2) BEFORE 0-HP (3) — a non-concentrating 0-HP PC stays null.
  it('CID-PREP-03: concentrating PC + newHp===0 → breakOutright:true, no dc/saveBonus', async () => {
    await insertConcentrationRow(pcCharId);

    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 20, 0);

    // MUST have a plan and the breakOutright arm.
    expect(plan).not.toBeNull();
    expect(plan!.breakOutright).toBe(true);
    expect(plan!.characterId).toBe(pcCharId);
    // PHB p.197/p.203: outright break carries NO dc/saveBonus (omit-not-null).
    expect('dc' in plan!).toBe(false);
    expect('saveBonus' in plan!).toBe(false);

    // Cleanup: the plan doesn't delete the row; resolveConcentrationCheck does.
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
  });

  // ── Guard 3 interaction: non-concentrating PC + newHp===0 → null (guard 2 fires first) ─
  it('CID-PREP-04: non-concentrating PC + newHp===0 → null (registry guard fires before 0-HP)', async () => {
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 20, 0);
    // Guard 2 (no row) fires before guard 3 (0-HP) → null.
    expect(plan).toBeNull();
  });

  // ── Guard 4: zero damage → null ─────────────────────────────────────────────
  // PHB p.203: save only triggered by damage TAKEN. REQ-CB-08.
  it('CID-PREP-05: concentrating PC + finalDamage===0 → null (zero-damage guard)', async () => {
    await insertConcentrationRow(pcCharId);

    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 0, 5);
    expect(plan).toBeNull();

    // Cleanup.
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
  });

  // ── Guard 5: save branch → plan with breakOutright:false + dc + saveBonus ──
  it('CID-PREP-06: concentrating PC + damage>0 + newHp>0 → save branch plan', async () => {
    await insertConcentrationRow(pcCharId);

    // damage=20 → DC=max(10,10)=10. Fighter L1 CON+2 + prof+2 = saveBonus=4.
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 20, 5);

    expect(plan).not.toBeNull();
    expect(plan!.breakOutright).toBe(false);
    expect(plan!.characterId).toBe(pcCharId);
    if (!plan!.breakOutright) {
      expect(typeof plan!.dc).toBe('number');
      expect(plan!.dc).toBe(10); // max(10, floor(20/2)) = max(10,10) = 10
      expect(typeof plan!.saveBonus).toBe('number');
    }

    // Cleanup.
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
  });

  // ── resolveConcentrationCheck: outright break (breakOutright:true) ─────────
  // REQ-CID-02. Inside a tx, breakConcentration fires, returns {broke:true, reason:'incapacitated-0hp'}.
  it('CID-RESOLVE-01: resolveConcentrationCheck with breakOutright plan → row deleted, {broke:true,reason:\'incapacitated-0hp\'}', async () => {
    await insertConcentrationRow(pcCharId);
    expect(await hasConcentrationRow(pcCharId)).toBe(true);

    const plan: ConcentrationPlan = { breakOutright: true, characterId: pcCharId };

    let resolution: ConcentrationResolution | undefined;
    await dbClient.transaction(async (tx) => {
      resolution = await resolveConcentrationCheck(plan, tx);
    });

    // Response shape: outright block — no d20/dc fields.
    expect(resolution).toEqual({ broke: true, reason: 'incapacitated-0hp' });
    // Registry row must be gone.
    expect(await hasConcentrationRow(pcCharId)).toBe(false);
  });

  // ── resolveConcentrationCheck: save branch, guaranteed fail ────────────────
  // damage=100 → DC=50; Fighter L1 max save = 20+4 = 24 < 50 → guaranteed fail.
  it('CID-RESOLVE-02: resolveConcentrationCheck with save plan + guaranteed fail → row deleted, save block returned', async () => {
    await insertConcentrationRow(pcCharId);
    expect(await hasConcentrationRow(pcCharId)).toBe(true);

    // damage=100 → DC=50 (max(10, floor(100/2)) = 50). Fighter L1 max = 20+4=24 < 50.
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 100, 5);
    expect(plan).not.toBeNull();
    expect(plan!.breakOutright).toBe(false);

    let resolution: ConcentrationResolution | undefined;
    await dbClient.transaction(async (tx) => {
      resolution = await resolveConcentrationCheck(plan!, tx);
    });

    // Must be a ConcentrationSaveBlock with broke:true.
    expect(resolution).not.toBeUndefined();
    expect((resolution as any).broke).toBe(true);
    expect((resolution as any).success).toBe(false);
    expect(typeof (resolution as any).d20).toBe('number');
    expect(typeof (resolution as any).dc).toBe('number');
    expect((resolution as any).dc).toBe(50);

    // Registry row deleted on fail (REQ-CB-04).
    expect(await hasConcentrationRow(pcCharId)).toBe(false);
  });

  // ── resolveConcentrationCheck: save branch, guaranteed pass ────────────────
  // damage=1 → DC=10; same fighter save mod +4. On a 20, total=24 ≥ 10 → pass.
  // Can't guarantee pass deterministically, so just verify shape on a low-DC plan.
  // We use DC=10 and just assert the save block shape is correct (6 fields).
  it('CID-RESOLVE-03: resolveConcentrationCheck save block has 6 required fields on any outcome', async () => {
    await insertConcentrationRow(pcCharId);

    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 1, 5);
    expect(plan).not.toBeNull();
    expect(plan!.breakOutright).toBe(false);

    let resolution: ConcentrationResolution | undefined;
    await dbClient.transaction(async (tx) => {
      resolution = await resolveConcentrationCheck(plan!, tx);
    });

    expect(resolution).not.toBeUndefined();
    // Save block (6 fields per REQ-CB-12).
    const r = resolution as any;
    expect(typeof r.dc).toBe('number');
    expect(typeof r.d20).toBe('number');
    expect(typeof r.total).toBe('number');
    expect(typeof r.saveMod).toBe('number');
    expect(typeof r.success).toBe('boolean');
    expect(typeof r.broke).toBe('boolean');
    expect(r.broke).toBe(!r.success);

    // If broke, row is deleted; if pass, row still exists. Either is valid.
    // Just clean up.
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
  });
});

// ── B6 suite: REQ-CID-02 unit-level — 0-HP outright break via prepare/resolve ─
//
// PHB p.197: 0 HP → Unconscious → Incapacitated → concentration ends (no save required).
// PHB p.203: Concentration ends on incapacitation.
// ADR-2: the outright-break shape is { broke: true, reason: 'incapacitated-0hp' } — NO dc/d20 fields.
// This suite exercises the prepare/resolve split at unit level (not via HTTP).
// HTTP-level 0-HP tests are in engine-concentration-break-damage.test.ts (CBW-07, CBS-04, CBR-06).

describe('REQ-CID-02 — 0-HP outright break (no save) via prepare/resolve', () => {
  let gm: TestUser;
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
        payload: { name: 'CID-0HP unit test campaign' },
      })
      .then((r) => r.json());
    worldId = campaign.worldId;

    pcCharId = await (async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Ryn (CID-0HP test)' },
      });
      if (res.statusCode !== 201) throw new Error(`makeChar: ${res.statusCode} ${res.body}`);
      const charId = res.json<{ id: string }>().id;

      // Fighter L1 — CON save proficient (CON+2, prof+2 = +4).
      const statsRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 },
        },
      });
      if (statsRes.statusCode !== 200 && statsRes.statusCode !== 201)
        throw new Error(`set-stats: ${statsRes.statusCode} ${statsRes.body}`);
      const classRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${charId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      });
      if (classRes.statusCode !== 200 && classRes.statusCode !== 201)
        throw new Error(`set-class: ${classRes.statusCode} ${classRes.body}`);
      return charId;
    })();
  });

  afterAll(async () => {
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));
    if (gm) await deleteTestUser(gm.id);
  });

  // CID-0HP-01: concentrating PC + newHp===0 + finalDamage>0 →
  //   prepare returns { breakOutright: true }, resolve returns { broke: true, reason: 'incapacitated-0hp' }.
  //   NO save rolled. Registry row deleted.
  // PHB p.197/p.203. REQ-CID-02.
  it('CID-0HP-01: concentrating PC + newHp===0 → outright break, no save, row deleted (REQ-CID-02)', async () => {
    // Insert concentration row.
    await db
      .insert(characterConcentration)
      .values({
        characterId: pcCharId,
        concentrationToken: randomUUID(),
        store: 'modifier_instances',
        spellName: 'Bless',
      })
      .onConflictDoUpdate({
        target: characterConcentration.characterId,
        set: { concentrationToken: randomUUID(), store: 'modifier_instances', spellName: 'Bless' },
      });

    const [registryBefore] = await db
      .select({ characterId: characterConcentration.characterId })
      .from(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId))
      .limit(1);
    expect(registryBefore).not.toBeUndefined();

    // PREPARE: finalDamage=20, newHp=0 → guard 3 fires → breakOutright:true.
    // (Guard 2 — registry SELECT — passes because row exists.)
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 20, 0);

    // ADR-2: plan must be breakOutright:true with no dc/saveBonus.
    expect(plan).not.toBeNull();
    expect(plan!.breakOutright).toBe(true);
    expect(plan!.characterId).toBe(pcCharId);
    expect('dc' in plan!).toBe(false);
    expect('saveBonus' in plan!).toBe(false);

    // RESOLVE inside a tx: breakConcentration fires inside tx (REQ-CID-04).
    let resolution: ConcentrationResolution | undefined;
    await dbClient.transaction(async (tx) => {
      resolution = await resolveConcentrationCheck(plan!, tx);
    });

    // ADR-2 response: { broke: true, reason: 'incapacitated-0hp' } — no d20/dc fields.
    expect(resolution).toEqual({ broke: true, reason: 'incapacitated-0hp' });

    // REQ-CID-02: registry row MUST be deleted (outright break, no save).
    const [registryAfter] = await db
      .select({ characterId: characterConcentration.characterId })
      .from(characterConcentration)
      .where(eq(characterConcentration.characterId, pcCharId))
      .limit(1);
    expect(registryAfter).toBeUndefined();
  });

  // CID-0HP-02: non-concentrating PC + newHp===0 → prepare returns null.
  //   PHB p.197/p.203 still applies, but the PC was not concentrating — no-op.
  //   REQ-CID-02 scenario "Non-concentrating PC takes lethal damage".
  it('CID-0HP-02: non-concentrating PC + newHp===0 → prepare returns null (no concentration — REQ-CID-02)', async () => {
    // Ensure NO concentration row.
    await db.delete(characterConcentration).where(eq(characterConcentration.characterId, pcCharId));

    // finalDamage=20, newHp=0 → guard 2 (no registry row) fires before guard 3.
    const plan = await prepareConcentrationCheck({ kind: 'pc', characterId: pcCharId }, 20, 0);

    // Guard 2 (registry) fires first → null. breakOutright path is never reached.
    expect(plan).toBeNull();
  });

  // CID-0HP-03: NPC + newHp===0 → prepare returns null (NPC guard 1).
  //   REQ-CID-02 scenario "NPC takes lethal damage".
  it('CID-0HP-03: NPC + newHp===0 → prepare returns null (NPC guard 1 — REQ-CID-02)', async () => {
    const plan = await prepareConcentrationCheck({ kind: 'npc', characterId: null }, 20, 0);
    // Guard 1 (NPC/characterId=null) fires immediately → null.
    expect(plan).toBeNull();
  });
});

/**
 * Integration tests — engine-reckless-attack (Barbarian Reckless Attack, PHB p.48).
 *
 * PHB p.48 — Reckless Attack:
 *   "When you make your first attack on your turn, you can decide to attack recklessly.
 *    Doing so gives you advantage on melee weapon attack rolls using Strength during
 *    this turn, but attack rolls against you have advantage until the start of your next turn."
 *
 * Tests:
 *   RECK-T1 (SCENARIO-12): reckless:true on a hit → RecklessAttacking condition inserted
 *   RECK-T2 (SCENARIO-13): reckless:true twice (multi-attack) → only 1 condition row (idempotency)
 *   RECK-T3 (SCENARIO-14): reckless:true + stale version (CAS conflict) → condition NOT inserted
 *   RECK-T4: reckless absent → no condition row inserted
 *   RECK-T5: reckless:false → no condition row inserted
 *
 * Implementation note: the condition insert is INSIDE the CAS tx (on-hit path only).
 * A miss does not invoke the transaction (REQ-APPLY-FLOW-02: no mutation on miss).
 *
 * PHB p.48 is the rule source for all assertions in this file.
 * REQ-API-02: server inserts RecklessAttacking condition inside the CAS tx (SELECT-before-INSERT idempotency).
 * engine-barbarian-dsl-2 Batch 2.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-reckless-attack — POST /encounters/:id/actions/attack/apply (PHB p.48)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // Barbarian L1: STR 16 (+3), DEX 10 (+0) — longsword (melee, non-finesse → always STR).
  // High STR ensures selectAttackAbilityKind picks STR (STR wins ties per strict > rule).
  let barbarianCharId: string;
  let longswordInstanceId: string;

  // ── Helpers ────────────────────────────────────────────────────────────────────

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  /** Read conditions for a combatant from DB. */
  const getConditions = async (combatantId: string): Promise<Array<{ conditionName: string }>> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    return db
      .select({ conditionName: encounterCombatantConditions.conditionName })
      .from(encounterCombatantConditions)
      .where(eq(encounterCombatantConditions.combatantId, combatantId));
  };

  /** Count RecklessAttacking rows for a combatant (idempotency check). */
  const countRecklessRows = async (combatantId: string): Promise<number> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
    const { and, eq } = await import('drizzle-orm');
    const rows = await db
      .select({ id: encounterCombatantConditions.id })
      .from(encounterCombatantConditions)
      .where(
        and(
          eq(encounterCombatantConditions.combatantId, combatantId),
          eq(encounterCombatantConditions.conditionName, 'RecklessAttacking'),
        ),
      );
    return rows.length;
  };

  /** Read encounter version directly from DB. */
  const getVersion = async (encounterId: string): Promise<number> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select({ version: encounters.version }).from(encounters).where(eq(encounters.id, encounterId)).limit(1);
    return row?.version ?? -1;
  };

  /**
   * Create a fresh encounter: Barbarian (pc, init=20) vs Goblin (npc, init=5, ac=1).
   * Barbarian is always currentCombatantId (highest initiative).
   * ac=1 ensures near-certain hit (nat-1 still misses — see RNG retry loops in CLAUDE.md §5).
   */
  const makeFreshEncounter = async (name: string, opts: { npcHp?: number; npcAc?: number } = {}) => {
    const app = await getTestApp();
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
              name: 'Barbarian',
              kind: 'pc',
              characterId: barbarianCharId,
              initiative: 20,
              hpCurrent: 20,
              hpMax: 20,
            },
            {
              name: 'Goblin',
              kind: 'npc',
              initiative: 5,
              hpCurrent: opts.npcHp ?? 30,
              hpMax: opts.npcHp ?? 30,
              ac: opts.npcAc ?? 1,
            },
          ],
        },
      })
      .then((r) => r.json());

    const barbarianCombatantId = enc.currentCombatantId as string;
    const npcCombatantId =
      (enc.combatants.find((c: { id: string }) => c.id !== barbarianCombatantId)?.id as string) ?? '';
    return {
      encounterId: enc.id as string,
      barbarianCombatantId,
      npcCombatantId,
      version: enc.version as number,
    };
  };

  /**
   * POST attack/apply with optional reckless flag.
   * Uses the encounter version passed (not read from DB — caller manages CAS).
   */
  const doAttackApply = async (
    encounterId: string,
    attackerId: string,
    targetId: string,
    weaponId: string,
    version: number,
    opts: { reckless?: boolean } = {},
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
        version,
        ...(opts.reckless !== undefined ? { reckless: opts.reckless } : {}),
      },
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  // ── beforeAll ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Engine Reckless Attack Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId as string;

    // Barbarian L1: STR 16 (+3) — longsword (melee, non-finesse → always uses STR).
    // PHB p.48: reckless attack gives advantage on melee weapon attacks using Strength.
    const barbarianChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Barbarian (reckless test)' },
      })
      .then((r) => r.json());
    barbarianCharId = barbarianChar.id as string;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${barbarianCharId}/stats`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { method: 'standard-array', scores: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 } },
    });

    await expectOk(
      'set-barbarian-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${barbarianCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { class: { slug: 'barbarian', source: 'PHB' }, level: 1, skillChoices: ['athletics', 'animal handling'] },
      }),
    );

    await expectOk(
      'add-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${barbarianCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    const sheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${barbarianCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());

    longswordInstanceId =
      sheet.inventory?.find((item: { itemSlug: string }) => item.itemSlug === 'longsword')?.instanceId ?? '';

    expect(longswordInstanceId, 'longswordInstanceId must be set').not.toBe('');
  });

  afterAll(async () => {
    await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── RECK-T1: reckless:true on a hit → RecklessAttacking inserted ────────────────

  it('RECK-T1 (SCENARIO-12): reckless:true on a successful hit → RecklessAttacking condition row inserted (PHB p.48)', async () => {
    // PHB p.48: "attack rolls against you have advantage until the start of your next turn"
    // When player declares reckless on a hit, RecklessAttacking condition must be persisted.
    // Implementation: condition insert is inside the CAS tx (on-hit path). ac=1 → near-certain hit.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T1', { npcAc: 1 });

    let hit = false;
    while (!hit) {
      const current = await getVersion(encounterId);
      const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, current, { reckless: true });
      if (res.statusCode === 200 && res.body.hit === true) {
        hit = true;
      } else if (res.statusCode === 200 && res.body.hit === false) {
        // nat-1 miss — retry with fresh version (no mutation, so version unchanged)
        continue;
      }
    }

    // RecklessAttacking must be present after a reckless hit.
    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'SCENARIO-12: RecklessAttacking condition must exist after reckless hit').toBe(1);
  });

  // ── RECK-T2: reckless:true twice → only 1 row (idempotency) ───────────────────

  it('RECK-T2 (SCENARIO-13): reckless:true on two attacks in the same turn → only 1 RecklessAttacking row (idempotency)', async () => {
    // PHB p.48: Extra Attack (Fighter L5) or action surge allows multiple attacks per turn.
    // The reckless declaration applies once per turn; the condition must not be duplicated
    // by repeated attack/apply calls with reckless:true.
    // SELECT-before-INSERT guard prevents duplicate rows.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T2', { npcHp: 100, npcAc: 1 });

    // First reckless hit — retry until confirmed hit.
    let firstHit = false;
    while (!firstHit) {
      const v1 = await getVersion(encounterId);
      const res1 = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v1, { reckless: true });
      if (res1.statusCode === 200 && res1.body.hit === true) {
        firstHit = true;
      } else if (res1.statusCode === 200 && res1.body.hit === false) {
        // nat-1 miss — retry
        continue;
      } else if (res1.statusCode === 409) {
        // CAS conflict — retry
        continue;
      }
    }

    const afterFirst = await countRecklessRows(barbarianCombatantId);
    expect(afterFirst, 'first reckless hit inserts exactly 1 row').toBe(1);

    // Second reckless attack — the idempotency guard must prevent a second INSERT.
    // The action economy (ACTION_ALREADY_USED) may prevent the attack, but even if it goes through
    // on a hit, the condition row count must remain 1.
    let done2 = false;
    while (!done2) {
      const v2 = await getVersion(encounterId);
      const res2 = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v2, { reckless: true });
      if (res2.statusCode === 200 && res2.body.hit === true) {
        done2 = true; // second hit succeeded — idempotency guard must have prevented a second row
      } else if (res2.statusCode === 200 && res2.body.hit === false) {
        // miss (no tx, no insert) — still done for this test
        done2 = true;
      } else if (res2.statusCode === 409) {
        // action already used or CAS conflict — done (no mutation happened)
        done2 = true;
      } else if (res2.statusCode === 400) {
        // ACTION_ALREADY_USED — budget exhausted; no insertion possible
        done2 = true;
      }
    }

    // SCENARIO-13: still exactly 1 row — no duplicate.
    const afterSecond = await countRecklessRows(barbarianCombatantId);
    expect(afterSecond, 'SCENARIO-13: idempotency — second reckless call must not add a second row').toBe(1);
  });

  // ── RECK-T3: CAS conflict → condition NOT inserted (SCENARIO-14) ──────────────

  it('RECK-T3 (SCENARIO-14): reckless:true with stale version (CAS conflict) → VERSION_CONFLICT 409 + no condition row inserted', async () => {
    // SCENARIO-14: CAS conflict (WHERE version=X fails because version already bumped).
    // The condition INSERT must roll back with the transaction — no orphaned row.
    const { encounterId, barbarianCombatantId, npcCombatantId, version: v0 } = await makeFreshEncounter('RECK-T3', { npcAc: 1 });

    // Perform a real attack first (no reckless) to bump version (so v0 is now stale).
    let bumped = false;
    while (!bumped) {
      const current = await getVersion(encounterId);
      const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, current);
      if (res.statusCode === 200 && res.body.hit === true) {
        bumped = true;
      } else if (res.statusCode === 200 && res.body.hit === false) {
        // miss — version not bumped, retry
        continue;
      }
    }

    // Verify version has been bumped past v0.
    const vAfter = await getVersion(encounterId);
    expect(vAfter, 'version must be bumped after first attack').toBeGreaterThan(v0);

    // Now POST with the STALE version v0 + reckless:true → must return 409.
    // The condition INSERT is inside the tx; tx rolls back → no condition row.
    const staleRes = await doAttackApply(
      encounterId,
      barbarianCombatantId,
      npcCombatantId,
      longswordInstanceId,
      v0, // stale
      { reckless: true },
    );
    expect(staleRes.statusCode, 'SCENARIO-14: stale version must return 409').toBe(409);
    expect(staleRes.body.error, 'SCENARIO-14: error code must be VERSION_CONFLICT').toBe('VERSION_CONFLICT');

    // After the rollback, count RecklessAttacking rows — must be 0 (the first attack did not pass reckless:true).
    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'SCENARIO-14: no RecklessAttacking row must exist after CAS rollback').toBe(0);
  });

  // ── RECK-T4: reckless absent → no condition ────────────────────────────────────

  it('RECK-T4: reckless field absent → no RecklessAttacking condition inserted', async () => {
    // PHB p.48: reckless attack is a CHOICE, not automatic. Omitting the field = no declaration.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T4', { npcAc: 1 });

    // Attack without reckless (field omitted) — retry until hit (no mutation on miss).
    let done = false;
    while (!done) {
      const v = await getVersion(encounterId);
      const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v);
      if (res.statusCode === 200 && res.body.hit === true) done = true;
      // miss → retry
    }

    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'no reckless declaration → no RecklessAttacking condition').toBe(0);
  });

  // ── RECK-T5: reckless:false → no condition ─────────────────────────────────────

  it('RECK-T5: reckless:false → no RecklessAttacking condition inserted', async () => {
    // Explicit false = player chose NOT to attack recklessly.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T5', { npcAc: 1 });

    let done = false;
    while (!done) {
      const v = await getVersion(encounterId);
      const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v, { reckless: false });
      if (res.statusCode === 200 && res.body.hit === true) done = true;
      // miss → retry
    }

    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'reckless:false → no RecklessAttacking condition').toBe(0);
  });
});

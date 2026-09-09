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
 *   RECK-T6 (S2 — C1 fix): reckless:true STR-melee DECLARING attack itself rolls with advantage
 *            (d20All.length === 2 proves two dice were rolled — PHB p.48 advantage from declaration)
 *   RECK-T7 (S2 — C1 fix): reckless:true + MISS (ac=30) → RecklessAttacking condition row EXISTS
 *            (PHB p.48: advantage and condition apply from the declaration, regardless of hit/miss)
 *
 * PHB p.48 is the rule source for all assertions in this file.
 * REQ-API-02: server inserts RecklessAttacking condition inside the CAS tx (SELECT-before-INSERT idempotency).
 * C1 fix (engine-barbarian-dsl-2 verify-report): moved condition INSERT to pre-roll block so the
 *   DECLARING attack itself receives advantage, and miss path also persists the condition row.
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
  const _getConditions = async (combatantId: string): Promise<Array<{ conditionName: string }>> => {
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

  // ── RECK-T1: reckless:true → RecklessAttacking inserted (C1 fix: pre-roll, outcome-independent) ─

  it('RECK-T1 (SCENARIO-12): reckless:true → RecklessAttacking condition row inserted (PHB p.48, C1 fix: pre-roll)', async () => {
    // PHB p.48: "attack rolls against you have advantage until the start of your next turn"
    // C1 fix: condition is now inserted in the pre-roll block (Step 6d), BEFORE resolveWeaponAttack.
    // The insert is outcome-independent: fires on reckless:true regardless of hit or miss.
    // Strategy: fire one attack with reckless:true. Budget tx fires (action consumed).
    // Condition must exist after any single reckless:true call (even on nat-1 miss).
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T1', { npcAc: 1 });

    const v = await getVersion(encounterId);
    const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v, { reckless: true });
    expect(res.statusCode, 'RECK-T1: attack must return 200').toBe(200);

    // RecklessAttacking must be present after any reckless:true call (pre-roll insert, C1 fix).
    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'SCENARIO-12: RecklessAttacking condition must exist after reckless:true (C1 fix: pre-roll)').toBe(1);
  });

  // ── RECK-T2: reckless:true twice → only 1 row (idempotency) ───────────────────

  it('RECK-T2 (SCENARIO-13): reckless:true twice in the same turn → only 1 RecklessAttacking row (idempotency)', async () => {
    // PHB p.48: The reckless declaration applies once per turn; the condition must not be
    // duplicated by repeated reckless:true calls.
    // SELECT-exists guard prevents duplicate rows (no UNIQUE constraint on conditions table).
    //
    // C1 fix: condition is now inserted in the pre-roll block. The idempotency SELECT-exists
    // guard still prevents a second INSERT even across multiple reckless:true calls.
    // Strategy: first call inserts the row. Second call (on fresh version, from turn allowance
    //   or on stale version after action is consumed) must NOT insert a second row.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T2', { npcHp: 100, npcAc: 1 });

    // First reckless attack (any outcome: hit or miss). Condition inserted in pre-roll block.
    const v1 = await getVersion(encounterId);
    const res1 = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v1, { reckless: true });
    expect(res1.statusCode, 'RECK-T2: first attack must return 200').toBe(200);

    const afterFirst = await countRecklessRows(barbarianCombatantId);
    expect(afterFirst, 'first reckless call inserts exactly 1 row').toBe(1);

    // Second reckless attack attempt — may return VERSION_CONFLICT, ACTION_ALREADY_USED, or 200.
    // In all cases: the SELECT-exists guard must prevent a second INSERT.
    // (Budget consumed by first call, so next attempt likely gets ACTION_ALREADY_USED or 409.)
    const v2 = await getVersion(encounterId);
    await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v2, { reckless: true });
    // (result doesn't matter — we only care about condition row count)

    // SCENARIO-13: still exactly 1 row — no duplicate.
    const afterSecond = await countRecklessRows(barbarianCombatantId);
    expect(afterSecond, 'SCENARIO-13: idempotency — second reckless call must not add a second row').toBe(1);
  });

  // ── RECK-T3: genuine version mismatch → early VERSION_CONFLICT + no condition row ─

  it('RECK-T3 (SCENARIO-14): reckless:true with stale encounter version → 409 VERSION_CONFLICT + no condition row inserted', async () => {
    // SCENARIO-14: the encounter-version pre-check (Step 1, line 321) fires BEFORE the
    // pre-roll condition INSERT block (Step 6d). A genuine version mismatch (client sends
    // a version that no longer matches encounters.version in the DB) returns VERSION_CONFLICT
    // immediately, before the condition INSERT can run. The condition row is NOT inserted.
    //
    // This is distinct from the budget-CAS race (two concurrent requests with matching initial
    // version): in the race case, the version pre-check passes, the pre-roll INSERT fires,
    // and then the budget CAS fails → condition IS persisted (PHB: declaration is irrevocable).
    // RECK-T3 tests the simpler "obviously stale version" path where the pre-check gates first.
    //
    // PHB p.48 rule source: no rule change here — the server rejected the request before any
    // game-state declaration was accepted. The player never "made" the attack.
    const { encounterId, barbarianCombatantId, npcCombatantId, version: v0 } = await makeFreshEncounter('RECK-T3', { npcAc: 1 });

    // Perform a real attack (no reckless) to bump the encounter version past v0.
    // Use a fresh version on each attempt to avoid ACTION_ALREADY_USED on miss-then-retry.
    // Break after any 200 response (hit or miss both bump version via budget tx).
    let bumped = false;
    while (!bumped) {
      const current = await getVersion(encounterId);
      if (current > v0) { bumped = true; break; }
      const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, current);
      if (res.statusCode === 200) {
        bumped = true; // hit or miss — budget tx bumped version in either case
      } else if (res.statusCode === 400) {
        // ACTION_ALREADY_USED — budget consumed by a prior attempt (miss bumps budget tx too)
        bumped = true;
      }
      // 409 → retry with fresh version
    }

    // Verify version has been bumped past v0.
    const vAfter = await getVersion(encounterId);
    expect(vAfter, 'version must be bumped after first attack').toBeGreaterThan(v0);

    // Now POST with STALE version v0 + reckless:true.
    // Step 1 version pre-check fires: encounterRow.version !== v0 → VERSION_CONFLICT (409).
    // The condition INSERT (Step 6d) never runs. Condition row remains absent.
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

    // The first non-reckless attack had no reckless:true, so no condition was inserted.
    // The stale reckless attack returned early (version pre-check gate) before Step 6d.
    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'SCENARIO-14: no RecklessAttacking row after VERSION_CONFLICT early-return').toBe(0);
  });

  // ── RECK-T4: reckless absent → no condition ────────────────────────────────────

  it('RECK-T4: reckless field absent → no RecklessAttacking condition inserted', async () => {
    // PHB p.48: reckless attack is a CHOICE, not automatic. Omitting the field = no declaration.
    // Strategy: fire the first attack without reckless flag. Budget tx fires regardless (action consumed).
    // Any 200 response (hit or miss) or ACTION_ALREADY_USED (400) confirms the attack was processed.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T4', { npcAc: 1 });

    const v = await getVersion(encounterId);
    const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v);
    // Any non-error response confirms the attack was processed without reckless.
    expect(res.statusCode, 'RECK-T4: attack must return 200').toBe(200);

    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'no reckless declaration → no RecklessAttacking condition').toBe(0);
  });

  // ── RECK-T5: reckless:false → no condition ─────────────────────────────────────

  it('RECK-T5: reckless:false → no RecklessAttacking condition inserted', async () => {
    // Explicit false = player chose NOT to attack recklessly.
    // Strategy: fire the first attack with reckless:false. Budget tx fires (action consumed).
    // Any 200 response (hit or miss) confirms the attack was processed with reckless:false.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T5', { npcAc: 1 });

    const v = await getVersion(encounterId);
    const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v, { reckless: false });
    expect(res.statusCode, 'RECK-T5: attack must return 200').toBe(200);

    const rows = await countRecklessRows(barbarianCombatantId);
    expect(rows, 'reckless:false → no RecklessAttacking condition').toBe(0);
  });

  // ── RECK-T6 (C1 fix, S2): declaring reckless attack itself rolls with advantage ─

  it('RECK-T6 (C1/S2): reckless:true STR-melee DECLARING attack rolls with advantage (d20All.length===2, PHB p.48)', async () => {
    // PHB p.48: "you can decide to attack recklessly. Doing so gives you advantage on
    //   melee weapon attack rolls using Strength during this turn"
    // The DECLARING attack itself must receive advantage — not just subsequent attacks.
    // d20All.length === 2 proves two dice were rolled (advantage semantics — PHB p.173).
    // Barbarian has STR 16 (+3), longsword is non-finesse → abilityUsed:'str' always.
    // Strategy: fire the FIRST attack with reckless:true. The budget tx will bump version on
    //   the first call regardless of hit/miss. Capture d20All from the FIRST response and assert
    //   it has 2 elements — no retry needed (advantage is always-or-never for a given attack).
    // Note: after the first call (whether hit or miss), the action is consumed; a second attempt
    //   would return ACTION_ALREADY_USED. We only need the first response.
    const { encounterId, barbarianCombatantId, npcCombatantId } = await makeFreshEncounter('RECK-T6', { npcAc: 1 });

    const v = await getVersion(encounterId);
    const res = await doAttackApply(encounterId, barbarianCombatantId, npcCombatantId, longswordInstanceId, v, { reckless: true });

    // Must be a valid attack response (hit or miss, not an error).
    expect(res.statusCode, 'RECK-T6: attack must return 200').toBe(200);
    expect(typeof res.body.hit, 'RECK-T6: hit field must be boolean').toBe('boolean');

    // C1 assertion: the declaring attack rolled with advantage (2 dice in d20All).
    // PHB p.48 — advantage applies "during this turn", starting from declaration.
    const d20All = res.body.d20All as number[];
    expect(d20All, 'RECK-T6: d20All must exist').toBeDefined();
    expect(d20All.length, 'RECK-T6: advantage → 2 dice rolled (PHB p.48 advantage from declaration)').toBe(2);
  });

  // ── RECK-T7 (C1 fix, S2): reckless MISS → condition row still persisted ───────

  it('RECK-T7 (C1/S2): reckless:true + MISS (ac=30) → RecklessAttacking condition row EXISTS (PHB p.48)', async () => {
    // PHB p.48: advantage and the condition apply from the moment of declaration,
    //   regardless of whether the attack hits or misses.
    // The condition INSERT must be outcome-independent (pre-roll, not inside the HIT-only CAS tx).
    // ac=30 → near-certain miss (nat-20 crit still hits at any AC — PHB p.194).
    // Strategy: fire the first attack with reckless:true regardless of outcome.
    //   On confirmed miss → assert condition exists (primary assertion).
    //   On nat-20 crit hit → condition still exists (secondary assertion — still correct).
    //   Either way, the condition MUST be in the DB after the first reckless:true call.
    const {  } = await makeFreshEncounter('RECK-T7', { npcAc: 30 });

    // Loop until confirmed miss (nat-20 crit would still hit at ac=30; re-create encounter and retry).
    let done = false;
    while (!done) {
      const enc = await makeFreshEncounter('RECK-T7-retry', { npcAc: 30 });
      const v = await getVersion(enc.encounterId);
      const res = await doAttackApply(enc.encounterId, enc.barbarianCombatantId, enc.npcCombatantId, longswordInstanceId, v, { reckless: true });
      if (res.statusCode === 200 && res.body.hit === false) {
        // Confirmed miss — assert condition exists for this combatant.
        const rows = await countRecklessRows(enc.barbarianCombatantId);
        expect(rows, 'RECK-T7: RecklessAttacking condition must exist after a reckless miss (PHB p.48)').toBe(1);
        done = true;
      }
      // nat-20 crit hit → retry with a fresh encounter to get a confirmed miss
    }
  });
});

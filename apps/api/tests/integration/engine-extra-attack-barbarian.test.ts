/**
 * Integration tests — Barbarian Extra Attack (PHB p.49).
 *
 * Verifies the action-economy budget behavior for Barbarian characters at L4
 * (below Extra Attack gate) and L5+ (Extra Attack qualified), using real
 * Supabase + Postgres.
 *
 * PHB p.49: "Beginning at 5th level, you can attack twice, instead of once,
 * whenever you take the Attack action on your turn."
 *
 * These tests are GREEN-on-write (engine already implements barbarian Extra Attack).
 * A falsification proof (BARB-EA-T3) is recorded in apply-progress per REQ-HYGIENE-04.
 *
 * Tests:
 *   BARB-EA-T1: Barbarian L4 first attack → statusCode 200 (budget consumed).
 *   BARB-EA-T2: Barbarian L4 second attack → 400 ACTION_ALREADY_USED (1-attack limit).
 *   BARB-EA-T3: Barbarian L5 first attack → 200; second attack → 200 (Extra Attack).
 *   BARB-EA-T4: Barbarian L5 third attack → 400 ACTION_ALREADY_USED (allowance exhausted).
 *   BARB-EA-T5: Barbarian L5 both attacks target different NPCs → both 200 (multi-target legality).
 *   BARB-EA-T6: advance-encounter-turn resets barbarian budget → first attack on new turn is 200.
 *   BARB-EA-T7: Raging barbarian L5 attacks with rage bonus on confirmed hit (while(!hit) loop).
 *
 * REQ-BARB-EA-01..08, REQ-HYGIENE-01..04.
 *
 * Self-contained file: all helpers copied inline (design R7 — no cross-file imports).
 * Two fixtures: barbarian-4 (below threshold) and barbarian-5 (qualified).
 * Mirrors engine-action-economy.test.ts structure.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-extra-attack-barbarian — Barbarian Extra Attack (PHB p.49)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // Barbarian L4 character (below Extra Attack gate)
  let barb4CharId: string;
  let longswordBarb4InstanceId: string;

  // Barbarian L5 character (Extra Attack qualified)
  let barb5CharId: string;
  let longswordBarb5InstanceId: string;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  /** Read encounter version from DB. */
  const getVersion = async (encounterId: string): Promise<number> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select({ version: encounters.version })
      .from(encounters)
      .where(eq(encounters.id, encounterId))
      .limit(1);
    return row?.version ?? -1;
  };

  /**
   * Create a fresh encounter with one PC attacker (initiative=20) and one NPC target.
   * Returns { encounterId, attackerCombatantId, targetCombatantId, version }.
   */
  const makeFreshEncounter = async (
    name: string,
    opts: {
      attackerCharId: string;
      targetAc?: number;
      targetHp?: number;
      npcName?: string;
    },
  ) => {
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
              name: 'PC Barbarian',
              kind: 'pc',
              characterId: opts.attackerCharId,
              initiative: 20,
              hpCurrent: 50,
              hpMax: 50,
            },
            {
              name: opts.npcName ?? 'NPC Target',
              kind: 'npc',
              initiative: 5,
              hpCurrent: opts.targetHp ?? 200,
              hpMax: opts.targetHp ?? 200,
              ac: opts.targetAc ?? 1, // AC=1 → near-guaranteed hit (only nat-1 misses)
            },
          ],
        },
      })
      .then((r) => r.json());

    const attackerCombatantId: string = enc.currentCombatantId;
    const targetCombatantId: string =
      enc.combatants.find((c: { id: string }) => c.id !== attackerCombatantId)?.id ?? '';

    return {
      encounterId: enc.id as string,
      attackerCombatantId,
      targetCombatantId,
      version: enc.version as number,
    };
  };

  /**
   * Create a fresh encounter with TWO NPC targets (for multi-target legality test).
   * Returns attackerCombatantId, npcA, npcB, encounterId, version.
   */
  const makeFreshEncounterTwoTargets = async (name: string, attackerCharId: string) => {
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
              name: 'PC Barbarian',
              kind: 'pc',
              characterId: attackerCharId,
              initiative: 20,
              hpCurrent: 50,
              hpMax: 50,
            },
            {
              name: 'NPC Target A',
              kind: 'npc',
              initiative: 5,
              hpCurrent: 200,
              hpMax: 200,
              ac: 1,
            },
            {
              name: 'NPC Target B',
              kind: 'npc',
              initiative: 3,
              hpCurrent: 200,
              hpMax: 200,
              ac: 1,
            },
          ],
        },
      })
      .then((r) => r.json());

    const attackerCombatantId: string = enc.currentCombatantId;
    const npcs: Array<{ id: string; name: string }> = enc.combatants.filter(
      (c: { id: string }) => c.id !== attackerCombatantId,
    );
    const npcAId = npcs[0]?.id ?? '';
    const npcBId = npcs[1]?.id ?? '';

    return {
      encounterId: enc.id as string,
      attackerCombatantId,
      npcAId,
      npcBId,
      version: enc.version as number,
    };
  };

  /** POST /encounters/:id/actions/attack/apply helper. */
  const doAttack = async (
    encounterId: string,
    attackerId: string,
    targetId: string,
    weaponInstanceId: string,
    version: number,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { attackerId, targetId, weaponInstanceId, version },
    });
    return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
  };

  /** POST /encounters/:id/actions/activate-rage helper. */
  const doActivateRage = async (encounterId: string, ragerId: string, version: number) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/activate-rage`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { ragerId, version },
    });
    return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
  };

  /** Reset rage-uses spent to 0 (allows rage activation). */
  const resetRageUsed = async (charId: string): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return;
    const data = row.data as Record<string, unknown>;
    const classResourcesUsed = {
      ...((data['classResourcesUsed'] as Record<string, number>) ?? {}),
      'barbarian:rage-uses': 0,
    };
    await db
      .update(characters)
      .set({ data: { ...data, classResourcesUsed }, updatedAt: new Date() })
      .where(eq(characters.id, charId));
  };

  /** Advance encounter turn. */
  const advanceTurn = async (encounterId: string, version: number) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/advance-turn`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { version },
    });
    if (res.statusCode !== 200) throw new Error(`advanceTurn failed: ${res.statusCode} ${res.body}`);
    return res.json() as { version: number; currentCombatantId: string };
  };

  // ── beforeAll: set up fixtures ────────────────────────────────────────────────

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    // Campaign
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Barbarian EA Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id as string;
    worldId = campaign.worldId as string;

    // ── Barbarian L4 fixture ──────────────────────────────────────────────────────
    // PHB p.49: "Beginning at 5th level" — L4 does NOT get Extra Attack.
    const b4 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Grok-L4' },
      })
      .then((r) => r.json());
    barb4CharId = b4.id as string;

    // PATCH to set class + stats directly (mirrors AE-T4 Fighter L5 pattern).
    // Using PATCH bypasses the subclass-required check for L4 (berserker required at L3+).
    // PHB p.49: Barbarian subclass (Primal Path) chosen at L3. We use PATCH to set it cleanly.
    await expectOk(
      'barb4-patch',
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/characters/${barb4CharId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          data: {
            classes: [
              {
                slug: 'barbarian',
                source: 'PHB',
                level: 4,
                hitDie: 'd12',
                subclass: { slug: 'barbarian--berserker', source: 'PHB' },
                savingThrows: ['str', 'con'],
                armorProficiencies: [],
                weaponProficiencies: [],
                toolProficiencies: [],
                skillChoices: ['athletics', 'intimidation'],
              },
            ],
            baseStats: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 },
          },
        },
      }),
    );

    // Add longsword (melee STR weapon) to inventory.
    await expectOk(
      'barb4-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${barb4CharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );
    const b4Sheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${barb4CharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const b4Sword = b4Sheet.inventory?.find((i: { itemSlug: string }) => i.itemSlug === 'longsword');
    longswordBarb4InstanceId = b4Sword?.instanceId ?? '';
    if (!longswordBarb4InstanceId) throw new Error('barb4 longsword instanceId not found');

    // ── Barbarian L5 fixture ──────────────────────────────────────────────────────
    // PHB p.49: Barbarian L5 → Extra Attack (2 attacks per Attack action).
    const b5 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Grok-L5' },
      })
      .then((r) => r.json());
    barb5CharId = b5.id as string;

    await expectOk(
      'barb5-patch',
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/characters/${barb5CharId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          data: {
            classes: [
              {
                slug: 'barbarian',
                source: 'PHB',
                level: 5,
                hitDie: 'd12',
                subclass: { slug: 'barbarian--berserker', source: 'PHB' },
                savingThrows: ['str', 'con'],
                armorProficiencies: [],
                weaponProficiencies: [],
                toolProficiencies: [],
                skillChoices: ['athletics', 'intimidation'],
              },
            ],
            baseStats: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 },
          },
        },
      }),
    );

    await expectOk(
      'barb5-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${barb5CharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );
    const b5Sheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${barb5CharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const b5Sword = b5Sheet.inventory?.find((i: { itemSlug: string }) => i.itemSlug === 'longsword');
    longswordBarb5InstanceId = b5Sword?.instanceId ?? '';
    if (!longswordBarb5InstanceId) throw new Error('barb5 longsword instanceId not found');
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── BARB-EA-T1 — Barbarian L4 first attack → 200 ─────────────────────────────

  it('BARB-EA-T1: barbarian L4 first attack → statusCode 200 (action consumed, PHB p.49)', async () => {
    // PHB p.49: "Beginning at 5th level" — L4 does NOT qualify for Extra Attack.
    // L4 barbarian gets exactly 1 attack per Attack action.
    const { encounterId, attackerCombatantId, targetCombatantId, version } =
      await makeFreshEncounter('BARB-EA-T1', { attackerCharId: barb4CharId });

    const { statusCode } = await doAttack(
      encounterId,
      attackerCombatantId,
      targetCombatantId,
      longswordBarb4InstanceId,
      version,
    );
    // Budget consumed regardless of hit/miss (REQ-BARB-EA-03: pre-roll, outcome-independent).
    expect(statusCode).toBe(200);
  });

  // ── BARB-EA-T2 — Barbarian L4 second attack → 400 ACTION_ALREADY_USED ─────────

  it('BARB-EA-T2: barbarian L4 second attack → 400 ACTION_ALREADY_USED (PHB p.49)', async () => {
    // L4 barbarian: after 1 attack, action_used=true, attacks_remaining=0 → reject.
    // REQ-BARB-EA-01: level gate not met — exactly 1 attack allowed.
    const { encounterId, attackerCombatantId, targetCombatantId, version } =
      await makeFreshEncounter('BARB-EA-T2', { attackerCharId: barb4CharId });

    // First attack: consume the action.
    const first = await doAttack(
      encounterId,
      attackerCombatantId,
      targetCombatantId,
      longswordBarb4InstanceId,
      version,
    );
    expect(first.statusCode).toBe(200);

    // Second attack: action already spent → 400 ACTION_ALREADY_USED.
    const v2 = await getVersion(encounterId);
    const second = await doAttack(
      encounterId,
      attackerCombatantId,
      targetCombatantId,
      longswordBarb4InstanceId,
      v2,
    );
    expect(second.statusCode).toBe(400);
    const issues = second.body['issues'] as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'ACTION_ALREADY_USED')).toBe(true);
  });

  // ── BARB-EA-T3 — Barbarian L5 two attacks succeed ─────────────────────────────

  it('BARB-EA-T3: barbarian L5 first attack → 200; second attack → 200 (Extra Attack, PHB p.49)', async () => {
    // PHB p.49: "Beginning at 5th level, you can attack twice, instead of once."
    // First attack sets action_used=true, attacks_remaining=1 (barb-5 → totalAttacks=2 → 2-1=1).
    // Second attack decrements attacks_remaining: 1 → 0. Both return 200.
    // REQ-BARB-EA-02: L5 qualifies for Extra Attack.
    // REQ-BARB-EA-03: budget key off statusCode (pre-roll, outcome-independent).
    const { encounterId, attackerCombatantId, targetCombatantId, version } =
      await makeFreshEncounter('BARB-EA-T3', {
        attackerCharId: barb5CharId,
        targetHp: 200,
        targetAc: 1,
      });

    // First attack: action consumed, budget sets attacks_remaining=1.
    const first = await doAttack(
      encounterId,
      attackerCombatantId,
      targetCombatantId,
      longswordBarb5InstanceId,
      version,
    );
    expect(first.statusCode).toBe(200);

    // Second attack: continuation allowed (attacks_remaining 1→0).
    const v2 = await getVersion(encounterId);
    const second = await doAttack(
      encounterId,
      attackerCombatantId,
      targetCombatantId,
      longswordBarb5InstanceId,
      v2,
    );
    expect(second.statusCode).toBe(200);
  });

  // ── BARB-EA-T4 — Barbarian L5 third attack → 400 ACTION_ALREADY_USED ─────────

  it('BARB-EA-T4: barbarian L5 third attack → 400 ACTION_ALREADY_USED (allowance exhausted, PHB p.49)', async () => {
    // PHB p.49: "attack twice" — exactly 2 attacks. Third is rejected.
    // REQ-BARB-EA-02: after both attacks are consumed, budget is fully spent.
    const { encounterId, attackerCombatantId, targetCombatantId, version } =
      await makeFreshEncounter('BARB-EA-T4', {
        attackerCharId: barb5CharId,
        targetHp: 200,
        targetAc: 1,
      });

    const first = await doAttack(encounterId, attackerCombatantId, targetCombatantId, longswordBarb5InstanceId, version);
    expect(first.statusCode).toBe(200);

    const v2 = await getVersion(encounterId);
    const second = await doAttack(encounterId, attackerCombatantId, targetCombatantId, longswordBarb5InstanceId, v2);
    expect(second.statusCode).toBe(200);

    const v3 = await getVersion(encounterId);
    const third = await doAttack(encounterId, attackerCombatantId, targetCombatantId, longswordBarb5InstanceId, v3);
    expect(third.statusCode).toBe(400);
    const issues = third.body['issues'] as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'ACTION_ALREADY_USED')).toBe(true);
  });

  // ── BARB-EA-T5 — Barbarian L5 both attacks on different NPCs → both 200 ───────

  it('BARB-EA-T5: barbarian L5 attacks different NPCs → both 200 (multi-target legality, PHB p.198)', async () => {
    // PHB p.198: Extra Attack allows attacking multiple different targets.
    // The engine MUST NOT reject a second attack targeting a different targetId.
    // REQ-BARB-EA-04: no same-target constraint on Extra Attack.
    const { encounterId, attackerCombatantId, npcAId, npcBId, version } =
      await makeFreshEncounterTwoTargets('BARB-EA-T5', barb5CharId);

    // First attack: target NPC-A.
    const first = await doAttack(encounterId, attackerCombatantId, npcAId, longswordBarb5InstanceId, version);
    expect(first.statusCode).toBe(200);

    // Second attack: target NPC-B (different target).
    const v2 = await getVersion(encounterId);
    const second = await doAttack(encounterId, attackerCombatantId, npcBId, longswordBarb5InstanceId, v2);
    expect(second.statusCode).toBe(200);
  });

  // ── BARB-EA-T6 — advance-encounter-turn resets barbarian budget ───────────────

  it('BARB-EA-T6: advance-turn resets barbarian budget → first attack of new turn is 200 (PHB p.49)', async () => {
    // PHB p.49: Extra Attack budget regained at the start of your next turn.
    // REQ-BARB-EA-05: advance-encounter-turn resets action_used=false, attacks_remaining=0.
    const { encounterId, attackerCombatantId, targetCombatantId, version } =
      await makeFreshEncounter('BARB-EA-T6', {
        attackerCharId: barb5CharId,
        targetHp: 200,
        targetAc: 1,
      });

    // Exhaust both attacks on the first turn.
    const first = await doAttack(encounterId, attackerCombatantId, targetCombatantId, longswordBarb5InstanceId, version);
    expect(first.statusCode).toBe(200);

    const v2 = await getVersion(encounterId);
    const second = await doAttack(encounterId, attackerCombatantId, targetCombatantId, longswordBarb5InstanceId, v2);
    expect(second.statusCode).toBe(200);

    // Third attack (this turn): rejected.
    const v3 = await getVersion(encounterId);
    const third = await doAttack(encounterId, attackerCombatantId, targetCombatantId, longswordBarb5InstanceId, v3);
    expect(third.statusCode).toBe(400);

    // Advance turn to NPC (initiative=5). NPC becomes current.
    const v4 = await getVersion(encounterId);
    await advanceTurn(encounterId, v4);

    // Advance again — barbarian becomes current (budget reset on turn start).
    const v5 = await getVersion(encounterId);
    await advanceTurn(encounterId, v5);

    // First attack of the new turn: budget is reset → should be 200.
    const v6 = await getVersion(encounterId);
    const afterReset = await doAttack(
      encounterId,
      attackerCombatantId,
      targetCombatantId,
      longswordBarb5InstanceId,
      v6,
    );
    expect(afterReset.statusCode).toBe(200);
  });

  // ── BARB-EA-T7 — Raging barbarian L5: rage bonus on confirmed hit ────────────

  it('BARB-EA-T7: raging barbarian L5 confirmed hit — damage includes rage bonus (PHB p.48)', async () => {
    // PHB p.48: "While raging… you gain a bonus to the damage roll that you can
    // apply to any melee weapon attack using Strength." Rage damage bonus at L1-8 = +2.
    // REQ-BARB-EA-06: per-attack rage bonus — both attacks in Extra Attack get it.
    //
    // RNG discipline (CLAUDE.md §5): use while(!hit) with a FRESH encounter per attempt
    // at ac=1 to obtain a confirmed hit. NEVER assert `crit` on a miss body (REQ-HYGIENE-03).
    await resetRageUsed(barb5CharId);

    let hit = false;
    let attackRes: { statusCode: number; body: Record<string, unknown> } = { statusCode: 0, body: {} };

    while (!hit) {
      const { encounterId, attackerCombatantId, targetCombatantId, version } =
        await makeFreshEncounter('BARB-EA-T7', {
          attackerCharId: barb5CharId,
          targetAc: 1, // AC=1 → only nat-1 misses
          targetHp: 200,
        });

      // Reset rage uses to allow activation.
      await resetRageUsed(barb5CharId);

      // Activate rage (bonus action) BEFORE the attack.
      // PHB p.48: "On your turn, you can enter a rage as a bonus action."
      const rageRes = await doActivateRage(encounterId, attackerCombatantId, version);
      expect(rageRes.statusCode).toBe(200);

      const v2 = await getVersion(encounterId);

      // Attack while raging (longsword = melee STR → rage bonus applies).
      attackRes = await doAttack(
        encounterId,
        attackerCombatantId,
        targetCombatantId,
        longswordBarb5InstanceId,
        v2,
      );
      expect(attackRes.statusCode).toBe(200);

      if (attackRes.body['hit'] === true) {
        hit = true;
      }
    }

    // Confirmed hit — assert rage bonus in perDie breakdown.
    // PHB p.48 tier 1 (L1-8): +2 rage bonus. STR 15 → mod +2.
    // Longsword: 1d8 + STR(+2) + rage(+2). perDie should include 'Raging' entry with flat=2.
    // REQ-HYGIENE-03: NEVER assert `crit` on a miss body. Only asserting hit-path fields.
    const perDie = attackRes.body['perDie'] as Array<{ label: string; flat?: number; rolls?: number[] }> | undefined;
    expect(perDie).toBeDefined();

    const rageSource = perDie?.find((e) => e.label === 'Raging' && e.flat === 2);
    expect(
      rageSource,
      `Expected 'Raging' perDie entry with flat=2 (PHB p.48 L1-8 rage bonus). Got perDie=${JSON.stringify(perDie)}`,
    ).toBeDefined();
  });
});

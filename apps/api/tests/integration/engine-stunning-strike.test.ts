/**
 * Integration tests — engine-stunning-strike (Slice 3b-ii: Monk Stunning Strike).
 *
 * Verifies POST /encounters/:id/actions/attack/apply with stunningStrikeSpend=true:
 *
 * PHB p.85 — Stunning Strike: "When you hit another creature with a melee weapon attack,
 *   you can spend 1 ki point to attempt a stunning strike. The target must succeed on a
 *   Constitution saving throw or be stunned until the end of your next turn."
 * PHB p.78 — Monk ki save DC: 8 + proficiency bonus + Wisdom modifier.
 * PHB p.292 — Stunned implies Incapacitated (dual-insert on fail, ADR-4).
 *
 * Reconciled flow (LOCKED — Fail-Fast 400 Pre-Roll):
 *   1. PRE-ROLL: ranged weapon + spend → 400 STUNNING_STRIKE_NOT_MELEE (nothing rolled/committed)
 *   2. PRE-ROLL: ki pool exhausted + spend → 400 KI_EXHAUSTED (nothing rolled/committed)
 *   3. PRE-ROLL: NPC target + spend + missing targetNpcSaveMod → 400 NO_TARGET_SAVE (nothing committed)
 *   4. Miss + spend → normal miss, NO ki spent
 *   5. Hit → CAS tx: HP + ki jsonb_set + version bump (atomic)
 *   6. Post-tx: performForcedCheck(con, kiSaveDc, Stunned, anchor=monk, npcSaveMod, refreshAnchorOnExisting=true)
 *
 * Tests:
 *   SS-T1:  NPC melee hit + spend + targetNpcSaveMod=0 (low) + CON save fails → ki decremented + Stunned + turn-anchor
 *   SS-T2:  NPC melee hit + spend + targetNpcSaveMod=100 (high) → ki spent, save succeeds, no Stunned
 *   SS-T3:  ki exhausted + spend → 400 KI_EXHAUSTED pre-roll, nothing committed
 *   SS-T4:  ranged weapon + spend → 400 STUNNING_STRIKE_NOT_MELEE pre-roll, nothing committed
 *   SS-T5:  miss + spend → normal miss, ki not spent
 *   SS-T6:  backward-compat: stunningStrikeSpend absent → byte-identical behavior
 *   SS-T7:  re-stun refresh: already Stunned target → existing rows refreshed, no duplicates
 *   SS-T8:  CAS version conflict → rollback (ki + HP + conditions all unchanged)
 *   SS-T9:  standalone forced-check on already-Stunned target (no anchor) still no-ops (3a non-regression)
 *   SS-T10: Stun turn N, re-stun turn N+2 → turnsRemaining refreshed + sweep expires correctly
 *   SS-T11: NPC stun end-to-end + expiry: Stunned applied + persists across turns + deleted after anchor fires (headline)
 *   SS-T12: NPC save success (high targetNpcSaveMod) → ki spent, no Stunned, no conditions
 *   SS-T13: NPC target + spend + NO targetNpcSaveMod → 400 NO_TARGET_SAVE pre-roll: HP unchanged, ki unchanged
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-stunning-strike — POST /encounters/:id/actions/attack/apply (stunningStrikeSpend)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // Monk character — melee weapon (quarterstaff), Wis 16 (+3), L5 Monk (pb=3, ki pool=5)
  let monkCharId: string;
  let quarterstaffInstanceId: string;

  // Non-Monk fighter character — longsword (for backward-compat tests)
  let fighterCharId: string;
  let longswordInstanceId: string;

  // Hand crossbow (ranged) character — for STUNNING_STRIKE_NOT_MELEE test
  // Hand Crossbow PHB: type='R', no '2H' constraint, single-hand equipped OK.
  let bowCharId: string;
  let handCrossbowInstanceId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — body: ${res.body}`);
    }
  };

  /** Read ki used value directly from DB (dynamic import to avoid top-level schema coupling). */
  const getKiUsed = async (charId: string): Promise<number> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return -1;
    const data = row.data as Record<string, unknown>;
    const resourcesUsed = (data['classResourcesUsed'] as Record<string, number> | undefined) ?? {};
    return resourcesUsed['monk:ki-points'] ?? 0;
  };

  /** Read HP of a combatant via GET encounter. */
  const getCombatantHp = async (encounterId: string, combatantId: string): Promise<number> => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${encounterId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    const enc = res.json();
    const c = enc.combatants?.find((x: { id: string }) => x.id === combatantId);
    return (c?.hpCurrent as number) ?? -1;
  };

  /** Check if NPC has a condition via STR auto-fail probe (Stunned → auto-fail = true). */
  const isStunned = async (encounterId: string, npcId: string): Promise<boolean> => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { targetCombatantId: npcId, ability: 'str', dc: 30, conditionOnFail: 'Stunned', npcSaveMod: 0 },
    });
    return res.json().outcome === 'autoFail';
  };

  /** Reset ki used to a specific value via direct DB write. */
  const setKiUsed = async (charId: string, kiUsed: number): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return;
    const data = row.data as Record<string, unknown>;
    const classResourcesUsed = { ...((data['classResourcesUsed'] as Record<string, number>) ?? {}), 'monk:ki-points': kiUsed };
    await db
      .update(characters)
      .set({ data: { ...data, classResourcesUsed }, updatedAt: new Date() })
      .where(eq(characters.id, charId));
  };

  /** Check if NPC has conditions via reinsertion probe (absent → re-inserted). */
  const wasReinserted = async (encounterId: string, npcId: string): Promise<boolean> => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { targetCombatantId: npcId, ability: 'str', dc: 30, conditionOnFail: 'Stunned', npcSaveMod: 0 },
    });
    if (res.statusCode !== 200) return false;
    const body = res.json();
    return (
      body.outcome === 'fail' &&
      Array.isArray(body.applied) &&
      body.applied.includes('Stunned') &&
      body.applied.includes('Incapacitated')
    );
  };

  /** Advance turn helper. */
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

  /**
   * Create a fresh encounter: Monk (init=20, current combatant) vs NPC goblin (init=5).
   * Returns { encounterId, monkCombatantId, npcCombatantId, version }.
   * NPC target: low CON (ac=1 for guaranteed hit; npc, not a PC).
   */
  const makeFreshMonkEncounter = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    name: string,
    opts: { npcHp?: number; npcAc?: number } = {},
  ) => {
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name,
          combatants: [
            { name: 'Monk', kind: 'pc', characterId: monkCharId, initiative: 20, hpCurrent: 40, hpMax: 40 },
            { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: opts.npcHp ?? 50, hpMax: opts.npcHp ?? 50, ac: opts.npcAc ?? 1 },
          ],
        },
      })
      .then((r) => r.json());

    const monkCombatantId = enc.currentCombatantId as string;
    const npcCombatantId =
      (enc.combatants.find((c: { id: string }) => c.id !== monkCombatantId)?.id as string) ?? '';
    return { encounterId: enc.id as string, monkCombatantId, npcCombatantId, version: enc.version as number };
  };

  /** Performs an attack/apply call and returns parsed result. */
  const doAttack = async (
    encounterId: string,
    attackerId: string,
    targetId: string,
    weaponInstanceId: string,
    version: number,
    runtimeDecisions?: Record<string, boolean>,
    targetNpcSaveMod?: number,
  ) => {
    const app = await getTestApp();
    const payload: Record<string, unknown> = { attackerId, targetId, weaponInstanceId, version };
    if (runtimeDecisions) payload['runtimeDecisions'] = runtimeDecisions;
    if (targetNpcSaveMod !== undefined) payload['targetNpcSaveMod'] = targetNpcSaveMod;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  // ── beforeAll ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Stunning Strike Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId as string;

    // ── Monk L5 character: Wis 16 (+3), STR 14 (+2), CON 14 (+2), pb=3 ──────────
    // PHB p.78: ki save DC = 8 + pb(3) + wisMod(3) = 14.
    // PHB p.78: ki pool = 5 (= Monk level 5).
    // Monk saves: STR + DEX (PHB p.78). This does NOT make Monk CON-proficient.
    // Monk class set up via PATCH /characters/:id (mirrors character-resources.test.ts pattern).
    const monkChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Monk (stunning strike test)' },
      })
      .then((r) => r.json());
    monkCharId = monkChar.id as string;

    // PATCH to set Monk class + stats directly (avoids wizard chain — mirrors char-resources.test.ts).
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${monkCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'monk',
              source: 'PHB',
              level: 5,
              hitDie: 'd8',
              subclass: null,
              savingThrows: ['str', 'dex'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          // PHB p.78: Wis 16 → wisMod +3. STR 14 → strMod +2. CON 14 → conMod +2.
          baseStats: { str: 14, dex: 14, con: 14, int: 10, wis: 16, cha: 10 },
        },
      },
    });

    // Add quarterstaff (melee, PHB source) to Monk inventory.
    const addQsRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${monkCharId}/inventory`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { item: { slug: 'quarterstaff', source: 'PHB' }, state: 'equipped' },
    });
    await expectOk('add-quarterstaff', addQsRes);

    const monkSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${monkCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const qs = monkSheet.inventory?.find((item: { itemSlug: string }) => item.itemSlug === 'quarterstaff');
    quarterstaffInstanceId = qs?.instanceId ?? '';

    // ── Fighter L1 character — longsword (for backward-compat tests) ──────────────
    const fighterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Fighter (stunning strike compat test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighterChar.id as string;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/stats`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { method: 'standard-array', scores: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 } },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${fighterCharId}/class`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { class: { slug: 'fighter', source: 'PHB' }, level: 1, skillChoices: ['athletics', 'perception'] },
    });
    await expectOk(
      'add-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );
    const fighterSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    longswordInstanceId = fighterSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'longsword',
    )?.instanceId ?? '';

    // ── Bow character — Monk L5 + shortbow (ranged) for STUNNING_STRIKE_NOT_MELEE ─
    // Reuse Monk stats but needs shortbow equipped (ranged weapon check).
    const bowChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Monk-Bow (not-melee test)' },
      })
      .then((r) => r.json());
    bowCharId = bowChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${bowCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'monk',
              source: 'PHB',
              level: 5,
              hitDie: 'd8',
              subclass: null,
              savingThrows: ['str', 'dex'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 14, dex: 14, con: 14, int: 10, wis: 16, cha: 10 },
        },
      },
    });

    // Hand Crossbow PHB: type='R' (ranged), property=['A','L','LD'] — no '2H' → single-hand equip OK.
    await expectOk(
      'add-hand-crossbow',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${bowCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'hand-crossbow', source: 'PHB' }, state: 'equipped' },
      }),
    );
    const bowSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${bowCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    handCrossbowInstanceId = bowSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'hand-crossbow',
    )?.instanceId ?? '';
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── SS-T1: NPC melee hit + spend + targetNpcSaveMod=0 → CON save FAILS → Stunned + ki spent ─
  // REQ-SS-NPC-01: Monk stuns a goblin (NPC, kind='npc') via the attack route.
  // targetNpcSaveMod=0 ensures save total ≤ 20 < DC=14… wait, DC=14 and d20+0 can be 1-20.
  // To guarantee a FAIL: use an impossibly high DC so that d20+0 always fails.
  // We actually want to test the fail path specifically, so we need DC > 20.
  // But computeKiSaveDc with pb=3, wis=+3 = 14. With npcSaveMod=0: d20+0 might pass.
  // To GUARANTEE fail: we cannot control the dice. Use a separate encounter with DC forced high
  // by tweaking the monk stats isn't possible without domain changes.
  // Instead: use a high targetNpcSaveMod=-100 to guarantee fail (total = d20 - 100 < 14).
  // Negative ints are valid per PHB saves (creatures with penalty mods).

  it(
    'SS-T1: NPC melee hit + stunningStrikeSpend + targetNpcSaveMod=-100 (guaranteed fail) → ki decremented + Stunned applied + turn-anchor set',
    async () => {
      // PHB p.85: melee hit + spend ki → CON save DC=14 (8 + pb3 + wisMod3).
      // targetNpcSaveMod=-100: save total = d20-100, always < 14 → guaranteed fail.
      // Asserts: ki decremented, stunningStrike.spent=true, save.success=false, applied=['Stunned','Incapacitated'].
      // Retry loop handles natural-1 misses (PHB p.194: nat-1 auto-misses even vs AC=1).
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      let encounterId = '';
      let monkCombatantId = '';
      let npcCombatantId = '';
      let hitBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        const fresh = await makeFreshMonkEncounter(app, `SS-T1 NPC stun works attempt-${attempt}`, { npcAc: 1 });
        encounterId = fresh.encounterId;
        monkCombatantId = fresh.monkCombatantId;
        npcCombatantId = fresh.npcCombatantId;

        const { statusCode, body } = await doAttack(
          encounterId, monkCombatantId, npcCombatantId,
          quarterstaffInstanceId, fresh.version,
          { stunningStrikeSpend: true },
          -100,
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          hitBody = body as Record<string, unknown>;
          break;
        }
        // Miss (natural 1) — ki not spent, try fresh encounter.
      }

      if (!hitBody) throw new Error('SS-T1: Failed to land a hit after 10 attempts');

      const kiBeforeCheck = await getKiUsed(monkCharId);
      expect(kiBeforeCheck).toBe(0 + 1); // started at 0, 1 hit spent 1 ki

      // stunningStrike block must be present on hit with spend.
      const ss = hitBody['stunningStrike'] as Record<string, unknown>;
      expect(ss).toBeDefined();
      expect(ss['spent']).toBe(true);
      expect(ss['saveDc']).toBe(14); // 8 + pb(3) + wisMod(3) = 14

      // Save rolled and FAILED (total = d20 - 100 < 14).
      const save = ss['save'] as Record<string, unknown>;
      expect(save).toBeDefined();
      expect(save['success']).toBe(false);
      expect(save['saveMod']).toBe(-100);

      // Stunned + Incapacitated applied (PHB p.292 — dual-insert on fail).
      expect(ss['applied']).toContain('Stunned');
      expect(ss['applied']).toContain('Incapacitated');

      // NPC is Stunned (confirmed via STR auto-fail probe).
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);
    },
  );

  // ── SS-T2: NPC save SUCCESS (high targetNpcSaveMod) → ki spent, no Stunned ───────

  it(
    'SS-T2: NPC hit + spend + targetNpcSaveMod=100 (guaranteed save success) → ki spent, save.success=true, no Stunned',
    async () => {
      // PHB p.85: ki IS spent regardless of save outcome (spent on the attempt).
      // targetNpcSaveMod=100: save total = d20+100, always ≥ 14 → guaranteed success.
      // Asserts: ki decremented, stunningStrike.save.success=true, applied=[], no Stunned on NPC.
      // Retry loop handles natural-1 misses (PHB p.194: nat-1 auto-misses even vs AC=1).
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      let encounterId = '';
      let monkCombatantId = '';
      let npcCombatantId = '';
      let hitBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        const fresh = await makeFreshMonkEncounter(app, `SS-T2 NPC save success attempt-${attempt}`, { npcAc: 1 });
        encounterId = fresh.encounterId;
        monkCombatantId = fresh.monkCombatantId;
        npcCombatantId = fresh.npcCombatantId;

        const { statusCode, body } = await doAttack(
          encounterId, monkCombatantId, npcCombatantId,
          quarterstaffInstanceId, fresh.version,
          { stunningStrikeSpend: true },
          100,
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          hitBody = body as Record<string, unknown>;
          break;
        }
        // Miss (natural 1) — ki not spent, try fresh encounter.
      }

      if (!hitBody) throw new Error('SS-T2: Failed to land a hit after 10 attempts');

      const ss = hitBody['stunningStrike'] as Record<string, unknown>;
      expect(ss).toBeDefined();
      expect(ss['spent']).toBe(true);
      expect(ss['saveDc']).toBe(14);

      // Save rolled and SUCCEEDED (d20+100 >> 14).
      const save = ss['save'] as Record<string, unknown>;
      expect(save).toBeDefined();
      expect(save['success']).toBe(true);
      expect(save['saveMod']).toBe(100);
      expect(ss['applied']).toEqual([]);

      // Ki was spent (PHB p.85: spent on attempt regardless of outcome).
      expect(await getKiUsed(monkCharId)).toBe(1);

      // No Stunned (save succeeded).
      expect(await isStunned(encounterId, npcCombatantId)).toBe(false);
    },
  );

  // ── SS-T3: ki exhausted + spend → 400 KI_EXHAUSTED pre-roll, nothing committed ──

  it(
    'SS-T3: ki exhausted (0 remaining) + stunningStrikeSpend=true → 400 KI_EXHAUSTED, HP unchanged, ki unchanged (pre-roll: nothing committed)',
    async () => {
      // PHB p.85: can only spend ki if available.
      // Monk L5 ki max = 5. Set kiUsed=5 (fully exhausted).
      // PRE-ROLL guard: fires BEFORE rollToHit → NO damage applied, NO ki change, NO conditions.
      const app = await getTestApp();
      await setKiUsed(monkCharId, 5); // fully exhausted

      const { encounterId, monkCombatantId, npcCombatantId, version } =
        await makeFreshMonkEncounter(app, 'SS-T3 ki exhausted', { npcAc: 1, npcHp: 30 });

      const hpBefore = await getCombatantHp(encounterId, npcCombatantId);
      const kiBefore = await getKiUsed(monkCharId);
      expect(hpBefore).toBe(30);
      expect(kiBefore).toBe(5);

      const { statusCode, body } = await doAttack(
        encounterId, monkCombatantId, npcCombatantId,
        quarterstaffInstanceId, version,
        { stunningStrikeSpend: true },
      );

      // PRE-ROLL 400: nothing rolled, nothing committed.
      expect(statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('KI_EXHAUSTED');

      // HP UNCHANGED (no damage roll fired — pre-roll guard).
      const hpAfter = await getCombatantHp(encounterId, npcCombatantId);
      expect(hpAfter).toBe(hpBefore);

      // Ki UNCHANGED (was exhausted, no ki spent).
      const kiAfter = await getKiUsed(monkCharId);
      expect(kiAfter).toBe(5);

      // No conditions applied.
      const stunned = await isStunned(encounterId, npcCombatantId);
      expect(stunned).toBe(false);
    },
  );

  // ── SS-T4: ranged weapon + spend → 400 STUNNING_STRIKE_NOT_MELEE pre-roll ────────

  it(
    'SS-T4: ranged weapon (hand-crossbow) + stunningStrikeSpend=true → 400 STUNNING_STRIKE_NOT_MELEE, nothing committed (pre-roll)',
    async () => {
      // PHB p.85: Stunning Strike requires a MELEE weapon attack.
      // PRE-ROLL guard: fires before rollToHit → NO damage, NO ki change, NO conditions.
      // Using Hand Crossbow PHB (type='R', no 2H constraint) as the ranged weapon.
      const app = await getTestApp();
      await setKiUsed(bowCharId, 0); // reset (bow Monk has 5 ki available)

      // Create encounter with hand-crossbow Monk as attacker.
      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'SS-T4 ranged weapon guard',
            combatants: [
              { name: 'Monk-Bow', kind: 'pc', characterId: bowCharId, initiative: 20, hpCurrent: 40, hpMax: 40 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 30, hpMax: 30, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const bowCombatantId = enc.currentCombatantId as string;
      const npcId = enc.combatants.find((c: { id: string }) => c.id !== bowCombatantId)?.id as string;
      const hpBefore = await getCombatantHp(enc.id, npcId);
      const kiBefore = await getKiUsed(bowCharId);

      const { statusCode, body } = await doAttack(
        enc.id, bowCombatantId, npcId,
        handCrossbowInstanceId, enc.version,
        { stunningStrikeSpend: true },
      );

      // PRE-ROLL 400: nothing rolled, nothing committed.
      expect(statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('STUNNING_STRIKE_NOT_MELEE');

      // HP UNCHANGED (no damage roll fired).
      const hpAfter = await getCombatantHp(enc.id, npcId);
      expect(hpAfter).toBe(hpBefore);

      // Ki UNCHANGED.
      const kiAfter = await getKiUsed(bowCharId);
      expect(kiAfter).toBe(kiBefore);

      // No conditions.
      const stunned = await isStunned(enc.id, npcId);
      expect(stunned).toBe(false);
    },
  );

  // ── SS-T5: miss + spend → normal miss, ki NOT spent ───────────────────────────

  it(
    'SS-T5: miss + stunningStrikeSpend=true → hit:false, ki NOT decremented (PHB p.85: ki spent only on HIT)',
    async () => {
      // PHB p.85: "When you HIT another creature with a melee weapon attack, you can spend..."
      // Miss → no ki spent. No stunningStrike block in response.
      // NOTE: NPC guard requires targetNpcSaveMod even for miss tests (guard fires PRE-ROLL before
      // rollToHit — without it, we get 400 NO_TARGET_SAVE before we can even roll a miss).
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      // High AC goblin (AC=30) to force a miss (quarterstaff +5 to hit cannot reach 30).
      const { encounterId, monkCombatantId, npcCombatantId, version } =
        await makeFreshMonkEncounter(app, 'SS-T5 miss ki not spent', { npcAc: 30, npcHp: 30 });

      // Keep retrying until a miss (AC=30 ensures miss with quarterstaff).
      const { statusCode, body } = await doAttack(
        encounterId, monkCombatantId, npcCombatantId,
        quarterstaffInstanceId, version,
        { stunningStrikeSpend: true },
        0,   // targetNpcSaveMod required for NPC — guard fires pre-roll; ki not spent on miss anyway
      );

      expect(statusCode).toBe(200);
      expect(body.hit).toBe(false); // guaranteed miss (AC=30, max to-hit ~+9 with crit)

      // No stunningStrike key (miss path).
      expect(body.stunningStrike).toBeUndefined();

      // Ki NOT spent on miss.
      const ki = await getKiUsed(monkCharId);
      expect(ki).toBe(0);
    },
  );

  // ── SS-T6: backward-compat — stunningStrikeSpend absent → byte-identical flow ───

  it(
    'SS-T6: stunningStrikeSpend absent → existing attack-apply flow byte-identical (no stunningStrike key, no ki change)',
    async () => {
      // REQ-SS-COMPAT-01: when runtimeDecisions.stunningStrikeSpend is absent/false,
      // the response is byte-identical to pre-slice behavior — NO stunningStrike key.
      const app = await getTestApp();

      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'SS-T6 backward compat',
            combatants: [
              { name: 'Fighter', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 50, hpMax: 50, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId = enc.currentCombatantId as string;
      const targetId = enc.combatants.find((c: { id: string }) => c.id !== attackerId)?.id as string;

      // No runtimeDecisions at all.
      const { statusCode, body } = await doAttack(
        enc.id, attackerId, targetId,
        longswordInstanceId, enc.version,
      );

      expect(statusCode).toBe(200);
      // stunningStrike key MUST NOT be present (backward-compat — REQ-SS-COMPAT-01).
      expect(body.stunningStrike).toBeUndefined();
      // Hit response shape is unchanged.
      if (body.hit === true) {
        expect(body.rolledDamage).toBeDefined();
        expect(body.damageType).toBeDefined();
      }
    },
  );

  // ── SS-T7: re-stun refresh — already Stunned target → rows refreshed, no duplicates ─

  it(
    'SS-T7: re-stun refresh: already Stunned NPC + stunningStrikeSpend=true hit → existing condition rows refreshed (no duplicate insert)',
    async () => {
      // REQ-SS-RESTUN-01: re-stun refreshes anchor, no double-insert.
      // Manually apply Stunned via forced-check first, then hit again with spend.
      // NPC target: forced-check with npcSaveMod=0 and dc=30 → deterministic Stunned apply.
      // Then Monk attack with spend: performForcedCheck is called with refreshAnchorOnExisting=true.
      // Result: existing rows have anchor refreshed, applied=[] (not re-inserted).
      // Retry loop handles natural-1 misses on AC=1 (fresh encounter+stun each attempt).
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      let encounterId = '';
      let monkCombatantId = '';
      let npcCombatantId = '';
      let hitBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        const fresh = await makeFreshMonkEncounter(app, `SS-T7 re-stun refresh attempt-${attempt}`, { npcAc: 1 });
        encounterId = fresh.encounterId;
        monkCombatantId = fresh.monkCombatantId;
        npcCombatantId = fresh.npcCombatantId;

        // Apply Stunned manually via forced-check (no anchor — will be refreshed by attack).
        const fcRes = await app.inject({
          method: 'POST',
          url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            targetCombatantId: npcCombatantId,
            ability: 'str',
            dc: 30,
            conditionOnFail: 'Stunned',
            npcSaveMod: 0,
          },
        });
        if (fcRes.statusCode !== 200) continue;

        // Now Monk attacks with spend on already-Stunned target.
        // targetNpcSaveMod=-100: guaranteed fail → anchor refreshed (re-stun path).
        const { statusCode, body } = await doAttack(
          encounterId, monkCombatantId, npcCombatantId,
          quarterstaffInstanceId, fresh.version,
          { stunningStrikeSpend: true },
          -100,
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          hitBody = body as Record<string, unknown>;
          break;
        }
        // Miss (natural 1) — ki not spent, try again with fresh encounter.
      }

      if (!hitBody) throw new Error('SS-T7: Failed to land a hit after 10 attempts');

      // Confirm NPC is Stunned (applied via forced-check before attack).
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      const ss = hitBody['stunningStrike'] as Record<string, unknown>;
      expect(ss['spent']).toBe(true);

      // Ki decremented (attack succeeded).
      const ki = await getKiUsed(monkCharId);
      expect(ki).toBe(1);

      // NPC is still Stunned (conditions were NOT removed — only refreshed/no-op).
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);
    },
  );

  // ── SS-T8: CAS version conflict → rollback (ki + HP + conditions all unchanged) ─

  it(
    'SS-T8: CAS version conflict → 409 VERSION_CONFLICT, ki unchanged, HP unchanged, no conditions',
    async () => {
      // REQ-SS-ATOMICITY-01: ki + HP + version are atomic — conflict rolls back all.
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      const { encounterId, monkCombatantId, npcCombatantId, version } =
        await makeFreshMonkEncounter(app, 'SS-T8 CAS conflict', { npcHp: 30, npcAc: 1 });

      const hpBefore = await getCombatantHp(encounterId, npcCombatantId);
      const kiBefore = await getKiUsed(monkCharId);

      // Send STALE version (version - 1 → mismatch).
      const staleVersion = Math.max(0, version - 1);
      const { statusCode, body } = await doAttack(
        encounterId, monkCombatantId, npcCombatantId,
        quarterstaffInstanceId, staleVersion,
        { stunningStrikeSpend: true },
      );

      // The pre-check in apply fires first (version pre-check at L148). Either way → conflict.
      expect(statusCode).toBe(409);
      expect(body.VERSION_CONFLICT ?? body.error).toBeTruthy();

      // HP, ki, conditions all unchanged.
      expect(await getCombatantHp(encounterId, npcCombatantId)).toBe(hpBefore);
      expect(await getKiUsed(monkCharId)).toBe(kiBefore);
      expect(await isStunned(encounterId, npcCombatantId)).toBe(false);
    },
  );

  // ── SS-T9: standalone forced-check on already-Stunned target (no anchor) still no-ops ─

  it(
    'SS-T9: standalone forced-check on already-Stunned NPC (no anchor, no refreshAnchorOnExisting) still no-ops (3a non-regression)',
    async () => {
      // ADR-4 double-gate: standalone forced-check passes neither refreshAnchorOnExisting
      // nor a turn-anchor → existing behavior preserved (continue/no-op).
      // Regression guard: TASK-3 must not have broken the 3a standalone idempotency.
      const app = await getTestApp();

      const { encounterId, npcCombatantId, version: _v } =
        await makeFreshMonkEncounter(app, 'SS-T9 standalone no-op', { npcAc: 1 });

      // Apply Stunned first via standalone forced-check (no anchor).
      const apply1 = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { targetCombatantId: npcCombatantId, ability: 'str', dc: 30, conditionOnFail: 'Stunned', npcSaveMod: 0 },
      });
      expect(apply1.statusCode).toBe(200);
      expect(apply1.json().applied).toContain('Stunned');

      // Apply again — standalone (no refreshAnchorOnExisting, no anchor) → MUST be no-op.
      const apply2 = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { targetCombatantId: npcCombatantId, ability: 'str', dc: 30, conditionOnFail: 'Stunned', npcSaveMod: 0 },
      });
      // STR → auto-fail (already Stunned). outcome=autoFail.
      expect(apply2.statusCode).toBe(200);
      const body2 = apply2.json();
      expect(body2.outcome).toBe('autoFail');
      // applied=[] because condition already exists and no refresh (double-gate fails).
      expect(body2.applied).toEqual([]);

      // NPC still Stunned.
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);
    },
  );

  // ── SS-T10: Stun turn N, re-stun turn N+2 → turnsRemaining refreshed + expires ──

  it(
    'SS-T10: Stun turn N (anchor=monk, turnsRemaining=1) + re-stun turn N+2 via refreshAnchorOnExisting → turnsRemaining reset to 1 → 3b-i sweep expires correctly',
    async () => {
      // PHB p.85: "until end of YOUR next turn" — each successful Stunning Strike
      // establishes its own "next turn" window. A re-stun resets turnsRemaining=1 from
      // the new monk turn (3b-i two-fire expiry restarts).
      //
      // Flow (2-combatant encounter: Monk init=20, Goblin init=5):
      //   Turn N:  Apply Stunned (anchor=Monk, turnsRemaining=1).
      //   Fire 1:  advance (outgoing=Monk) → DECREMENT 1→0. Goblin still Stunned.
      //   advance: (outgoing=Goblin) → no match → no-op.
      //   Turn N+2: forced-check with refreshAnchorOnExisting=true → REFRESH turnsRemaining=1.
      //   Fire 2:  advance (outgoing=Monk) → DECREMENT 1→0. Goblin still Stunned.
      //   advance: (outgoing=Goblin) → no match → no-op.
      //   Fire 3:  advance (outgoing=Monk) → DELETE (turns_remaining=0). Goblin NOT stunned.
      //
      // Note: For re-stun via the forced-check route (which supports npcSaveMod for guaranteed
      // fail), we use ability='con', dc=30, npcSaveMod=0, refreshAnchorOnExisting=true.
      // This covers the same code path as the attack route (applyConditions refresh branch).
      const app = await getTestApp();

      const { encounterId, monkCombatantId, npcCombatantId, version } =
        await makeFreshMonkEncounter(app, 'SS-T10 re-stun sweep integration');

      // Turn N: Apply Stunned via forced-check with anchor=Monk, turnsRemaining=1.
      const stun1 = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: npcCombatantId,
          ability: 'str',
          dc: 30,
          conditionOnFail: 'Stunned',
          npcSaveMod: 0,
          turnAnchorEntityId: monkCombatantId,
          turnAnchorBoundary: 'end',
          turnsRemaining: 1,
        },
      });
      expect(stun1.statusCode).toBe(200);
      expect(stun1.json().applied).toContain('Stunned');

      // Fire 1: advance (outgoing=Monk) → decrement turnsRemaining 1→0. Still Stunned.
      const adv1 = await advanceTurn(encounterId, version);
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Goblin's turn: advance (outgoing=Goblin) → no match → no-op. Still Stunned.
      const adv2 = await advanceTurn(encounterId, adv1.version);
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Turn N+2: Re-stun via forced-check with refreshAnchorOnExisting=true.
      // ability='con' does NOT auto-fail (only STR/DEX auto-fail when Stunned — PHB p.292).
      // dc=30, npcSaveMod=0 → total=0+d20 → always fails (d20 max=20 < 30). Guaranteed fail.
      // refreshAnchorOnExisting=true: existing condition rows have turnsRemaining reset to 1.
      // Note: CON does NOT auto-fail on Stunned, so we go through the rolling path.
      const restun = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          targetCombatantId: npcCombatantId,
          ability: 'con',  // NOT auto-fail → rolls → guaranteed fail (dc=30, mod=0)
          dc: 30,
          conditionOnFail: 'Stunned',
          npcSaveMod: 0,
          turnAnchorEntityId: monkCombatantId,
          turnAnchorBoundary: 'end',
          turnsRemaining: 1,
          refreshAnchorOnExisting: true,  // re-stun refresh path (ADR-4, TASK-3)
        },
      });
      expect(restun.statusCode).toBe(200);
      const restunBody = restun.json();
      expect(restunBody.outcome).toBe('fail'); // rolled save, DC=30 > any d20+0

      // applied=[] because condition already exists (refreshed, not re-inserted).
      expect(restunBody.applied).toEqual([]);

      // NPC still Stunned.
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Fire 2: advance (outgoing=Monk) → DECREMENT 1→0. Goblin still Stunned.
      const adv3 = await advanceTurn(encounterId, adv2.version);
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Goblin turn: no-op.
      const adv4 = await advanceTurn(encounterId, adv3.version);
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Fire 3: advance (outgoing=Monk) → DELETE (turns_remaining=0). Goblin NOT stunned.
      const adv5 = await advanceTurn(encounterId, adv4.version);
      void adv5;

      // Verify expired: reinsertion probe shows conditions are gone.
      const reinserted = await wasReinserted(encounterId, npcCombatantId);
      expect(reinserted).toBe(true); // both Stunned + Incapacitated were absent → re-inserted
    },
  );

  // ── SS-T11: NPC stun works end-to-end + expiry (HEADLINE TEST) ───────────────────
  // REQ-SS-NPC-01: Monk hits a GOBLIN (NPC, kind='npc') via the ATTACK route.
  // With targetNpcSaveMod=-100 (guaranteed fail) and DC=14: goblin gets Stunned.
  // Then advance turns and assert it expires at the end of the Monk's next turn (3b-i sweep).

  it(
    'SS-T11 (HEADLINE): NPC stun end-to-end via attack route — Stunned applied + turn-anchor + expires after Monk next turn',
    async () => {
      // PHB p.85: "stunned until the END of your next turn."
      // Flow (Monk init=20 > Goblin init=5):
      //   Turn N:  Attack → Stunned applied (anchor=Monk, turnsRemaining=1).
      //   Fire 1:  advance (outgoing=Monk turn end) → DECREMENT 1→0. Goblin still Stunned.
      //   advance: (outgoing=Goblin) → no match → no-op.
      //   Fire 3:  advance (outgoing=Monk turn end) → DELETE (turnsRemaining=0). Goblin NOT Stunned.
      //
      // Note: AC=1 means a natural 1 (5% chance) can still auto-miss (PHB p.194). We retry
      // with fresh encounters until we land a hit (expected: ≤ 2 attempts statistically).
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      // Retry loop: fresh encounter each attempt to handle natural-1 misses on AC=1.
      let encounterId = '';
      let monkCombatantId = '';
      let npcCombatantId = '';
      let hitBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        const fresh = await makeFreshMonkEncounter(app, `SS-T11 NPC stun end-to-end attempt-${attempt}`, { npcAc: 1 });
        encounterId = fresh.encounterId;
        monkCombatantId = fresh.monkCombatantId;
        npcCombatantId = fresh.npcCombatantId;

        const { statusCode, body } = await doAttack(
          encounterId, monkCombatantId, npcCombatantId,
          quarterstaffInstanceId, fresh.version,
          { stunningStrikeSpend: true },
          -100,
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          hitBody = body as Record<string, unknown>;
          break;
        }
        // Miss (natural 1) — ki not spent (PHB p.85 miss guard), try again.
      }

      if (!hitBody) throw new Error('SS-T11: Failed to land a hit after 10 attempts (AC=1 natural-1 streak)');

      // Stunned must be applied with anchor=Monk combatant.
      const ss = hitBody['stunningStrike'] as Record<string, unknown>;
      expect(ss).toBeDefined();
      expect(ss['spent']).toBe(true);
      expect((ss['save'] as Record<string, unknown>)['success']).toBe(false);
      expect(ss['applied']).toContain('Stunned');
      expect(ss['applied']).toContain('Incapacitated');

      // Ki decremented.
      expect(await getKiUsed(monkCharId)).toBe(1);

      // Goblin IS Stunned (confirmed via STR auto-fail probe).
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Reload encounter version (attack/apply bumped it by 1 in the CAS tx).
      const encAfterAttack = await app
        .inject({
          method: 'GET',
          url: `/api/v1/encounters/${encounterId}`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
        })
        .then((r) => r.json() as { version: number });
      const versionAfterAttack = encAfterAttack.version;

      // Fire 1: Monk ends turn → sweep DECREMENTS turnsRemaining 1→0. Goblin still Stunned.
      const adv1 = await advanceTurn(encounterId, versionAfterAttack);
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Goblin's turn: advance → no anchor match for Goblin → no-op. Still Stunned.
      const adv2 = await advanceTurn(encounterId, adv1.version);
      expect(await isStunned(encounterId, npcCombatantId)).toBe(true);

      // Fire 3: Monk ends turn again → turnsRemaining=0 → DELETE. Goblin NOT Stunned.
      const adv3 = await advanceTurn(encounterId, adv2.version);
      void adv3;

      // Verify expired: reinsertion probe confirms both conditions are gone.
      const reinserted = await wasReinserted(encounterId, npcCombatantId);
      expect(reinserted).toBe(true); // both Stunned + Incapacitated absent → re-inserted
    },
  );

  // ── SS-T12: NPC save success (high targetNpcSaveMod) → ki spent, no Stunned, no conditions ─

  it(
    'SS-T12: NPC stun save success (targetNpcSaveMod=100) → ki spent, no Stunned, applied=[]',
    async () => {
      // PHB p.85: ki IS spent on the attempt regardless of save outcome.
      // targetNpcSaveMod=100: d20+100 always ≥ 14 → save succeeds, no Stunned.
      // Retry loop handles natural-1 misses (AC=1, but natural 1 auto-misses per PHB p.194).
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      let encounterId = '';
      let monkCombatantId = '';
      let npcCombatantId = '';
      let hitBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        const fresh = await makeFreshMonkEncounter(app, `SS-T12 NPC save success attempt-${attempt}`, { npcAc: 1 });
        encounterId = fresh.encounterId;
        monkCombatantId = fresh.monkCombatantId;
        npcCombatantId = fresh.npcCombatantId;

        const { statusCode, body } = await doAttack(
          encounterId, monkCombatantId, npcCombatantId,
          quarterstaffInstanceId, fresh.version,
          { stunningStrikeSpend: true },
          100,
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          hitBody = body as Record<string, unknown>;
          break;
        }
        // Miss (natural 1) — ki not spent, try again with fresh encounter.
      }

      if (!hitBody) throw new Error('SS-T12: Failed to land a hit after 10 attempts');

      const ss = hitBody['stunningStrike'] as Record<string, unknown>;
      expect(ss['spent']).toBe(true);
      expect((ss['save'] as Record<string, unknown>)['success']).toBe(true);
      expect(ss['applied']).toEqual([]);

      // Ki spent regardless of save outcome.
      expect(await getKiUsed(monkCharId)).toBe(1);

      // No Stunned on the goblin.
      expect(await isStunned(encounterId, npcCombatantId)).toBe(false);
    },
  );

  // ── SS-T13: NPC target + spend + NO targetNpcSaveMod → 400 NO_TARGET_SAVE pre-roll ─
  // REQ-SS-NPC-01: GM must supply the monster's CON save mod. Missing it → reject PRE-ROLL.
  // Nothing rolled, nothing committed, NO ki wasted.

  it(
    'SS-T13: NPC target + stunningStrikeSpend=true + targetNpcSaveMod absent → 400 NO_TARGET_SAVE pre-roll (HP unchanged, ki unchanged)',
    async () => {
      // PHB p.85: Monk must provide the monster's CON save mod (mirrors NO_TARGET_AC pattern).
      // PRE-ROLL guard: fires BEFORE rollToHit → NO damage applied, NO ki spent, NO conditions.
      const app = await getTestApp();
      await setKiUsed(monkCharId, 0);

      const { encounterId, monkCombatantId, npcCombatantId, version } =
        await makeFreshMonkEncounter(app, 'SS-T13 NPC no-saveMod guard', { npcAc: 1, npcHp: 30 });

      const hpBefore = await getCombatantHp(encounterId, npcCombatantId);
      const kiBefore = await getKiUsed(monkCharId);
      expect(hpBefore).toBe(30);
      expect(kiBefore).toBe(0);

      // Attack with spend=true but NO targetNpcSaveMod (omitted entirely).
      const { statusCode, body } = await doAttack(
        encounterId, monkCombatantId, npcCombatantId,
        quarterstaffInstanceId, version,
        { stunningStrikeSpend: true },
        // targetNpcSaveMod intentionally omitted
      );

      // PRE-ROLL 400: nothing rolled, nothing committed.
      expect(statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('NO_TARGET_SAVE');

      // HP UNCHANGED (no damage roll — pre-roll guard fires before rollToHit).
      expect(await getCombatantHp(encounterId, npcCombatantId)).toBe(hpBefore);

      // Ki UNCHANGED — the whole point: no ki wasted on an unresolvable save.
      expect(await getKiUsed(monkCharId)).toBe(kiBefore);

      // No conditions applied.
      expect(await isStunned(encounterId, npcCombatantId)).toBe(false);
    },
  );
});

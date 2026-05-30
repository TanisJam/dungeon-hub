/**
 * Integration tests — engine-divine-smite (Paladin Divine Smite, PHB p.85).
 *
 * Verifies POST /encounters/:id/actions/attack/apply with divineSmiteSpend=true:
 *
 * PHB p.85 — Divine Smite:
 *   "Starting at 2nd level, when you hit a creature with a melee weapon attack,
 *    you can expend one spell slot to deal radiant damage to the target, in
 *    addition to the weapon's damage. The extra damage is 2d8 for a 1st-level
 *    spell slot, plus 1d8 for each spell level higher than 1st, to a maximum of
 *    5d8. The damage increases by 1d8 if the target is an undead or a fiend,
 *    to a maximum of 6d8."
 * PHB p.196 — Crit: "roll all of the attack's damage dice twice."
 *
 * Pre-roll guards (all FAIL-FAST: nothing committed before rollToHit):
 *   1. Non-Paladin or Paladin L1 + divineSmiteSpend → 400 DIVINE_SMITE_NOT_AVAILABLE
 *   2. Ranged weapon + divineSmiteSpend → 400 DIVINE_SMITE_NOT_MELEE
 *   3. No slot at asserted level → 400 DIVINE_SMITE_SLOT_NOT_AVAILABLE
 *   4. divineSmiteSpend=true + slotLevel absent → 400 (Zod refine)
 *
 * Tests:
 *   DS-T1:  Paladin L5 melee hit + slot 2 → slot consumed + 3d8 radiant
 *   DS-T2:  Miss + divineSmiteSpend → no slot consumed
 *   DS-T3:  Ranged weapon + divineSmiteSpend → 400 DIVINE_SMITE_NOT_MELEE, HP+slots unchanged
 *   DS-T4:  No slot at asserted level → 400 DIVINE_SMITE_SLOT_NOT_AVAILABLE, HP+slots unchanged
 *   DS-T5:  Non-Paladin + divineSmiteSpend → 400 DIVINE_SMITE_NOT_AVAILABLE, HP+slots unchanged
 *   DS-T6:  Paladin L1 + divineSmiteSpend → 400 DIVINE_SMITE_NOT_AVAILABLE (feature not yet unlocked)
 *   DS-T7:  Crit + divineSmiteSpend → smite dice doubled (probabilistic retry loop, ≤50 attempts)
 *   DS-T8:  divineSmiteUndead=true → +1d8 (3d8 for slot 1, not 2d8)
 *   DS-T9:  Backward-compat omitted → no divineSmite key, byte-identical
 *   DS-T10: CAS conflict → no slot spent
 *   DS-T11: Schema — divineSmiteSpend=true + slotLevel absent → 400 (Zod refine)
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-divine-smite — POST /encounters/:id/actions/attack/apply (divineSmiteSpend)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // Paladin L5 character — melee weapon (longsword), STR 18 (+4), CON 14, spell slots available
  let paladinCharId: string;
  let longswordInstanceId: string;

  // Paladin L5 + ranged weapon (hand crossbow) — for DIVINE_SMITE_NOT_MELEE test
  let paladinBowCharId: string;
  let handCrossbowInstanceId: string;

  // Non-Paladin fighter — for DIVINE_SMITE_NOT_AVAILABLE test
  let fighterCharId: string;
  let fighterLongswordInstanceId: string;

  // Paladin L1 — for DIVINE_SMITE_NOT_AVAILABLE (level guard) test
  let paladinL1CharId: string;
  let paladinL1LongswordInstanceId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — body: ${res.body}`);
    }
  };

  /** Read spellSlotsUsed from DB (9-tuple, index 0 = level 1). */
  const getSlotsUsed = async (charId: string): Promise<number[]> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return new Array(9).fill(0) as number[];
    const data = row.data as Record<string, unknown>;
    return ((data['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0)) as number[];
  };

  /** Set spellSlotsUsed directly (for test setup/reset). */
  const setSlotsUsed = async (charId: string, slotsUsed: number[]): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return;
    const data = row.data as Record<string, unknown>;
    await db
      .update(characters)
      .set({ data: { ...data, spellSlotsUsed: slotsUsed }, updatedAt: new Date() })
      .where(eq(characters.id, charId));
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

  /**
   * Create a fresh encounter: Paladin (init=20, current combatant) vs NPC goblin (init=5).
   * Returns { encounterId, paladinCombatantId, npcCombatantId, version }.
   * NPC target: low AC (ac=1) for guaranteed hits. Retry loop handles nat-1 auto-miss.
   */
  const makeFreshPaladinEncounter = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    name: string,
    opts: { npcHp?: number; npcAc?: number; paladinCharId?: string } = {},
  ) => {
    const attackerCharId = opts.paladinCharId ?? paladinCharId;
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name,
          combatants: [
            { name: 'Paladin', kind: 'pc', characterId: attackerCharId, initiative: 20, hpCurrent: 44, hpMax: 44 },
            {
              name: 'Goblin',
              kind: 'npc',
              initiative: 5,
              hpCurrent: opts.npcHp ?? 50,
              hpMax: opts.npcHp ?? 50,
              ac: opts.npcAc ?? 1,
            },
          ],
        },
      })
      .then((r) => r.json());

    const paladinCombatantId = enc.currentCombatantId as string;
    const npcCombatantId =
      (enc.combatants.find((c: { id: string }) => c.id !== paladinCombatantId)?.id as string) ?? '';
    return { encounterId: enc.id as string, paladinCombatantId, npcCombatantId, version: enc.version as number };
  };

  /** Performs an attack/apply call with optional divine smite fields. */
  const doSmiteAttack = async (
    encounterId: string,
    attackerId: string,
    targetId: string,
    weaponInstanceId: string,
    version: number,
    opts: {
      runtimeDecisions?: Record<string, boolean>;
      divineSmiteSlotLevel?: number;
      divineSmiteUndead?: boolean;
    } = {},
  ) => {
    const app = await getTestApp();
    const payload: Record<string, unknown> = { attackerId, targetId, weaponInstanceId, version };
    if (opts.runtimeDecisions) payload['runtimeDecisions'] = opts.runtimeDecisions;
    if (opts.divineSmiteSlotLevel !== undefined) payload['divineSmiteSlotLevel'] = opts.divineSmiteSlotLevel;
    if (opts.divineSmiteUndead !== undefined) payload['divineSmiteUndead'] = opts.divineSmiteUndead;
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
        payload: { name: 'Divine Smite Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId as string;

    // ── Paladin L5 character: STR 18 (+4), CON 14, CHA 14, pb=3 ──────────────────
    // PHB p.85: Divine Smite available at level 2+.
    // Paladin L5 half-caster: slotsMax = [4,2,1,0,0,0,0,0,0] (PHB Paladin table p.85).
    // computeSpellSlots(paladin L5) derives this server-side.
    const paladinChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Paladin (divine smite test)' },
      })
      .then((r) => r.json());
    paladinCharId = paladinChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${paladinCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'paladin',
              source: 'PHB',
              level: 5,
              hitDie: 'd10',
              subclass: null,
              savingThrows: ['wis', 'cha'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          // STR 18 → strMod +4. CON 14. CHA 14 → chaMod +2. DEX 10.
          baseStats: { str: 18, dex: 10, con: 14, int: 10, wis: 10, cha: 14 },
          // Start with no slots used.
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });

    // Add longsword (melee) to Paladin inventory.
    await expectOk(
      'add-paladin-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${paladinCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );
    const paladinSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${paladinCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    longswordInstanceId =
      paladinSheet.inventory?.find((item: { itemSlug: string }) => item.itemSlug === 'longsword')?.instanceId ?? '';

    // ── Paladin L5 + hand crossbow (ranged) — for NOT_MELEE test ─────────────────
    const paladinBowChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Paladin-Bow (divine smite not-melee test)' },
      })
      .then((r) => r.json());
    paladinBowCharId = paladinBowChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${paladinBowCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'paladin',
              source: 'PHB',
              level: 5,
              hitDie: 'd10',
              subclass: null,
              savingThrows: ['wis', 'cha'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 18, dex: 10, con: 14, int: 10, wis: 10, cha: 14 },
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });
    await expectOk(
      'add-paladin-hand-crossbow',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${paladinBowCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'hand-crossbow', source: 'PHB' }, state: 'equipped' },
      }),
    );
    const paladinBowSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${paladinBowCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    handCrossbowInstanceId =
      paladinBowSheet.inventory?.find((item: { itemSlug: string }) => item.itemSlug === 'hand-crossbow')?.instanceId ?? '';

    // ── Fighter L1 character — longsword (for DIVINE_SMITE_NOT_AVAILABLE test) ───
    const fighterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Fighter (divine smite not-available test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighterChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${fighterCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'fighter',
              source: 'PHB',
              level: 5,
              hitDie: 'd10',
              subclass: null,
              savingThrows: ['str', 'con'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
        },
      },
    });
    await expectOk(
      'add-fighter-longsword',
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
    fighterLongswordInstanceId =
      fighterSheet.inventory?.find((item: { itemSlug: string }) => item.itemSlug === 'longsword')?.instanceId ?? '';

    // ── Paladin L1 character — longsword (for DIVINE_SMITE_NOT_AVAILABLE level guard) ─
    const paladinL1Char = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Paladin L1 (divine smite level guard test)' },
      })
      .then((r) => r.json());
    paladinL1CharId = paladinL1Char.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${paladinL1CharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'paladin',
              source: 'PHB',
              level: 1,
              hitDie: 'd10',
              subclass: null,
              savingThrows: ['wis', 'cha'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 18, dex: 10, con: 14, int: 10, wis: 10, cha: 14 },
        },
      },
    });
    await expectOk(
      'add-paladin-l1-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${paladinL1CharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );
    const paladinL1Sheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${paladinL1CharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    paladinL1LongswordInstanceId =
      paladinL1Sheet.inventory?.find((item: { itemSlug: string }) => item.itemSlug === 'longsword')?.instanceId ?? '';
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── DS-T1: Paladin L5 melee hit + slot 2 → slot consumed + 3d8 radiant ──────────
  // REQ-DS-HIT-SPEND-01, REQ-DS-DICE-01, REQ-DS-RESPONSE-01.

  it(
    'DS-T1: Paladin L5 melee hit + divineSmiteSpend + slotLevel=2 → slot consumed, 3d8 radiant added, divineSmite block in response',
    async () => {
      // PHB p.85: slot 2 → 3d8 radiant. Paladin L5 has 4 L1 + 2 L2 slots.
      // Retry loop handles nat-1 auto-miss (PHB p.194: nat-1 misses even vs AC=1).
      const app = await getTestApp();
      await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      let encounterId = '';
      let paladinCombatantId = '';
      let npcCombatantId = '';
      let hitBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 20; attempt++) {
        const fresh = await makeFreshPaladinEncounter(app, `DS-T1 hit+smite attempt-${attempt}`, { npcAc: 1 });
        encounterId = fresh.encounterId;
        paladinCombatantId = fresh.paladinCombatantId;
        npcCombatantId = fresh.npcCombatantId;

        const { statusCode, body } = await doSmiteAttack(
          encounterId, paladinCombatantId, npcCombatantId, longswordInstanceId, fresh.version,
          { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 2 },
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          hitBody = body as Record<string, unknown>;
          break;
        }
        // Miss (nat-1) — slot NOT consumed (pre-miss guard). Reset slots and retry.
        await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      }

      if (!hitBody) throw new Error('DS-T1: Failed to land a hit after 20 attempts');

      // divineSmite block must be present on hit+spend.
      const ds = hitBody['divineSmite'] as Record<string, unknown>;
      expect(ds).toBeDefined();
      expect(ds['spent']).toBe(true);
      expect(ds['slotLevel']).toBe(2);
      expect(ds['dice']).toBe('3d8');
      // radiantDamage in range [3..48]: 3d8 normal → max 24; crit → 6d8 → max 48 (PHB p.196).
      // We allow for crit on hit path (crit doubles smite dice automatically — ADR-3).
      expect(ds['radiantDamage']).toBeGreaterThanOrEqual(3);
      expect(ds['radiantDamage']).toBeLessThanOrEqual(48);

      // Slot L2 (index 1) must have been consumed.
      const slotsAfter = await getSlotsUsed(paladinCharId);
      expect(slotsAfter[1]).toBe(1); // L2 slot used

      // NPC HP should have decreased (damage was applied).
      const hpAfter = await getCombatantHp(encounterId, npcCombatantId);
      expect(hpAfter).toBeLessThan(50);
    },
  );

  // ── DS-T2: Miss + divineSmiteSpend → no slot consumed ───────────────────────────
  // REQ-DS-HIT-SPEND-01 (miss case), REQ-DS-COMPAT-01.

  it(
    'DS-T2: miss + divineSmiteSpend=true → hit:false, no slot consumed, no divineSmite key',
    async () => {
      // PHB p.85: "when you HIT a creature ... you can expend one spell slot."
      // Miss → no slot spent. divineSmite key must be absent.
      // High AC (30) → guaranteed miss (Paladin +7 to hit max with nat-20 would not be tested
      // here; we want the non-nat-20 path. AC=30 forces miss for all non-nat-20 rolls).
      const app = await getTestApp();
      await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, paladinCombatantId, npcCombatantId, version } =
        await makeFreshPaladinEncounter(app, 'DS-T2 miss no slot consumed', { npcAc: 30, npcHp: 30 });

      // Keep retrying until a miss (AC=30 makes misses overwhelmingly likely; retry handles the
      // rare nat-20 crit which would hit regardless).
      let missBody: Record<string, unknown> | null = null;
      let currentVersion = version;
      for (let attempt = 0; attempt < 5; attempt++) {
        await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
        // Need to reload version if this is a retry (the encounter version only changes on hit).
        if (attempt > 0) {
          // Reload encounter version.
          const encRes = await app.inject({
            method: 'GET',
            url: `/api/v1/encounters/${encounterId}`,
            headers: { authorization: `Bearer ${gm.accessToken}` },
          });
          currentVersion = (encRes.json() as { version: number }).version;
        }

        const { statusCode, body } = await doSmiteAttack(
          encounterId, paladinCombatantId, npcCombatantId, longswordInstanceId, currentVersion,
          { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 1 },
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === false) {
          missBody = body as Record<string, unknown>;
          break;
        }
        // On a rare nat-20, the attack hits — update version and retry.
        if (statusCode === 200) {
          const encRes = await app.inject({
            method: 'GET',
            url: `/api/v1/encounters/${encounterId}`,
            headers: { authorization: `Bearer ${gm.accessToken}` },
          });
          currentVersion = (encRes.json() as { version: number }).version;
        }
      }

      if (!missBody) throw new Error('DS-T2: Could not get a miss against AC=30 in 5 attempts (extreme outlier)');

      expect(missBody['hit']).toBe(false);
      // divineSmite key MUST be absent on miss.
      expect(missBody['divineSmite']).toBeUndefined();

      // Slot NOT consumed.
      const slotsAfter = await getSlotsUsed(paladinCharId);
      expect(slotsAfter[0]).toBe(0); // L1 slot untouched
    },
  );

  // ── DS-T3: Ranged weapon + divineSmiteSpend → 400 DIVINE_SMITE_NOT_MELEE ──────
  // REQ-DS-PREROLL-MELEE-01.

  it(
    'DS-T3: ranged weapon (hand-crossbow) + divineSmiteSpend=true → 400 DIVINE_SMITE_NOT_MELEE, HP+slots unchanged (pre-roll guard)',
    async () => {
      // PHB p.85: "melee weapon attack" — ranged weapon is rejected PRE-ROLL.
      // Nothing rolled, no slot consumed, no HP changed.
      const app = await getTestApp();
      await setSlotsUsed(paladinBowCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'DS-T3 ranged weapon guard',
            combatants: [
              { name: 'Paladin-Bow', kind: 'pc', characterId: paladinBowCharId, initiative: 20, hpCurrent: 44, hpMax: 44 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 30, hpMax: 30, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const paladinBowCombatantId = enc.currentCombatantId as string;
      const npcId = enc.combatants.find((c: { id: string }) => c.id !== paladinBowCombatantId)?.id as string;

      const hpBefore = await getCombatantHp(enc.id, npcId);
      const slotsBefore = await getSlotsUsed(paladinBowCharId);

      const { statusCode, body } = await doSmiteAttack(
        enc.id, paladinBowCombatantId, npcId, handCrossbowInstanceId, enc.version,
        { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 1 },
      );

      // PRE-ROLL 400: nothing committed.
      expect(statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('DIVINE_SMITE_NOT_MELEE');

      // HP unchanged.
      expect(await getCombatantHp(enc.id, npcId)).toBe(hpBefore);
      // Slots unchanged.
      const slotsAfter = await getSlotsUsed(paladinBowCharId);
      expect(slotsAfter).toEqual(slotsBefore);
    },
  );

  // ── DS-T4: No slot at asserted level → 400 DIVINE_SMITE_SLOT_NOT_AVAILABLE ─────
  // REQ-DS-PREROLL-SLOT-01.

  it(
    'DS-T4: no slot at asserted level (L3 slot exhausted) + divineSmiteSpend=true → 400 DIVINE_SMITE_SLOT_NOT_AVAILABLE, HP+slots unchanged',
    async () => {
      // PHB p.201: slot must exist to expend. Paladin L5 has 1 L3 slot.
      // Seed slotsUsed[2]=1 (L3 exhausted). Assert level 3 → SLOT_NOT_AVAILABLE.
      const app = await getTestApp();
      // L3 slot (index 2) = 1 (used). Paladin L5 max L3 = 1.
      await setSlotsUsed(paladinCharId, [0, 0, 1, 0, 0, 0, 0, 0, 0]);

      const { encounterId, paladinCombatantId, npcCombatantId, version } =
        await makeFreshPaladinEncounter(app, 'DS-T4 slot exhausted guard', { npcHp: 30, npcAc: 1 });

      const hpBefore = await getCombatantHp(encounterId, npcCombatantId);

      const { statusCode, body } = await doSmiteAttack(
        encounterId, paladinCombatantId, npcCombatantId, longswordInstanceId, version,
        { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 3 },
      );

      expect(statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('DIVINE_SMITE_SLOT_NOT_AVAILABLE');

      // HP unchanged.
      expect(await getCombatantHp(encounterId, npcCombatantId)).toBe(hpBefore);
      // L3 slot still at 1 (was exhausted, nothing spent).
      const slotsAfter = await getSlotsUsed(paladinCharId);
      expect(slotsAfter[2]).toBe(1);
    },
  );

  // ── DS-T5: Non-Paladin + divineSmiteSpend → 400 DIVINE_SMITE_NOT_AVAILABLE ──────
  // REQ-DS-PREROLL-CLASS-01.

  it(
    'DS-T5: non-Paladin fighter + divineSmiteSpend=true → 400 DIVINE_SMITE_NOT_AVAILABLE, HP unchanged (pre-roll guard)',
    async () => {
      // PHB p.85: "Starting at 2nd level" (implies Paladin class requirement).
      const app = await getTestApp();

      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'DS-T5 non-paladin guard',
            combatants: [
              { name: 'Fighter', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 50, hpMax: 50 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 30, hpMax: 30, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const fighterCombatantId = enc.currentCombatantId as string;
      const npcId = enc.combatants.find((c: { id: string }) => c.id !== fighterCombatantId)?.id as string;
      const hpBefore = await getCombatantHp(enc.id, npcId);

      const { statusCode, body } = await doSmiteAttack(
        enc.id, fighterCombatantId, npcId, fighterLongswordInstanceId, enc.version,
        { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 1 },
      );

      expect(statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('DIVINE_SMITE_NOT_AVAILABLE');
      expect(await getCombatantHp(enc.id, npcId)).toBe(hpBefore);
    },
  );

  // ── DS-T6: Paladin L1 + divineSmiteSpend → 400 DIVINE_SMITE_NOT_AVAILABLE ───────
  // REQ-DS-PREROLL-CLASS-01 (level guard).

  it(
    'DS-T6: Paladin L1 + divineSmiteSpend=true → 400 DIVINE_SMITE_NOT_AVAILABLE (feature not unlocked — PHB p.85 "Starting at 2nd level")',
    async () => {
      const app = await getTestApp();

      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'DS-T6 paladin L1 guard',
            combatants: [
              { name: 'Paladin-L1', kind: 'pc', characterId: paladinL1CharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 30, hpMax: 30, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const paladinL1CombatantId = enc.currentCombatantId as string;
      const npcId = enc.combatants.find((c: { id: string }) => c.id !== paladinL1CombatantId)?.id as string;
      const hpBefore = await getCombatantHp(enc.id, npcId);

      const { statusCode, body } = await doSmiteAttack(
        enc.id, paladinL1CombatantId, npcId, paladinL1LongswordInstanceId, enc.version,
        { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 1 },
      );

      expect(statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('DIVINE_SMITE_NOT_AVAILABLE');
      expect(await getCombatantHp(enc.id, npcId)).toBe(hpBefore);
    },
  );

  // ── DS-T7: Crit + divineSmiteSpend → smite dice doubled ─────────────────────────
  // REQ-DS-CRIT-01 (PHB p.196: "roll all of the attack's damage dice twice").
  // Probabilistic: uses bounded retry loop (≤50 attempts).
  // P(no crit in N tries) = (19/20)^N. At N=50: ≈7.7% — acceptable for CI.

  it(
    'DS-T7: crit + divineSmiteSpend (slot 1, non-undead → 2d8) → radiantDamage ≥ 2 (4d8 min = 4, doubled by crit)',
    async () => {
      // PHB p.196: crit doubles all damage dice. Source injected BEFORE rollDamageBreakdown
      // so doubling flows automatically (ADR-3). 2d8 on crit → 4d8 → min=4.
      // Note: Cannot force crit deterministically without seeded RNG. Bounded retry loop.
      const app = await getTestApp();
      await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      let critBody: Record<string, unknown> | null = null;

      // Crit can't be forced through the API (RNG is server-side, not injectable — anti-cheat).
      // Loop breaks on the FIRST crit, so the average cost is ~20 attempts (1/0.05); the high
      // cap only bounds the rare tail. P(no crit in 150) = (19/20)^150 ≈ 0.05%.
      for (let attempt = 0; attempt < 150; attempt++) {
        await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
        const fresh = await makeFreshPaladinEncounter(app, `DS-T7 crit attempt-${attempt}`, { npcAc: 1 });

        const { statusCode, body } = await doSmiteAttack(
          fresh.encounterId, fresh.paladinCombatantId, fresh.npcCombatantId, longswordInstanceId, fresh.version,
          { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 1 },
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          const b = body as Record<string, unknown>;
          if (b['crit'] === true) {
            critBody = b;
            break;
          }
          // Hit but not crit — loop for fresh encounter.
        }
        // Miss or non-crit hit — try again.
      }

      // Fail EXPLICITLY on no-crit — never silently pass without running the assertions.
      expect(
        critBody,
        'DS-T7: no crit observed in 150 attempts (~0.05% chance) — rerun, or seed RNG if this recurs',
      ).not.toBeNull();

      // On crit, slot 1 (2d8 base) doubles to 4d8 (PHB p.196). Floor = 4 (4×1) — a non-doubled
      // 2d8 floors at 2, so asserting ≥ 4 matches the doubled-dice distribution.
      const ds = critBody!['divineSmite'] as Record<string, unknown>;
      expect(ds).toBeDefined();
      expect(ds['spent']).toBe(true);
      expect(ds['dice']).toBe('2d8');
      // 4d8 doubled range: min=4, max=32.
      expect(ds['radiantDamage']).toBeGreaterThanOrEqual(4);
      expect(ds['radiantDamage']).toBeLessThanOrEqual(32);
    },
  );

  // ── DS-T8: divineSmiteUndead=true → +1d8 (slot 1 → 3d8) ────────────────────────
  // REQ-DS-UNDEAD-01.

  it(
    'DS-T8: divineSmiteUndead=true + slot 1 → dice=3d8, radiantDamage in [3..24] (PHB p.85 "+1d8 if undead/fiend")',
    async () => {
      const app = await getTestApp();
      await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      let hitBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 20; attempt++) {
        await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
        const fresh = await makeFreshPaladinEncounter(app, `DS-T8 undead +1d8 attempt-${attempt}`, { npcAc: 1 });

        const { statusCode, body } = await doSmiteAttack(
          fresh.encounterId, fresh.paladinCombatantId, fresh.npcCombatantId, longswordInstanceId, fresh.version,
          { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 1, divineSmiteUndead: true },
        );

        if (statusCode === 200 && (body as Record<string, unknown>)['hit'] === true) {
          hitBody = body as Record<string, unknown>;
          break;
        }
      }

      if (!hitBody) throw new Error('DS-T8: Failed to land a hit after 20 attempts');

      const ds = hitBody['divineSmite'] as Record<string, unknown>;
      expect(ds).toBeDefined();
      // Slot 1 + undead → computeDivineSmiteDice(1, true) = '3d8' (PHB p.85).
      expect(ds['dice']).toBe('3d8');
      // 3d8 range: min=3, max=24 (non-crit). On crit: 6d8, max=48.
      expect(ds['radiantDamage']).toBeGreaterThanOrEqual(3);
      expect(ds['radiantDamage']).toBeLessThanOrEqual(48); // allow for crit in hit path
    },
  );

  // ── DS-T9: Backward-compat omitted → no divineSmite key ─────────────────────────
  // REQ-DS-COMPAT-01.

  it(
    'DS-T9: divineSmite fields absent → existing attack-apply flow byte-identical (no divineSmite key)',
    async () => {
      // REQ-DS-COMPAT-01: when runtimeDecisions.divineSmiteSpend is absent/false,
      // the response is byte-identical to pre-smite behavior — NO divineSmite key.
      const app = await getTestApp();
      await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'DS-T9 backward compat',
            combatants: [
              { name: 'Paladin', kind: 'pc', characterId: paladinCharId, initiative: 20, hpCurrent: 44, hpMax: 44 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 50, hpMax: 50, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const paladinCombatantId = enc.currentCombatantId as string;
      const npcId = enc.combatants.find((c: { id: string }) => c.id !== paladinCombatantId)?.id as string;

      // No runtimeDecisions at all — pure backward-compat path.
      const { statusCode, body } = await doSmiteAttack(
        enc.id, paladinCombatantId, npcId, longswordInstanceId, enc.version,
      );

      expect(statusCode).toBe(200);
      // divineSmite key MUST NOT be present (backward-compat — REQ-DS-COMPAT-01).
      expect(body.divineSmite).toBeUndefined();
      // Hit response shape is unchanged.
      if (body.hit === true) {
        expect(body.rolledDamage).toBeDefined();
        expect(body.damageType).toBeDefined();
      }
    },
  );

  // ── DS-T10: CAS conflict → no slot spent ─────────────────────────────────────────
  // REQ-DS-ATOMICITY-01.

  it(
    'DS-T10: CAS version conflict → 409 VERSION_CONFLICT, slot NOT consumed (atomic rollback)',
    async () => {
      // REQ-DS-ATOMICITY-01: slot consume + HP + version are atomic — conflict rolls back all.
      const app = await getTestApp();
      await setSlotsUsed(paladinCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, paladinCombatantId, npcCombatantId, version } =
        await makeFreshPaladinEncounter(app, 'DS-T10 CAS conflict', { npcHp: 30, npcAc: 1 });

      const hpBefore = await getCombatantHp(encounterId, npcCombatantId);
      const slotsBefore = await getSlotsUsed(paladinCharId);

      // Send STALE version (version - 1 → mismatch).
      const staleVersion = Math.max(0, version - 1);
      const { statusCode, body } = await doSmiteAttack(
        encounterId, paladinCombatantId, npcCombatantId, longswordInstanceId, staleVersion,
        { runtimeDecisions: { divineSmiteSpend: true }, divineSmiteSlotLevel: 1 },
      );

      // Either the pre-check or in-tx CAS conflict fires → 409.
      expect(statusCode).toBe(409);
      expect(body.VERSION_CONFLICT ?? body.error).toBeTruthy();

      // HP and slots unchanged.
      expect(await getCombatantHp(encounterId, npcCombatantId)).toBe(hpBefore);
      const slotsAfter = await getSlotsUsed(paladinCharId);
      expect(slotsAfter).toEqual(slotsBefore);
    },
  );

  // ── DS-T11: Schema — divineSmiteSpend=true + slotLevel absent → 400 ───────────
  // REQ-DS-SCHEMA-01 (Zod .refine() cross-field guard).

  it(
    'DS-T11: divineSmiteSpend=true + divineSmiteSlotLevel absent → 400 VALIDATION_FAILED (Zod refine cross-field guard)',
    async () => {
      // REQ-DS-SCHEMA-01: Zod-level rejection when spend=true but slotLevel absent.
      // This fires BEFORE the use-case (schema guard comes first).
      const app = await getTestApp();

      const fresh = await makeFreshPaladinEncounter(app, 'DS-T11 schema guard');

      // POST with spend=true but NO divineSmiteSlotLevel.
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${fresh.encounterId}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fresh.paladinCombatantId,
          targetId: fresh.npcCombatantId,
          weaponInstanceId: longswordInstanceId,
          version: fresh.version,
          runtimeDecisions: { divineSmiteSpend: true },
          // divineSmiteSlotLevel intentionally absent — Zod refine should catch this
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
    },
  );
});

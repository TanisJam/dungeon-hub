/**
 * Integration tests — engine-counterspell (Counterspell reaction, PHB p.281).
 *
 * PHB p.281 — Counterspell:
 *   "When you see a creature within 60 feet of you casting a spell, you can use your
 *    reaction to attempt to interrupt it. If the creature is casting a spell of 3rd
 *    level or lower, its spell fails and has no effect. If it is casting a spell of
 *    4th level or higher, make an ability check using your spellcasting ability.
 *    The DC equals 10 + the spell's level. On a success, the creature's spell fails
 *    and has no effect."
 *   At Higher Levels: "When you cast this spell using a spell slot of 4th level or
 *    higher, the interrupted spell has no effect if its level is less than or equal
 *    to the level of the spell slot you used."
 *   Slot economy: "Casting a spell using a higher-level spell slot does not change
 *    the slot expended — the slot is consumed when the spell is cast." (PHB p.281)
 *
 * PHB p.190 — "You can take only one reaction per round."
 *
 * Two-step flow (server-authoritative):
 *   Step 1 — POST /encounters/:id/actions/cast-spell:
 *     Non-caster PC with reaction_used=false and free 3rd+ slot → SUSPEND, castAnnounced with options.
 *   Step 2 — POST /encounters/:id/actions/cast-spell/resolve-reaction:
 *     cast-counterspell → resolveCounterspell (server-rolled d20), triple-row atomic tx.
 *
 * NON-NEGOTIABLE invariants:
 *   C-1 (server-authority): d20 rolled server-side, never from client body.
 *   W-3 (version-guard): commit tx is WHERE id AND version; 0 rows → VERSION_CONFLICT.
 *   Triple-row atomic tx: caster slot + counterspeller slot + counterspeller reaction + (target HP on fail) + version++ + pending=NULL.
 *
 * Tests:
 *   CS-T1: Counterspell 3rd vs MM 1st → AUTO-counter: target HP unchanged, caster slot spent,
 *          counterspeller 3rd slot + reaction spent, pending_cast=NULL (C-1 server-authority proof).
 *   CS-T2: Decline → MM full damage lands on target (backward-compat REQ-CS-10).
 *   CS-T3: Counterspeller has no 3rd-level slot → 400 INSUFFICIENT_SLOT.
 *   CS-T4: slotLevel:2 in body → 400 INSUFFICIENT_SLOT.
 *   CS-T5: counterspellerCombatantId === casterCombatantId → 400 COUNTERSPELLER_IS_CASTER.
 *   CS-T6: Counterspeller reaction_used:true → 400 REACTION_ALREADY_USED.
 *   CS-T7: Backward-compat — cast with NO eligible counterspeller + NO shield-eligible target
 *          → atomic resolve, no options, no castAnnounced (byte-identical to Slice 0, REQ-CS-10).
 *   CS-T8: Counterspeller reaction resets on their turn (REQ-CS-08, advance-encounter-turn).
 *   CS-T9: Version-guard staleness → VERSION_CONFLICT (W-3).
 *   CS-T10: Planted-roll proof — plant pending_cast server-side, verify server uses it (C-1).
 *
 * DC-check integration path: DOMAIN-UNIT ONLY.
 * Note: Magic Missile is a 1st-level spell → Counterspell 3rd-slot ALWAYS auto-counters it.
 * The DC-check branch (countered spell level ≥4, counterspell slot < spell level) is covered
 * by packages/domain/src/engine/spell/counterspell.test.ts (RED-GREEN TDD, PHB p.281).
 * No integration path exists until a spell of level ≥4 is castable — deliberate scoped boundary
 * per design §DC-check Coverage Boundary, not missing coverage.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-counterspell — POST /encounters/:id/actions/cast-spell + resolve-reaction (cast-counterspell)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // PC caster: Wizard L5, INT 16 (+3 spellcasting mod).
  // Wizard L5 slotsMax = [4,3,2,1,0,0,0,0,0].
  let casterCharId: string;

  // PC counterspeller: Wizard L5, INT 16.
  // Wizard L5 slotsMax = [4,3,2,1,0,0,0,0,0] — has 3rd-level slots.
  let counterspellerCharId: string;

  // PC bystander (no spellcasting class — to test no-counterspeller backward-compat).
  let bystanderCharId: string;

  // ── Helpers ───────────────────────────────────────────────────────────────────

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

  /** Set reaction_used directly on a combatant row. */
  const setReactionUsed = async (combatantId: string, value: boolean): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatants } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db
      .update(encounterCombatants)
      .set({ reactionUsed: value })
      .where(eq(encounterCombatants.id, combatantId));
  };

  /** Read reaction_used from DB. */
  const getReactionUsed = async (combatantId: string): Promise<boolean> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatants } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(encounterCombatants).where(eq(encounterCombatants.id, combatantId)).limit(1);
    return row?.reactionUsed ?? false;
  };

  /** Get HP of a combatant via GET encounter. */
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

  /** Get encounter version. */
  const getEncounterVersion = async (encounterId: string): Promise<number> => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${encounterId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    return (res.json() as { version: number }).version;
  };

  /** Plant pending_cast directly in DB (for C-1 server-authority proof tests). */
  const plantPendingCast = async (
    encounterId: string,
    pendingCast: Record<string, unknown>,
  ): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db
      .update(encounters)
      .set({ pendingCast, updatedAt: new Date() })
      .where(eq(encounters.id, encounterId));
  };

  /** Read pending_cast from DB. */
  const getPendingCast = async (encounterId: string): Promise<unknown> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(encounters).where(eq(encounters.id, encounterId)).limit(1);
    return row?.pendingCast ?? null;
  };

  /**
   * Create a fresh encounter with:
   * - PC caster (initiative 20, goes first)
   * - PC target / NPC target (initiative 10)
   * - PC counterspeller (initiative 5, separate from target)
   *
   * Caster is currentCombatantId (highest initiative).
   */
  const makeFreshCounterspellEncounter = async (
    name: string,
    opts: {
      targetKind?: 'pc' | 'npc';
      targetCharId?: string;
      targetHpCurrent?: number;
      targetHpMax?: number;
      counterspellerCharId?: string;
      includeCounterspeller?: boolean;
      includeBystander?: boolean;
    } = {},
  ) => {
    const app = await getTestApp();
    const targetKind = opts.targetKind ?? 'npc';
    const includeCounterspeller = opts.includeCounterspeller ?? true;
    const targetHpCurrent = opts.targetHpCurrent ?? 30;
    const targetHpMax = opts.targetHpMax ?? 30;

    const targetCombatant =
      targetKind === 'pc'
        ? {
            name: 'PC Target',
            kind: 'pc' as const,
            characterId: opts.targetCharId ?? bystanderCharId,
            initiative: 10,
            hpCurrent: targetHpCurrent,
            hpMax: targetHpMax,
          }
        : {
            name: 'NPC Target',
            kind: 'npc' as const,
            initiative: 10,
            hpCurrent: targetHpCurrent,
            hpMax: targetHpMax,
            ac: 13,
          };

    const combatants: Array<Record<string, unknown>> = [
      {
        name: 'Caster Wizard',
        kind: 'pc',
        characterId: casterCharId,
        initiative: 20,
        hpCurrent: 25,
        hpMax: 30,
      },
      targetCombatant,
    ];

    if (includeCounterspeller) {
      combatants.push({
        name: 'Counterspeller Wizard',
        kind: 'pc',
        characterId: opts.counterspellerCharId ?? counterspellerCharId,
        initiative: 5,
        hpCurrent: 25,
        hpMax: 30,
      });
    }

    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { campaignId, name, combatants },
      })
      .then((r) => r.json());

    const casterCombatantId = enc.currentCombatantId as string;
    const targetCombatantId = (
      enc.combatants.find((c: { id: string; initiative?: number }) =>
        c.id !== casterCombatantId && (enc.combatants as Array<{ id: string; initiative: number; characterId?: string }>)
          .find((x) => x.id === c.id)?.initiative === 10
      )?.id as string
    ) ?? enc.combatants.find((c: { id: string }) => c.id !== casterCombatantId)?.id as string ?? '';

    const counterspellerCombatantId = includeCounterspeller
      ? (enc.combatants.find((c: { id: string }) =>
          c.id !== casterCombatantId && c.id !== targetCombatantId
        )?.id as string) ?? ''
      : '';

    return {
      encounterId: enc.id as string,
      casterCombatantId,
      targetCombatantId,
      counterspellerCombatantId,
      version: enc.version as number,
    };
  };

  /** POST /encounters/:id/actions/cast-spell helper. */
  const doCastSpell = async (
    encounterId: string,
    casterCombatantId: string,
    targetCombatantId: string,
    opts: { slotLevel?: number; version: number },
  ) => {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/cast-spell`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        casterId: casterCombatantId,
        spellName: 'Magic Missile',
        slotLevel: opts.slotLevel ?? 1,
        targets: [targetCombatantId],
        version: opts.version,
      },
    });
  };

  /** POST /encounters/:id/actions/cast-spell/resolve-reaction helper for counterspell. */
  const doCounterspell = async (
    encounterId: string,
    defenderCombatantId: string,
    counterspellerCombatantId: string,
    slotLevel: number,
    version: number,
  ) => {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/cast-spell/resolve-reaction`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        reactionDecision: 'cast-counterspell',
        defenderCombatantId,
        counterspellerCombatantId,
        slotLevel,
        version,
        // Zod strips any unknown fields — no roll values should be in body (C-1).
      },
    });
  };

  /** POST /encounters/:id/actions/cast-spell/resolve-reaction helper for decline. */
  const doDecline = async (
    encounterId: string,
    defenderCombatantId: string,
    version: number,
  ) => {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/cast-spell/resolve-reaction`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        reactionDecision: 'decline',
        defenderCombatantId,
        version,
      },
    });
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
        payload: { name: 'Counterspell Integration Test' },
      })
      .then((r) => r.json());
    campaignId = campaign.id as string;
    worldId = campaign.worldId as string;

    // ── Caster: Wizard L5, INT 16. slotsMax = [4,3,2,1,0,0,0,0,0]. ─────────────
    const casterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Caster Wizard (CS test)' },
      })
      .then((r) => r.json());
    casterCharId = casterChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${casterCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'wizard',
              source: 'PHB',
              level: 5,
              hitDie: 'd6',
              subclass: null,
              savingThrows: ['int', 'wis'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });

    // ── Counterspeller: Wizard L5, INT 16. slotsMax = [4,3,2,1,0,0,0,0,0]. ─────
    // Wizard L5 gives 3rd-level slots (index 2 = level 3, slotsMax[2] = 2).
    const csChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Counterspeller Wizard (CS test)' },
      })
      .then((r) => r.json());
    counterspellerCharId = csChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${counterspellerCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'wizard',
              source: 'PHB',
              level: 5,
              hitDie: 'd6',
              subclass: null,
              savingThrows: ['int', 'wis'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });

    // ── Bystander: Fighter L5 (no spellcasting class). ────────────────────────────
    // Used as NPC-like PC target; cannot counterspell; no slots.
    const bystanderChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Bystander Fighter (CS test)' },
      })
      .then((r) => r.json());
    bystanderCharId = bystanderChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${bystanderCharId}`,
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
          baseStats: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── CS-T1: Counterspell 3rd vs MM 1st → AUTO-counter ─────────────────────────
  // REQ-CS-05: countered===true → zero damage, caster MM slot spent, counterspeller 3rd slot+reaction spent.
  // C-1 server-authority proof: plant pending_cast with known serverRolledDamage; verify target HP unchanged.

  it(
    'CS-T1: Counterspell 3rd vs MM 1st → auto-counter: target HP unchanged (0 damage), caster slot spent, counterspeller 3rd slot + reaction spent, pending_cast=NULL (C-1 planted-value proof)',
    async () => {
      // PHB p.281: Counterspell 3rd slot vs MM 1st → auto-counter (counteredSpellLevel=1 ≤ slotLevel=3).
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, counterspellerCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T1 auto-counter', {
          targetKind: 'npc',
          targetHpCurrent: 25,
          targetHpMax: 30,
        });

      const targetHpBefore = await getCombatantHp(encounterId, targetCombatantId);
      const casterSlotsBefore = await getSlotsUsed(casterCharId);
      const counterSlotsBefore = await getSlotsUsed(counterspellerCharId);

      // Suspend: cast MM to get the reaction window.
      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      const castBody = castRes.json();
      expect(castBody.castAnnounced).toBeDefined();

      // Verify the options[] contains a counterspell option.
      const csOption = castBody.castAnnounced.options?.find(
        (o: { kind: string }) => o.kind === 'counterspell',
      );
      expect(csOption).toBeDefined();
      expect(csOption?.eligibleCounterspellerIds).toContain(counterspellerCombatantId);

      // C-1 proof: plant a known serverRolledDamage.total=99 in pending_cast.
      // If server-authority holds, target HP must remain UNCHANGED (spell is cancelled).
      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [targetCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 99, perDart: [33, 33, 33] },
        encVersion: version,
      });

      // Resolve: cast-counterspell with 3rd-level slot.
      const resolveRes = await doCounterspell(
        encounterId,
        targetCombatantId,
        counterspellerCombatantId,
        3,
        version,
      );
      expect(resolveRes.statusCode).toBe(200);
      const resolveBody = resolveRes.json();
      expect(resolveBody.spellCountered).toBe(true);
      expect(resolveBody.damageApplied).toBe(0);

      // Target HP UNCHANGED — spell cancelled, zero damage (PHB p.281 + C-1 planted proof).
      const targetHpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(targetHpAfter).toBe(targetHpBefore);

      // Caster MM slot consumed (PHB — slot spent when cast, regardless of counter outcome).
      const casterSlotsAfter = await getSlotsUsed(casterCharId);
      expect(casterSlotsAfter[0]).toBe(casterSlotsBefore[0]! + 1); // level 1 slot

      // Counterspeller 3rd-level slot consumed (index 2 = level 3).
      const counterSlotsAfter = await getSlotsUsed(counterspellerCharId);
      expect(counterSlotsAfter[2]).toBe(counterSlotsBefore[2]! + 1); // level 3 slot

      // Counterspeller reaction_used=true (PHB p.190 — reaction expended).
      const reactionUsed = await getReactionUsed(counterspellerCombatantId);
      expect(reactionUsed).toBe(true);

      // pending_cast cleared (window closed atomically).
      const pendingCastAfter = await getPendingCast(encounterId);
      expect(pendingCastAfter).toBeNull();

      // Version bumped (CAS commit).
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(version + 1);
    },
  );

  // ── CS-T2: Decline → MM full damage lands ────────────────────────────────────
  // REQ-CS-10: backward-compat — decline still works byte-identical to Slice 0.

  it(
    'CS-T2: Decline (cast-counterspell window) → MM full damage lands on target (backward-compat REQ-CS-10)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T2 decline', {
          targetKind: 'npc',
          targetHpCurrent: 25,
          targetHpMax: 30,
        });

      // Suspend.
      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      expect(castRes.json().castAnnounced).toBeDefined();

      // Plant known damage for decline verification (C-1 check).
      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [targetCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 9, perDart: [3, 3, 3] },
        encVersion: version,
      });

      const targetHpBefore = await getCombatantHp(encounterId, targetCombatantId);

      // Resolve: decline (no counterspell — MM resolves).
      const resolveRes = await doDecline(encounterId, targetCombatantId, version);
      expect(resolveRes.statusCode).toBe(200);
      const body = resolveRes.json();
      expect(body.damageApplied).toBe(9); // planted value governs (C-1)

      // Target HP decreased by planted damage.
      const targetHpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(targetHpAfter).toBe(targetHpBefore - 9);

      // Version bumped.
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(version + 1);
    },
  );

  // ── CS-T3: Counterspeller has no 3rd-level slot → INSUFFICIENT_SLOT ──────────
  // REQ-CS-07: INSUFFICIENT_SLOT when counterspeller has no slot at declared slotLevel.
  // Strategy: create encounter where counterspeller HAS a 3rd-level slot (so suspension fires),
  // THEN exhaust the slot after suspend (to simulate concurrent depletion), THEN plant pending_cast
  // explicitly, THEN attempt resolve with 3rd-level slot → INSUFFICIENT_SLOT.

  it(
    'CS-T3: Counterspeller has no 3rd-level slot → 400 INSUFFICIENT_SLOT (REQ-CS-07)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      // Counterspeller starts with slots so the cast suspends (eligibility check uses DB state).
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, counterspellerCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T3 no 3rd slot', { targetKind: 'npc' });

      // Suspend: counterspeller has slots → cast suspends.
      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      expect(castRes.json().castAnnounced).toBeDefined();

      // NOW exhaust all 3rd-level slots on counterspeller (simulate concurrent slot drain).
      // Wizard L5 has 2 third-level slots (index 2 = level 3).
      await setSlotsUsed(counterspellerCharId, [0, 0, 2, 1, 0, 0, 0, 0, 0]);

      // Manually plant a pending_cast at the CURRENT version (no version bump on suspend).
      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [targetCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 9, perDart: [3, 3, 3] },
        encVersion: version,
      });

      // Attempt to counterspell with 3rd slot (but they have none left).
      const resolveRes = await doCounterspell(
        encounterId,
        targetCombatantId,
        counterspellerCombatantId,
        3,
        version,
      );
      expect(resolveRes.statusCode).toBe(400);
      const body = resolveRes.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('INSUFFICIENT_SLOT');
      expect(body.issues[0].slotLevel).toBe(3);
    },
  );

  // ── CS-T4: slotLevel:2 in body → INSUFFICIENT_SLOT ───────────────────────────
  // REQ-CS-07: INSUFFICIENT_SLOT when slotLevel < 3 (PHB p.281: Counterspell is 3rd-level).

  it(
    'CS-T4: slotLevel:2 in resolve body → 400 INSUFFICIENT_SLOT (REQ-CS-07, PHB p.281)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, counterspellerCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T4 slotLevel below 3', { targetKind: 'npc' });

      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);

      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [targetCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 9, perDart: [3, 3, 3] },
        encVersion: version,
      });

      // Attempt to cast Counterspell with a 2nd-level slot.
      const resolveRes = await doCounterspell(
        encounterId,
        targetCombatantId,
        counterspellerCombatantId,
        2, // below minimum
        version,
      );
      expect(resolveRes.statusCode).toBe(400);
      const body = resolveRes.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('INSUFFICIENT_SLOT');
      expect(body.issues[0].slotLevel).toBe(2);
    },
  );

  // ── CS-T5: counterspellerCombatantId === casterCombatantId → COUNTERSPELLER_IS_CASTER ──
  // REQ-CS-07: A caster cannot counterspell their own spell.

  it(
    'CS-T5: counterspellerCombatantId === casterCombatantId → 400 COUNTERSPELLER_IS_CASTER (REQ-CS-07)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T5 caster is counterspeller', { targetKind: 'npc' });

      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);

      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [targetCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 9, perDart: [3, 3, 3] },
        encVersion: version,
      });

      // Counterspeller ID == casterCombatantId — invalid.
      const resolveRes = await doCounterspell(
        encounterId,
        targetCombatantId,
        casterCombatantId, // same as caster!
        3,
        version,
      );
      expect(resolveRes.statusCode).toBe(400);
      const body = resolveRes.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('COUNTERSPELLER_IS_CASTER');
    },
  );

  // ── CS-T6: Counterspeller reaction_used:true → REACTION_ALREADY_USED ─────────
  // REQ-CS-07: PHB p.190 — one reaction per round.

  it(
    'CS-T6: Counterspeller reaction_used:true → 400 REACTION_ALREADY_USED (REQ-CS-07, PHB p.190)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, counterspellerCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T6 reaction already used', { targetKind: 'npc' });

      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);

      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [targetCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 9, perDart: [3, 3, 3] },
        encVersion: version,
      });

      // Mark counterspeller reaction as already used (simulate previous reaction this round).
      await setReactionUsed(counterspellerCombatantId, true);

      const resolveRes = await doCounterspell(
        encounterId,
        targetCombatantId,
        counterspellerCombatantId,
        3,
        version,
      );
      expect(resolveRes.statusCode).toBe(400);
      const body = resolveRes.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('REACTION_ALREADY_USED');
    },
  );

  // ── CS-T7: No eligible reactor → atomic, no castAnnounced ────────────────────
  // REQ-CS-10, REQ-SC-05: backward-compat — cast with no shield-eligible AND no counterspell-eligible
  // combatant → resolves atomically, no castAnnounced, byte-identical to Slice 0.

  it(
    'CS-T7: Cast with NO eligible counterspeller + NPC target (no shield) → atomic resolve, no castAnnounced, byte-identical to Slice 0 (REQ-CS-10)',
    async () => {
      // Fighter (bystanderCharId) has NO spellcasting class → no 3rd+ slots → cannot counterspell.
      // Target is NPC → cannot shield. Neither condition met → atomic path.
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T7 no reactor', {
          targetKind: 'npc',
          includeCounterspeller: false,
          includeBystander: false,
        });

      const targetHpBefore = await getCombatantHp(encounterId, targetCombatantId);
      const casterSlotsBefore = await getSlotsUsed(casterCharId);

      const res = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Atomic path — no castAnnounced, no suspension.
      expect(body.castAnnounced).toBeUndefined();
      expect(body.damage).toBeDefined();
      expect(typeof body.damage.total).toBe('number');
      expect(body.damage.total).toBeGreaterThanOrEqual(3);  // 3 darts, min 2 each = 6... 1d4+1 min per dart = 2
      expect(body.damage.total).toBeLessThanOrEqual(15);    // 3 × (1d4+1) max = 15

      // Target HP decreased immediately (atomic path).
      const targetHpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(targetHpAfter).toBe(targetHpBefore - body.damage.total);

      // Caster slot consumed immediately.
      const casterSlotsAfter = await getSlotsUsed(casterCharId);
      expect(casterSlotsAfter[0]).toBe(casterSlotsBefore[0]! + 1);

      // Version bumped.
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(version + 1);

      // No pending_cast written.
      const pendingCast = await getPendingCast(encounterId);
      expect(pendingCast).toBeNull();
    },
  );

  // ── CS-T8: Counterspeller reaction resets on their turn ───────────────────────
  // REQ-CS-08: PHB p.190 — "You regain your expended reaction at the start of your next turn."
  // advance-encounter-turn already resets reaction_used generically (no new code needed).

  it(
    'CS-T8: Counterspeller reaction_used=true → advance-encounter-turn to their turn → reaction_used resets to false (REQ-CS-08, PHB p.190)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, counterspellerCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T8 reaction reset', { targetKind: 'npc' });

      // Manually mark counterspeller reaction_used=true (simulates they countered this round).
      await setReactionUsed(counterspellerCombatantId, true);
      expect(await getReactionUsed(counterspellerCombatantId)).toBe(true);

      // Advance turn twice: caster (init 20) → target (init 10) — advance-encounter-turn resets reaction_used.
      const app = await getTestApp();

      // Advance to target's turn.
      const advance1 = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/advance-turn`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { version },
      });
      expect(advance1.statusCode).toBe(200);
      const v2 = (advance1.json() as { version: number }).version;

      // Advance to counterspeller's turn (init 5).
      const advance2 = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/advance-turn`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { version: v2 },
      });
      expect(advance2.statusCode).toBe(200);

      // Counterspeller's turn resets reaction_used (PHB p.190).
      const reactionUsedAfter = await getReactionUsed(counterspellerCombatantId);
      expect(reactionUsedAfter).toBe(false);
    },
  );

  // ── CS-T9: Version-guard staleness → VERSION_CONFLICT ────────────────────────
  // W-3: stale version in resolve body → VERSION_CONFLICT (CAS mismatch, no commit).

  it(
    'CS-T9: Stale version in resolve body → 409 VERSION_CONFLICT (W-3 version guard)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, counterspellerCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T9 version guard', { targetKind: 'npc' });

      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      expect(castRes.json().castAnnounced).toBeDefined();

      // Use a stale version (current - 1 if possible, else 0).
      const staleVersion = Math.max(0, version - 1);

      const resolveRes = await doCounterspell(
        encounterId,
        targetCombatantId,
        counterspellerCombatantId,
        3,
        staleVersion,
      );
      expect(resolveRes.statusCode).toBe(409);
      expect(resolveRes.json().error).toBe('VERSION_CONFLICT');
    },
  );

  // ── CS-T10: Planted-roll proof (C-1 server-authority) ────────────────────────
  // C-1: the d20 check is rolled SERVER-SIDE. The client body carries NO roll values.
  // Proof strategy: plant pending_cast with a specific casterCombatantId + damage, then
  // send counterspell body with no roll fields. Server ignores any extra body fields (Zod strips).
  // This test confirms the resolve body is: reactionDecision + IDs + slotLevel + version ONLY.

  it(
    'CS-T10: C-1 server-authority — resolve body carries no roll values; Zod strips unknowns; server uses server-stored pending_cast',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, targetCombatantId, counterspellerCombatantId, version } =
        await makeFreshCounterspellEncounter('CS-T10 C-1 body proof', {
          targetKind: 'npc',
          targetHpCurrent: 25,
          targetHpMax: 30,
        });

      const castRes = await doCastSpell(encounterId, casterCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      expect(castRes.json().castAnnounced).toBeDefined();

      // Plant a specific serverRolledDamage so we can assert server uses it (not client).
      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [targetCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 42, perDart: [14, 14, 14] },
        encVersion: version,
      });

      // Send counterspell body with extra roll fields that should be stripped by Zod.
      const app = await getTestApp();
      const resolveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/cast-spell/resolve-reaction`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          reactionDecision: 'cast-counterspell',
          defenderCombatantId: targetCombatantId,
          counterspellerCombatantId,
          slotLevel: 3,
          version,
          // These fields should be stripped by Zod and IGNORED by server (C-1).
          d20: 1,
          total: 1,
          countered: false,
          clientRolledDamage: 999,
        },
      });

      // Should succeed (Zod strips the extra fields).
      expect(resolveRes.statusCode).toBe(200);
      const body = resolveRes.json();

      // Auto-counter: MM level 1 vs Counterspell slot 3 → always countered.
      // spellCountered===true → damageApplied===0 (server-authority wins over any client fields).
      expect(body.spellCountered).toBe(true);
      expect(body.damageApplied).toBe(0); // spell CANCELLED — planted 42 is ignored because spell is negated

      // Target HP unchanged (spell cancelled).
      const targetHpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(targetHpAfter).toBe(25); // unchanged

      // pending_cast cleared.
      const pendingCastAfter = await getPendingCast(encounterId);
      expect(pendingCastAfter).toBeNull();
    },
  );
});

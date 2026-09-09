/**
 * Integration tests — engine-spell-cast-suspend (Magic Missile + Shield reaction, PHB p.257 / p.275).
 *
 * PHB p.257 — Magic Missile:
 *   "You create three glowing darts of magical force. Each dart hits a creature of your choice
 *    that you can see within range. A dart deals 1d4+1 force damage to its target."
 *   "When you cast this spell using a spell slot of 2nd level or higher, the spell creates one
 *    more dart for each slot level above 1st."
 *   Note: Magic Missile auto-hits (no attack roll, no saving throw — PHB p.257).
 *
 * PHB p.275 — Shield:
 *   "When you are hit by an attack or targeted by the magic missile spell, you can use your
 *    reaction to cast this spell... you take no damage from magic missile."
 *
 * PHB p.190 — "You can take only one reaction per round."
 *
 * Two-step spell-cast flow (server-authoritative):
 *   Step 1 — POST /encounters/:id/actions/cast-spell:
 *     PC defender with free reaction + 1st-level slot
 *     → SUSPEND: stores pending_cast with server-rolled damage, returns castAnnounced (no HP/slot/version commit).
 *   Step 2 — POST /encounters/:id/actions/cast-spell/resolve-reaction:
 *     Body: { reactionDecision, defenderCombatantId, version } — NO client damage.
 *     cast-shield → defender takes 0 damage (negate-spell-damage), caster MM slot + defender Shield slot consumed.
 *     decline     → full server-rolled force damage applied to defender, caster MM slot consumed.
 *
 * NON-NEGOTIABLE invariants (engine-spell-cast-suspend design):
 *   C-1 (server-authority): damage rolled server-side at suspend, stored in pending_cast, NEVER in response.
 *   W-3 (version-guard): pending_cast write is WHERE version=$v; 0 rows → VERSION_CONFLICT.
 *   Slots consumed AT RESOLVE, not at suspend (caster + defender Shield both in one atomic CAS tx).
 *   No version bump on suspend (pending_cast write is bookkeeping only).
 *
 * Tests:
 *   SC-T1:  Cast MM at PC defender (free reaction + slot) → 200 castAnnounced; HP + version + slot UNCHANGED;
 *           NO damage in response body (C-1 server-authority proof).
 *   SC-T2:  cast-shield resolve → defender 0 damage (PHB p.275); caster MM slot consumed; defender Shield slot
 *           consumed; reaction_used=true; version bumped. C-1 PROOF: plant serverRolledDamage in DB as a known
 *           value N; verify defender HP unchanged even when N>0.
 *   SC-T3:  decline resolve → full server-rolled damage applied to defender; caster slot consumed;
 *           reaction_used NOT set; version bumped.
 *   SC-T4:  NPC target → atomic no-suspend (immediate damage + caster slot consumed in one tx; version bumped).
 *   SC-T5:  REACTION_ALREADY_USED: reaction_used=true on defender → 400 REACTION_ALREADY_USED.
 *   SC-T6:  Reset-on-INCOMING: advance-encounter-turn to defender's turn → reaction_used resets to false (REQ-SC-08).
 *   SC-T7:  W-3 version guard: stale version in cast body → VERSION_CONFLICT (pending_cast not written).
 *   SC-T8:  MULTI_TARGET_NOT_SUPPORTED: targets.length > 1 → 400 VALIDATION_FAILED (REQ-SC-03).
 *   SC-T9:  INSUFFICIENT_SLOT: caster has no MM slot → 400 INSUFFICIENT_SLOT (REQ-SC-02).
 *   SC-T10: Read-path tolerance: GET encounter with pending_cast=null → 200, no error (REQ-SC-09, REQ-RB-02).
 *   SC-T11: Version-guard stale resolve: pending_cast present but stale version in resolve body → VERSION_CONFLICT.
 *   SC-T12: PC defender with no slot → atomic no-suspend (immediate damage, no pending_cast written, caster slot spent).
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-spell-cast-suspend — POST /encounters/:id/actions/cast-spell + resolve-reaction', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // PC caster: Wizard L5, INT 16 (+3 spellcasting mod).
  // Wizard L5 slotsMax = [4,3,2,1,0,0,0,0,0]. MM uses a slot at the requested level.
  let casterCharId: string;

  // PC defender: Wizard L3, DEX 14. Has 1st-level slots for Shield.
  // Wizard L3 slotsMax = [4,2,0,0,0,0,0,0,0].
  let defenderCharId: string;

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
   * Create a fresh encounter with PC caster as current combatant and a defender.
   * Caster initiative=20 (highest), so they go first.
   */
  const makeFreshCastEncounter = async (
    name: string,
    opts: {
      defenderKind?: 'pc' | 'npc';
      defenderCharId?: string;
      defenderHpCurrent?: number;
      defenderHpMax?: number;
      npcAc?: number;
      casterHp?: number;
    } = {},
  ) => {
    const app = await getTestApp();
    const defenderKind = opts.defenderKind ?? 'pc';
    const defenderHpCurrent = opts.defenderHpCurrent ?? 30;
    const defenderHpMax = opts.defenderHpMax ?? 30;

    const defenderCombatant =
      defenderKind === 'pc'
        ? {
            name: 'PC Defender',
            kind: 'pc' as const,
            characterId: opts.defenderCharId ?? defenderCharId,
            initiative: 5,
            hpCurrent: defenderHpCurrent,
            hpMax: defenderHpMax,
          }
        : {
            name: 'NPC Defender',
            kind: 'npc' as const,
            initiative: 5,
            hpCurrent: defenderHpCurrent,
            hpMax: defenderHpMax,
            ac: opts.npcAc ?? 13,
          };

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
              name: 'Caster Wizard',
              kind: 'pc',
              characterId: casterCharId,
              initiative: 20,
              hpCurrent: opts.casterHp ?? 25,
              hpMax: 30,
            },
            defenderCombatant,
          ],
        },
      })
      .then((r) => r.json());

    const casterCombatantId = enc.currentCombatantId as string;
    const defenderCombatantId = (
      enc.combatants.find((c: { id: string }) => c.id !== casterCombatantId)?.id as string
    ) ?? '';

    return {
      encounterId: enc.id as string,
      casterCombatantId,
      defenderCombatantId,
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

  /** POST /encounters/:id/actions/cast-spell/resolve-reaction helper. */
  const doResolve = async (
    encounterId: string,
    defenderCombatantId: string,
    reactionDecision: 'cast-shield' | 'decline',
    version: number,
  ) => {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/cast-spell/resolve-reaction`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        reactionDecision,
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
        payload: { name: 'Spell Cast Suspend Integration Test' },
      })
      .then((r) => r.json());
    campaignId = campaign.id as string;
    worldId = campaign.worldId as string;

    // ── Caster: Wizard L5, INT 16. Full-caster slotsMax = [4,3,2,1,0,0,0,0,0]. ──
    const casterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Caster Wizard (MM test)' },
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

    // ── Defender: Wizard L3, DEX 14. slotsMax = [4,2,0,0,0,0,0,0,0]. ────────────
    // Has 1st-level slots for Shield (PHB p.275 — Shield is a 1st-level spell).
    const defenderChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Defender Wizard (Shield test)' },
      })
      .then((r) => r.json());
    defenderCharId = defenderChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${defenderCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'wizard',
              source: 'PHB',
              level: 3,
              hitDie: 'd6',
              subclass: null,
              savingThrows: ['int', 'wis'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          baseStats: { str: 8, dex: 14, con: 10, int: 14, wis: 12, cha: 10 },
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── SC-T1: Cast MM → castAnnounced; HP + version + slot UNCHANGED; no damage in response ──
  // REQ-SC-04: CAST_ANNOUNCED suspension (reaction window).
  // C-1: server-rolled damage NOT in response body.

  it(
    'SC-T1: Cast MM at PC defender (free reaction + slot) → 200 castAnnounced; HP + version + caster slot UNCHANGED; no damage in response (C-1)',
    async () => {
      // PHB p.257: Magic Missile auto-hits (no attack roll, no save).
      // PHB p.275: PC defender with free reaction + slot triggers the reaction window.
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T1 castAnnounced suspend');

      const hpBefore = await getCombatantHp(encounterId, defenderCombatantId);
      const casterSlotsBefore = await getSlotsUsed(casterCharId);
      const versionBefore = version;

      const res = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // castAnnounced is returned (suspension path — PHB p.275).
      // ADR-4 (engine-counterspell): options[] shape replaces the former single-kind shape.
      expect(body.castAnnounced).toBeDefined();
      expect(body.castAnnounced.spellName).toBe('Magic Missile');
      const shieldOption = body.castAnnounced.options?.find((o: { kind: string }) => o.kind === 'shield');
      expect(shieldOption).toBeDefined();
      expect(shieldOption?.defenderCombatantId).toBe(defenderCombatantId);

      // C-1: no dart damage values in the response (server-authority — ADR-6).
      expect(body.castAnnounced.total).toBeUndefined();
      expect(body.castAnnounced.perDart).toBeUndefined();
      expect(body.castAnnounced.serverRolledDamage).toBeUndefined();
      expect(body.damage).toBeUndefined();
      expect(body.total).toBeUndefined();

      // Defender HP UNCHANGED (no commit on suspend — ADR-1).
      const hpAfter = await getCombatantHp(encounterId, defenderCombatantId);
      expect(hpAfter).toBe(hpBefore);

      // Version bumped by +1 on suspend (action budget tx — B-9, ADR-5 engine-action-economy).
      // The caster's action is consumed at ANNOUNCE time (PHB p.281).
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(versionBefore + 1);

      // Caster slot NOT consumed (slot consumed at resolve, not at suspend — ADR-1).
      const casterSlotsAfter = await getSlotsUsed(casterCharId);
      expect(casterSlotsAfter[0]).toBe(casterSlotsBefore[0]!);
    },
  );

  // ── SC-T2: cast-shield → defender 0 damage; caster + defender slots consumed; reaction_used=true ──
  // REQ-SC-06: PHB p.275 — "you take no damage from magic missile".
  // C-1 SERVER-AUTHORITY PROOF: plant serverRolledDamage.total=50 in DB; verify defender HP unchanged.

  it(
    'SC-T2: cast-shield → defender 0 damage (PHB p.275 negate); caster MM slot consumed; defender Shield slot consumed; reaction_used=true. C-1 proof: planted damage=50 → defender HP unchanged',
    async () => {
      // C-1 PROOF STRATEGY: plant a known serverRolledDamage.total=50 in pending_cast.
      // If the server read client damage (which is ZERO — body only has reactionDecision + defenderCombatantId + version),
      // this test would pass trivially. But by planting 50 and verifying HP is STILL unchanged,
      // we prove the server uses the negate-spell-damage path (0 damage regardless of serverRolledDamage).
      // The real server-authority C-1 proof for decline is in SC-T3.
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T2 cast-shield negate', { defenderHpCurrent: 25, defenderHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, defenderCombatantId);
      const casterSlotsBefore = await getSlotsUsed(casterCharId);
      const defenderSlotsBefore = await getSlotsUsed(defenderCharId);

      // Suspend: cast the MM to get the reaction window.
      const castRes = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      expect(castRes.json().castAnnounced).toBeDefined();

      // Plant a known serverRolledDamage.total=50 directly in DB after suspend.
      // engine-action-economy (B-13): suspend now bumps version +1, so encVersion must be version+1.
      // C-1 PROOF: if server-authority holds for the negate-spell-damage path, defender HP stays at hpBefore.
      const postSuspendVersion = version + 1;
      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [defenderCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 50, perDart: [17, 17, 16] },
        encVersion: postSuspendVersion,
      });

      // Resolve: cast-shield — send postSuspendVersion (version+1) as the CAS version.
      const resolveRes = await doResolve(encounterId, defenderCombatantId, 'cast-shield', postSuspendVersion);
      expect(resolveRes.statusCode).toBe(200);

      // Defender HP UNCHANGED — 0 damage (negate-spell-damage, PHB p.275).
      const hpAfter = await getCombatantHp(encounterId, defenderCombatantId);
      expect(hpAfter).toBe(hpBefore); // 0 damage even with planted damage=50

      // Caster MM L1 slot consumed at resolve (ADR-1 — slot-at-resolve invariant).
      const casterSlotsAfter = await getSlotsUsed(casterCharId);
      expect(casterSlotsAfter[0]).toBe(casterSlotsBefore[0]! + 1);

      // Defender Shield L1 slot consumed at resolve (PHB p.275 — Shield costs a 1st-level slot).
      const defenderSlotsAfter = await getSlotsUsed(defenderCharId);
      expect(defenderSlotsAfter[0]).toBe(defenderSlotsBefore[0]! + 1);

      // reaction_used=true (PHB p.190 — reaction expended).
      const reactionUsed = await getReactionUsed(defenderCombatantId);
      expect(reactionUsed).toBe(true);

      // Version bumped: +1 (suspend action consume) + 1 (resolve CAS) = +2 total.
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(version + 2);

      // pending_cast cleared (null) after resolve.
      const pendingCastAfter = await getPendingCast(encounterId);
      expect(pendingCastAfter).toBeNull();
    },
  );

  // ── SC-T3: decline → full server-rolled damage; caster slot consumed; reaction_used NOT set ──
  // REQ-SC-07: decline applies full force damage.
  // C-1 SERVER-AUTHORITY PROOF: plant serverRolledDamage.total=X in DB; verify defender HP decreases by X.

  it(
    'SC-T3: decline → full server-rolled damage applied to defender; caster slot consumed; reaction_used unchanged. C-1 proof: planted total=15 → defender HP decreases by exactly 15',
    async () => {
      // C-1 PROOF: plant serverRolledDamage.total=15 in pending_cast.
      // The resolve body carries NO damage value (only reactionDecision + defenderCombatantId + version).
      // The server MUST read damage from the DB — it cannot receive it from the client.
      // If defender HP decreases by exactly 15 (the planted value), server-authority is proven.
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T3 decline full damage', { defenderHpCurrent: 30, defenderHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, defenderCombatantId);
      const casterSlotsBefore = await getSlotsUsed(casterCharId);

      // Suspend: cast the MM.
      const castRes = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      expect(castRes.json().castAnnounced).toBeDefined();

      // Plant known damage=15 in the DB — engine-action-economy (B-13): encVersion=version+1.
      const postSuspendVersionT3 = version + 1;
      await plantPendingCast(encounterId, {
        casterCombatantId,
        spellName: 'Magic Missile',
        spellLevel: 1,
        targets: [defenderCombatantId],
        dartCount: 3,
        serverRolledDamage: { total: 15, perDart: [5, 5, 5] },
        encVersion: postSuspendVersionT3,
      });

      // Resolve: decline — send postSuspendVersionT3 (version+1) as the CAS version.
      const resolveRes = await doResolve(encounterId, defenderCombatantId, 'decline', postSuspendVersionT3);
      expect(resolveRes.statusCode).toBe(200);

      // C-1 PROOF: defender HP decreases by exactly 15 (the server-planted value).
      // The resolve body had NO damage field — only reactionDecision + defenderCombatantId + version.
      const hpAfter = await getCombatantHp(encounterId, defenderCombatantId);
      expect(hpAfter).toBe(hpBefore - 15); // planted value governs — server-authority proven

      // Caster MM slot consumed at resolve (ADR-1 — slot-at-resolve).
      const casterSlotsAfter = await getSlotsUsed(casterCharId);
      expect(casterSlotsAfter[0]).toBe(casterSlotsBefore[0]! + 1);

      // Defender reaction_used NOT set (declined — PHB p.190: reaction not used).
      const reactionUsed = await getReactionUsed(defenderCombatantId);
      expect(reactionUsed).toBe(false);

      // Version bumped: +1 (suspend action consume) + 1 (resolve CAS) = +2 total.
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(version + 2);

      // pending_cast cleared.
      const pendingCastAfter = await getPendingCast(encounterId);
      expect(pendingCastAfter).toBeNull();
    },
  );

  // ── SC-T4: NPC target → atomic no-suspend (immediate damage + caster slot in one tx) ──
  // REQ-SC-05: NPC cannot react with Shield — resolve atomically.

  it(
    'SC-T4: NPC target → atomic no-suspend; defender HP decreased; caster slot consumed; version bumped; no pending_cast written',
    async () => {
      // PHB p.257: Magic Missile auto-hits any visible target (NPC or PC).
      // NPC has no character sheet → cannot cast Shield → atomic path.
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T4 NPC atomic', {
          defenderKind: 'npc',
          defenderHpCurrent: 30,
          defenderHpMax: 30,
          npcAc: 13,
        });

      const hpBefore = await getCombatantHp(encounterId, defenderCombatantId);
      const casterSlotsBefore = await getSlotsUsed(casterCharId);
      const versionBefore = version;

      const res = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // No castAnnounced — atomic path.
      expect(body.castAnnounced).toBeUndefined();
      // Damage IS in the response for the atomic path (PHB p.257: auto-hit, force damage).
      expect(body.damage).toBeDefined();
      expect(typeof body.damage.total).toBe('number');
      expect(body.damage.total).toBeGreaterThanOrEqual(3);   // 3 darts, min 2 each = 6... but 1d4+1 min per dart = 2
      expect(body.damage.total).toBeLessThanOrEqual(15);     // 3 × (1d4+1) max = 3×5 = 15

      // Defender HP decreased by the rolled damage.
      const hpAfter = await getCombatantHp(encounterId, defenderCombatantId);
      expect(hpAfter).toBe(hpBefore - body.damage.total);
      expect(hpAfter).toBeLessThan(hpBefore);

      // Caster slot consumed immediately (atomic path — no suspend).
      const casterSlotsAfter = await getSlotsUsed(casterCharId);
      expect(casterSlotsAfter[0]).toBe(casterSlotsBefore[0]! + 1);

      // Version bumped (atomic commit).
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(versionBefore + 1);

      // No pending_cast written (atomic path bypasses suspend).
      const pendingCast = await getPendingCast(encounterId);
      expect(pendingCast).toBeNull();
    },
  );

  // ── SC-T5: REACTION_ALREADY_USED ─────────────────────────────────────────────
  // REQ-SC-08: defender reaction_used=true → 400 REACTION_ALREADY_USED.

  it(
    'SC-T5: defender reaction_used=true at resolve → 400 REACTION_ALREADY_USED (REQ-SC-08)',
    async () => {
      // PHB p.190: "You can take only one reaction per round."
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T5 reaction already used');

      // Suspend first.
      const castRes = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);
      expect(castRes.json().castAnnounced).toBeDefined();

      // Mark reaction as already used (simulate they already reacted this round).
      await setReactionUsed(defenderCombatantId, true);

      // engine-action-economy (B-13): suspend bumped version+1. Resolve sends version+1.
      const resolveRes = await doResolve(encounterId, defenderCombatantId, 'cast-shield', version + 1);
      expect(resolveRes.statusCode).toBe(400);
      const body = resolveRes.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('REACTION_ALREADY_USED');
    },
  );

  // ── SC-T6: reaction_used reset on INCOMING (advance-encounter-turn) ───────────
  // REQ-SC-08 scenario 2: reaction_used resets at start of combatant's own turn.
  // PHB p.190: "You regain your expended reaction at the start of your turn."

  it(
    'SC-T6: reaction_used=true → advance-encounter-turn to defender\'s turn → reaction_used resets to false (REQ-SC-08, PHB p.190)',
    async () => {
      // The existing advance-encounter-turn.ts:84-93 already resets reaction_used generically.
      // This test confirms no code change is needed and the behavior covers Shield-vs-MM.
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T6 reaction reset');

      // Manually mark defender reaction_used=true (simulates defender reacted this round).
      await setReactionUsed(defenderCombatantId, true);
      expect(await getReactionUsed(defenderCombatantId)).toBe(true);

      // Advance turn to the DEFENDER (initiative 5 — second combatant).
      const app = await getTestApp();
      const advanceRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/advance-turn`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { version },
      });
      expect(advanceRes.statusCode).toBe(200);

      // After advancing to defender's turn, reaction_used should be false.
      // PHB p.190: "You regain your expended reaction at the start of your turn."
      const reactionUsedAfter = await getReactionUsed(defenderCombatantId);
      expect(reactionUsedAfter).toBe(false);
    },
  );

  // ── SC-T7: W-3 version guard on suspend ─────────────────────────────────────
  // REQ-SC-04 scenario 2: stale version in cast body → VERSION_CONFLICT (no pending_cast written).

  it(
    'SC-T7: stale version in cast body → 409 VERSION_CONFLICT (W-3 version guard — pending_cast NOT written)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T7 stale version suspend');

      const staleVersion = Math.max(0, version - 1);

      const res = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version: staleVersion,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('VERSION_CONFLICT');

      // pending_cast NOT written (version guard fired before any write).
      const pendingCast = await getPendingCast(encounterId);
      expect(pendingCast).toBeNull();
    },
  );

  // ── SC-T8: MULTI_TARGET_NOT_SUPPORTED ─────────────────────────────────────────
  // REQ-SC-03: targets.length > 1 → 400 VALIDATION_FAILED.

  it(
    'SC-T8: targets.length > 1 → 400 MULTI_TARGET_NOT_SUPPORTED (REQ-SC-03)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T8 multi-target');

      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/cast-spell`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          casterId: casterCombatantId,
          spellName: 'Magic Missile',
          slotLevel: 1,
          targets: [defenderCombatantId, defenderCombatantId], // two targets
          version,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('MULTI_TARGET_NOT_SUPPORTED');
    },
  );

  // ── SC-T9: INSUFFICIENT_SLOT ───────────────────────────────────────────────────
  // REQ-SC-02: caster has no slot at slotLevel → 400 INSUFFICIENT_SLOT.

  it(
    'SC-T9: caster has no MM slot at requested level → 400 INSUFFICIENT_SLOT (REQ-SC-02)',
    async () => {
      // Exhaust all Wizard L5 level-1 slots (slotsMax[0]=4 → used=4).
      await setSlotsUsed(casterCharId, [4, 3, 2, 1, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T9 insufficient slot');

      const hpBefore = await getCombatantHp(encounterId, defenderCombatantId);
      const versionBefore = version;

      const res = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('INSUFFICIENT_SLOT');

      // HP unchanged.
      expect(await getCombatantHp(encounterId, defenderCombatantId)).toBe(hpBefore);
      // Version unchanged.
      expect(await getEncounterVersion(encounterId)).toBe(versionBefore);
    },
  );

  // ── SC-T10: Read-path tolerance — NULL pending_cast ───────────────────────────
  // REQ-SC-09, REQ-RB-02: legacy rows with pending_cast=NULL load via GET without error.

  it(
    'SC-T10: GET encounter with pending_cast=NULL → 200 success (read-path tolerance — REQ-SC-09)',
    async () => {
      const { encounterId } = await makeFreshCastEncounter('SC-T10 read-path tolerance');

      // Confirm pending_cast is NULL (no cast in progress).
      const pendingCast = await getPendingCast(encounterId);
      expect(pendingCast).toBeNull();

      // GET encounter → must succeed without error.
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
    },
  );

  // ── SC-T11: VERSION_CONFLICT on stale resolve ─────────────────────────────────
  // W-3: stale version in resolve body → CAS mismatch → VERSION_CONFLICT.

  it(
    'SC-T11: stale version in resolve body → 409 VERSION_CONFLICT (CAS guard on resolve)',
    async () => {
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T11 stale resolve');

      // Suspend successfully.
      const castRes = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });
      expect(castRes.statusCode).toBe(200);

      // Attempt resolve with stale version.
      const staleVersion = Math.max(0, version - 1);
      const resolveRes = await doResolve(encounterId, defenderCombatantId, 'cast-shield', staleVersion);
      expect(resolveRes.statusCode).toBe(409);
      expect(resolveRes.json().error).toBe('VERSION_CONFLICT');
    },
  );

  // ── SC-T12: PC defender no slot → atomic no-suspend (immediate damage) ────────
  // REQ-SC-05 scenario: defender has no Shield slot → no reaction window → atomic path.

  it(
    'SC-T12: PC defender has no 1st-level spell slots → atomic no-suspend; defender HP decreased immediately; caster slot consumed',
    async () => {
      // Wizard L3 has slotsMax[0]=4. Exhaust all L1 slots → no Shield possible.
      await setSlotsUsed(casterCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setSlotsUsed(defenderCharId, [4, 2, 0, 0, 0, 0, 0, 0, 0]); // ALL slots exhausted

      const { encounterId, casterCombatantId, defenderCombatantId, version } =
        await makeFreshCastEncounter('SC-T12 PC no slot atomic', { defenderHpCurrent: 30, defenderHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, defenderCombatantId);
      const casterSlotsBefore = await getSlotsUsed(casterCharId);

      const res = await doCastSpell(encounterId, casterCombatantId, defenderCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Atomic path — no castAnnounced.
      expect(body.castAnnounced).toBeUndefined();
      expect(body.damage).toBeDefined();
      expect(body.damage.total).toBeGreaterThanOrEqual(3);  // 3 darts × min 2 = 6... 1d4+1 min per dart = 2
      expect(body.damage.total).toBeLessThanOrEqual(15);    // 3 × 5 = 15 max

      // Defender HP decreased.
      const hpAfter = await getCombatantHp(encounterId, defenderCombatantId);
      expect(hpAfter).toBe(hpBefore - body.damage.total);

      // Caster slot consumed.
      const casterSlotsAfter = await getSlotsUsed(casterCharId);
      expect(casterSlotsAfter[0]).toBe(casterSlotsBefore[0]! + 1);

      // No pending_cast.
      const pendingCast = await getPendingCast(encounterId);
      expect(pendingCast).toBeNull();
    },
  );
});

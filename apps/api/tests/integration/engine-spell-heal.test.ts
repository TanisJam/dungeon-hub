/**
 * Integration tests — engine-spell-heal (Cure Wounds / Healing Word, PHB p.230 / p.250).
 *
 * Verifies POST /encounters/:id/actions/heal (perform-spell-heal use-case).
 *
 * PHB p.197 — "Regaining Hit Points":
 *   "You can't regain hit points above your hit point maximum."
 * PHB p.230 — Cure Wounds: 1d8 + spellcasting modifier per slot level.
 * PHB p.250 — Healing Word: 1d4 + spellcasting modifier per slot level.
 *
 * Healer: Cleric L5, WIS 16 (+3 spellcasting mod).
 * Target seeded with hpCurrent < hpMax for happy-path tests.
 *
 * Tests:
 *   SH-T1:  Cleric heals target below max → hpCurrent rises, slot consumed, version bumped
 *   SH-T2:  Heal exceeds max → hpCurrent clamped to hpMax, healed=effective delta, slot consumed
 *   SH-T3:  Target at full HP → healed=0, slot STILL consumed, version STILL bumped (REQ-H-07)
 *   SH-T4:  Healing Word (1d4) → correct dice in response
 *   SH-T5:  Heal from 0 HP → newHp positive
 *   SH-T6:  Self-heal (healer === target) → works (REQ-H-12)
 *   SH-T7:  NPC healer → 400 HEALER_NOT_SPELLCASTER (REQ-H-09)
 *   SH-T8:  Slot unavailable → 400 SLOT_NOT_AVAILABLE, HP+slot+version unchanged (REQ-H-06)
 *   SH-T9:  Not healer's turn → 409 NOT_YOUR_TURN, nothing committed (REQ-H-11)
 *   SH-T10: Version conflict → 409 VERSION_CONFLICT, HP+slot unchanged (REQ-H-14)
 *   SH-T11: NPC target → hp_current updated in encounter_combatants (REQ-H-13)
 *   SH-T12: Cure Wounds upcast at slot 3 → dice='3d8', rolled in [6..27] (REQ-H-02 upcast scenario)
 *   SH-T13: Healing Word upcast at slot 2 → dice='2d4', rolled in [5..11] (REQ-H-03 upcast scenario)
 *   SH-T14: PC Fighter (non-spellcaster) healer → 400 HEALER_NOT_SPELLCASTER (REQ-H-09 PC path)
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-spell-heal — POST /encounters/:id/actions/heal', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // Cleric L5, WIS 16 (+3 spellcasting mod). Full-caster slotsMax = [4,3,2,1,0,0,0,0,0].
  let clericCharId: string;

  // Fighter L5 (non-spellcaster) for HEALER_NOT_SPELLCASTER test.
  let fighterCharId: string;

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

  /** Read HP of a specific combatant via GET encounter. */
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

  /**
   * Create a fresh encounter: Cleric healer (current combatant) vs a target.
   * Returns { encounterId, healerCombatantId, targetCombatantId, version }.
   */
  const makeFreshHealEncounter = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    name: string,
    opts: {
      targetHpCurrent?: number;
      targetHpMax?: number;
      healerCharId?: string;
      healerKind?: 'pc' | 'npc';
    } = {},
  ) => {
    const hpCurrent = opts.targetHpCurrent ?? 10;
    const hpMax = opts.targetHpMax ?? 30;
    const healerKind = opts.healerKind ?? 'pc';
    const healerCharId = opts.healerCharId ?? clericCharId;

    const healerCombatant =
      healerKind === 'pc'
        ? { name: 'Cleric', kind: 'pc' as const, characterId: healerCharId, initiative: 20, hpCurrent: 38, hpMax: 38 }
        : { name: 'NPC Healer', kind: 'npc' as const, initiative: 20, hpCurrent: 20, hpMax: 20, ac: 12 };

    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name,
          combatants: [
            healerCombatant,
            { name: 'Target', kind: 'npc', initiative: 5, hpCurrent, hpMax, ac: 10 },
          ],
        },
      })
      .then((r) => r.json());

    const healerCombatantId = enc.currentCombatantId as string;
    const targetCombatantId =
      (enc.combatants.find((c: { id: string }) => c.id !== healerCombatantId)?.id as string) ?? '';

    return {
      encounterId: enc.id as string,
      healerCombatantId,
      targetCombatantId,
      version: enc.version as number,
    };
  };

  /** POST /encounters/:id/actions/heal helper. */
  const doHeal = async (
    encounterId: string,
    healerCombatantId: string,
    targetCombatantId: string,
    opts: {
      spellName?: 'Cure Wounds' | 'Healing Word';
      slotLevel?: number;
      version: number;
    },
  ) => {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/heal`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        healerCombatantId,
        targetCombatantId,
        spellName: opts.spellName ?? 'Cure Wounds',
        slotLevel: opts.slotLevel ?? 1,
        version: opts.version,
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
        payload: { name: 'Spell Heal Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id as string;
    worldId = campaign.worldId as string;

    // ── Cleric L5: WIS 16 (+3 spellcasting mod), full-caster slots ───────────────
    // PHB Cleric L5 slots: slotsMax = [4,3,2,1,0,0,0,0,0] (PHB p.57 table).
    // WIS 16 → score 16 → abilityModifier(16) = +3.
    const clericChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Cleric (heal test)' },
      })
      .then((r) => r.json());
    clericCharId = clericChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${clericCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [
            {
              slug: 'cleric',
              source: 'PHB',
              level: 5,
              hitDie: 'd8',
              subclass: null,
              savingThrows: ['wis', 'cha'],
              armorProficiencies: [],
              weaponProficiencies: [],
              toolProficiencies: [],
              skillChoices: [],
            },
          ],
          // WIS 16 → spellcasting mod +3. STR 10, DEX 10, CON 14.
          baseStats: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });

    // ── Fighter L5 (non-spellcaster) — for HEALER_NOT_SPELLCASTER test ────────────
    const fighterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Fighter (heal not-spellcaster test)' },
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

    // Guard: fighter has no inventory setup needed (no weapon needed for heal tests)
    await expectOk('fighter-created', { statusCode: 200, body: 'ok' });
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── SH-T1: Cleric heals target below max → HP rises, slot consumed, version bumped ─
  // REQ-H-01, REQ-H-05, REQ-H-06, REQ-H-14.

  it(
    'SH-T1: Cleric Cure Wounds (slot 1) on target below max → hpCurrent rises by rolled, L1 slot consumed, version bumped',
    async () => {
      // PHB p.230: Cure Wounds → 1d8 + WIS mod (+3). Min total = 4 (1+3), max = 11 (8+3).
      // Target seeded at hpCurrent=10, hpMax=30 → room to heal without capping.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T1 heal below max', { targetHpCurrent: 10, targetHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, targetCombatantId);
      const versionBefore = version;

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Response shape (ADR-5).
      expect(body.spell).toBe('Cure Wounds');
      expect(body.slotLevel).toBe(1);
      expect(body.dice).toBe('1d8');
      expect(typeof body.rolled).toBe('number');
      expect(body.rolled).toBeGreaterThanOrEqual(4);  // 1d8 min=1 + WIS mod 3 = 4
      expect(body.rolled).toBeLessThanOrEqual(11);    // 1d8 max=8 + WIS mod 3 = 11
      expect(body.healed).toBe(body.rolled);          // no clamping — target below max
      expect(body.newHp).toBe(hpBefore + body.rolled);
      expect(body.perDie).toBeDefined();

      // HP actually updated in DB.
      const hpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(hpAfter).toBe(body.newHp);
      expect(hpAfter).toBeGreaterThan(hpBefore);

      // L1 slot consumed (index 0).
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter[0]).toBe(1);

      // Version bumped.
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(versionBefore + 1);
    },
  );

  // ── SH-T2: Heal exceeds max → clamped to hpMax, healed=effective delta, slot consumed ─
  // REQ-H-01, REQ-H-07.

  it(
    'SH-T2: Cure Wounds heal exceeds hpMax → hpCurrent clamped to hpMax, healed=effective delta (< rolled), slot still consumed',
    async () => {
      // PHB p.197: clamp. Seed target at hpCurrent=28, hpMax=30 → total will overflow.
      // Cleric WIS 16 → min roll=4 → 28+4=32 > 30. Clamp → 30. healed=2.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T2 heal exceeds max', { targetHpCurrent: 28, targetHpMax: 30 });

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // HP clamped at max.
      expect(body.newHp).toBe(30);
      // healed = effective delta (clamped — less than rolled when total > remaining HP).
      expect(body.healed).toBeLessThanOrEqual(body.rolled);
      expect(body.healed).toBe(30 - 28);  // effective = hpMax - hpBefore = 2

      // Slot still consumed (slot expended on cast, regardless of effect — PHB).
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter[0]).toBe(1);

      // HP actually in DB.
      const hpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(hpAfter).toBe(30);
    },
  );

  // ── SH-T3: Target at full HP → healed=0, slot STILL consumed, version bumped ───
  // REQ-H-07: slot expended on cast regardless of HP no-op.

  it(
    'SH-T3: target at full HP → healed=0, slot STILL consumed, version STILL bumped (REQ-H-07)',
    async () => {
      // PHB: casting expends the slot regardless of the spell's effect.
      // Target: hpCurrent=30=hpMax → applyHealing(30, N, 30) = 30. healed = 0.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T3 full HP no-op', { targetHpCurrent: 30, targetHpMax: 30 });

      const slotsBefore = await getSlotsUsed(clericCharId);
      const versionBefore = version;

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Effective HP delta is zero.
      expect(body.healed).toBe(0);
      expect(body.newHp).toBe(30);

      // Slot STILL consumed (REQ-H-07 — cast occurred).
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter[0]).toBe(slotsBefore[0]! + 1);

      // Version STILL bumped.
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(versionBefore + 1);
    },
  );

  // ── SH-T4: Healing Word (1d4) → correct dice in response ────────────────────
  // REQ-H-03: Healing Word dice = slotLevel × d4.

  it(
    'SH-T4: Healing Word slot 1 → dice=1d4, rolled in [4..7] (1d4 min=1 + WIS mod 3 = 4)',
    async () => {
      // PHB p.250: Healing Word → 1d4 + spellcasting modifier per slot level.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T4 Healing Word', { targetHpCurrent: 10, targetHpMax: 30 });

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        spellName: 'Healing Word',
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.spell).toBe('Healing Word');
      expect(body.dice).toBe('1d4');
      expect(body.rolled).toBeGreaterThanOrEqual(4);  // 1d4 min=1 + WIS mod 3
      expect(body.rolled).toBeLessThanOrEqual(7);     // 1d4 max=4 + WIS mod 3
    },
  );

  // ── SH-T5: Heal from 0 HP → newHp positive ───────────────────────────────────
  // REQ-H-08: creature at 0 HP regains HP.

  it(
    'SH-T5: heal from 0 HP → newHp positive (PHB p.197)',
    async () => {
      // PHB p.197: creature healed at 0 HP regains HP and consciousness.
      // Death-save reset NOT done in V1 (REQ-H-08 known gap).
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T5 heal from 0 HP', { targetHpCurrent: 0, targetHpMax: 30 });

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.newHp).toBeGreaterThan(0);
      expect(body.healed).toBe(body.rolled);  // no clamping from 0

      const hpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(hpAfter).toBeGreaterThan(0);
    },
  );

  // ── SH-T6: Self-heal (healer === target) → works ─────────────────────────────
  // REQ-H-12: PHB allows self-heal for both Cure Wounds and Healing Word.

  it(
    'SH-T6: self-heal (healerCombatantId === targetCombatantId) → succeeds, HP updated (REQ-H-12)',
    async () => {
      // PHB: Cure Wounds "a creature you touch" (includes self).
      // Self-heal: target and healer are the SAME combatant.
      // hp_current in encounter_combatants updated; slot in characters updated — different tables, safe.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T6 self heal', { targetHpCurrent: 10, targetHpMax: 30 });

      // Use the HEALER combatant as the target (hpCurrent=38, hpMax=38 seeded in beforeAll fixture).
      // Actually we use a fresh encounter where the healer combatant is the target.
      // Let's modify: seed healer HP below max so self-heal changes HP.
      // Create a custom encounter: healer is PC at low HP, target = healer.
      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'SH-T6 self heal custom',
            combatants: [
              { name: 'Cleric-Self', kind: 'pc', characterId: clericCharId, initiative: 20, hpCurrent: 15, hpMax: 38 },
              { name: 'Dummy NPC', kind: 'npc', initiative: 5, hpCurrent: 10, hpMax: 10, ac: 10 },
            ],
          },
        })
        .then((r) => r.json());

      const selfCombatantId = enc.currentCombatantId as string;
      const hpBefore = await getCombatantHp(enc.id as string, selfCombatantId);

      const res = await doHeal(enc.id as string, selfCombatantId, selfCombatantId, {
        spellName: 'Cure Wounds',
        slotLevel: 1,
        version: enc.version as number,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.newHp).toBeGreaterThan(hpBefore);

      const hpAfter = await getCombatantHp(enc.id as string, selfCombatantId);
      expect(hpAfter).toBe(body.newHp);
    },
  );

  // ── SH-T7: NPC healer → 400 HEALER_NOT_SPELLCASTER ─────────────────────────
  // REQ-H-09: healer must be a PC spellcaster.

  it(
    'SH-T7: NPC healer combatant → 400 HEALER_NOT_SPELLCASTER, HP+slot unchanged (REQ-H-09)',
    async () => {
      // NPC combatant has no characterId → cannot derive spellcasting sheet.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T7 NPC healer', { healerKind: 'npc' });

      const hpBefore = await getCombatantHp(encounterId, targetCombatantId);

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('HEALER_NOT_SPELLCASTER');

      // HP unchanged.
      expect(await getCombatantHp(encounterId, targetCombatantId)).toBe(hpBefore);
    },
  );

  // ── SH-T8: Slot unavailable → 400 SLOT_NOT_AVAILABLE ────────────────────────
  // REQ-H-06: fail-fast pre-roll, nothing committed.

  it(
    'SH-T8: slot unavailable at asserted level → 400 SLOT_NOT_AVAILABLE, HP+slot+version unchanged (REQ-H-06)',
    async () => {
      // Cleric L5 has 4 L1 slots. Seed all L1 slots used (index 0 = 4 used).
      const app = await getTestApp();
      // Exhaust all L1 slots (slotsMax[0]=4 for Cleric L5).
      await setSlotsUsed(clericCharId, [4, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T8 slot unavailable', { targetHpCurrent: 10, targetHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, targetCombatantId);
      const slotsBefore = await getSlotsUsed(clericCharId);
      const versionBefore = version;

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('SLOT_NOT_AVAILABLE');

      // HP unchanged.
      expect(await getCombatantHp(encounterId, targetCombatantId)).toBe(hpBefore);
      // Slots unchanged.
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter).toEqual(slotsBefore);
      // Version unchanged.
      const versionAfter = await getEncounterVersion(encounterId);
      expect(versionAfter).toBe(versionBefore);
    },
  );

  // ── SH-T9: Not healer's turn → 409 NOT_YOUR_TURN ─────────────────────────────
  // REQ-H-11: turn guard.

  it(
    'SH-T9: not the healer\'s turn → 409 NOT_YOUR_TURN, nothing committed (REQ-H-11)',
    async () => {
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T9 not your turn', { targetHpCurrent: 10, targetHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, targetCombatantId);

      // Swap: use targetCombatantId as healer (not current combatant).
      const res = await doHeal(encounterId, targetCombatantId, healerCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('NOT_YOUR_TURN');

      // HP unchanged.
      expect(await getCombatantHp(encounterId, targetCombatantId)).toBe(hpBefore);
    },
  );

  // ── SH-T10: Version conflict → 409 VERSION_CONFLICT ─────────────────────────
  // REQ-H-14: CAS atomicity — version mismatch → full rollback.

  it(
    'SH-T10: stale version → 409 VERSION_CONFLICT, HP+slot unchanged (REQ-H-14)',
    async () => {
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T10 version conflict', { targetHpCurrent: 10, targetHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, targetCombatantId);
      const slotsBefore = await getSlotsUsed(clericCharId);

      // Send stale version (version - 1).
      const staleVersion = Math.max(0, version - 1);
      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version: staleVersion,
      });

      // Either pre-check or in-tx CAS fires → 409.
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('VERSION_CONFLICT');

      // HP unchanged.
      expect(await getCombatantHp(encounterId, targetCombatantId)).toBe(hpBefore);
      // Slots unchanged.
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter).toEqual(slotsBefore);
    },
  );

  // ── SH-T11: NPC target heal → hp_current updated (REQ-H-13) ─────────────────
  // NPC combatant (characterId null) may be healed — only encounter_combatants written.

  it(
    'SH-T11: NPC target → hp_current updated in encounter_combatants, slot consumed (REQ-H-13)',
    async () => {
      // REQ-H-13: target may be PC or NPC — only encounter_combatants.hp_current updated.
      // No character sheet write for the target.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      // NPC target seeded at hpCurrent=10, hpMax=30.
      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T11 NPC target', { targetHpCurrent: 10, targetHpMax: 30 });

      const hpBefore = await getCombatantHp(encounterId, targetCombatantId);

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        slotLevel: 1,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.newHp).toBeGreaterThan(hpBefore);

      // HP updated in DB.
      const hpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(hpAfter).toBe(body.newHp);

      // Slot consumed.
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter[0]).toBe(1);
    },
  );

  // ── SH-T12: Cure Wounds upcast slot 3 → dice='3d8' (REQ-H-02 upcast scenario) ──
  // PHB p.230: +1d8 for each slot level above 1st. Slot 3 → 3d8 + WIS mod (+3).
  // Cleric L5 has 2 L3 slots (slotsMax[2]=2). Min rolled = 3+3=6, max = 24+3=27.

  it(
    'SH-T12: Cure Wounds upcast slot 3 → dice=3d8, rolled in [6..27], L3 slot consumed (REQ-H-02 upcast)',
    async () => {
      // PHB p.230: Cure Wounds at a higher slot level — "+1d8 for each slot level above 1st".
      // Slot 3 → 3 dice (3d8 + WIS mod +3). Cleric L5 slotsMax = [4,3,2,0,...] → 2 L3 slots.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T12 Cure Wounds upcast L3', {
          targetHpCurrent: 1,
          targetHpMax: 100,
        });

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        spellName: 'Cure Wounds',
        slotLevel: 3,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // PHB p.230: 3d8 + WIS mod. Cleric WIS 16 → mod +3.
      // Min total = 3×1 + 3 = 6. Max total = 3×8 + 3 = 27.
      expect(body.spell).toBe('Cure Wounds');
      expect(body.slotLevel).toBe(3);
      expect(body.dice).toBe('3d8');
      expect(typeof body.rolled).toBe('number');
      expect(body.rolled).toBeGreaterThanOrEqual(6);   // 3×(d8 min=1) + WIS mod 3
      expect(body.rolled).toBeLessThanOrEqual(27);     // 3×(d8 max=8) + WIS mod 3

      // HP rose (target seeded at 1/100 — no clamping risk at these totals).
      expect(body.healed).toBe(body.rolled);
      expect(body.newHp).toBe(1 + body.rolled);

      // L3 slot consumed (index 2).
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter[2]).toBe(1);

      // HP in DB matches.
      const hpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(hpAfter).toBe(body.newHp);
    },
  );

  // ── SH-T13: Healing Word upcast slot 2 → dice='2d4' (REQ-H-03 upcast scenario) ─
  // PHB p.250: +1d4 for each slot level above 1st. Slot 2 → 2d4 + WIS mod (+3).
  // Cleric L5 has 3 L2 slots (slotsMax[1]=3). Min rolled = 2+3=5, max = 8+3=11.

  it(
    'SH-T13: Healing Word upcast slot 2 → dice=2d4, rolled in [5..11], L2 slot consumed (REQ-H-03 upcast)',
    async () => {
      // PHB p.250: Healing Word at a higher slot level — "+1d4 for each slot level above 1st".
      // Slot 2 → 2 dice (2d4 + WIS mod +3). Cleric L5 slotsMax = [4,3,2,0,...] → 3 L2 slots.
      const app = await getTestApp();
      await setSlotsUsed(clericCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const { encounterId, healerCombatantId, targetCombatantId, version } =
        await makeFreshHealEncounter(app, 'SH-T13 Healing Word upcast L2', {
          targetHpCurrent: 1,
          targetHpMax: 50,
        });

      const res = await doHeal(encounterId, healerCombatantId, targetCombatantId, {
        spellName: 'Healing Word',
        slotLevel: 2,
        version,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // PHB p.250: 2d4 + WIS mod. Cleric WIS 16 → mod +3.
      // Min total = 2×1 + 3 = 5. Max total = 2×4 + 3 = 11.
      expect(body.spell).toBe('Healing Word');
      expect(body.slotLevel).toBe(2);
      expect(body.dice).toBe('2d4');
      expect(typeof body.rolled).toBe('number');
      expect(body.rolled).toBeGreaterThanOrEqual(5);   // 2×(d4 min=1) + WIS mod 3
      expect(body.rolled).toBeLessThanOrEqual(11);     // 2×(d4 max=4) + WIS mod 3

      // HP rose (target at 1/50 — no clamping).
      expect(body.healed).toBe(body.rolled);
      expect(body.newHp).toBe(1 + body.rolled);

      // L2 slot consumed (index 1).
      const slotsAfter = await getSlotsUsed(clericCharId);
      expect(slotsAfter[1]).toBe(1);

      // HP in DB matches.
      const hpAfter = await getCombatantHp(encounterId, targetCombatantId);
      expect(hpAfter).toBe(body.newHp);
    },
  );

  // ── SH-T14: Fighter PC (no spellcasting class) → 400 HEALER_NOT_SPELLCASTER ──
  // REQ-H-09: PC with no class in SPELLCASTING_ABILITY → rejected.
  // This exercises the SECOND branch of the guard (classes.find(c => SPELLCASTING_ABILITY[c.slug])
  // returns undefined) — distinct from SH-T7 (NPC healer / characterId null branch).

  it(
    'SH-T14: Fighter PC healer (no spellcasting class) → 400 HEALER_NOT_SPELLCASTER (REQ-H-09 PC path)',
    async () => {
      // REQ-H-09: "where no class in the healer's sheet appears in SPELLCASTING_ABILITY".
      // Fighter has no spellcasting class — computeSpellSlots returns 0 slots and
      // SPELLCASTING_ABILITY['fighter'] is undefined → guard fires.
      const app = await getTestApp();

      // Build a fresh encounter where the FIGHTER is the current combatant (healer).
      const enc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'SH-T14 Fighter healer',
            combatants: [
              {
                name: 'Fighter-Healer',
                kind: 'pc' as const,
                characterId: fighterCharId,
                initiative: 20,
                hpCurrent: 35,
                hpMax: 44,
              },
              { name: 'Injured NPC', kind: 'npc', initiative: 5, hpCurrent: 5, hpMax: 20, ac: 10 },
            ],
          },
        })
        .then((r) => r.json());

      const fighterCombatantId = enc.currentCombatantId as string;
      const targetCombatantId =
        (enc.combatants.find((c: { id: string }) => c.id !== fighterCombatantId)?.id as string) ?? '';
      const version = enc.version as number;

      const hpBefore = await getCombatantHp(enc.id as string, targetCombatantId);

      const res = await doHeal(enc.id as string, fighterCombatantId, targetCombatantId, {
        spellName: 'Cure Wounds',
        slotLevel: 1,
        version,
      });

      // Fighter has no spellcasting class → HEALER_NOT_SPELLCASTER.
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('HEALER_NOT_SPELLCASTER');

      // HP unchanged — no roll occurred.
      expect(await getCombatantHp(enc.id as string, targetCombatantId)).toBe(hpBefore);
    },
  );
});

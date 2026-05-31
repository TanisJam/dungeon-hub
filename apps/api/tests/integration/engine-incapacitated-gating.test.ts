/**
 * Integration tests — engine-incapacitated-gating (Incapacitated action/reaction gate, PHB p.290).
 *
 * PHB p.290 — Incapacitated:
 *   "An incapacitated creature can't take actions or reactions."
 *
 * Gate family: ACTOR_INCAPACITATED (state-gate, no expected/got fields).
 * Server-authority: gate computed from DB-loaded encounter_combatant_conditions; client body ignored.
 * Write-only enforcement: GET encounters with an Incapacitated combatant still return 200.
 *
 * Tests:
 *   INC-T1:  Incapacitated attacker → 400 ACTOR_INCAPACITATED on POST .../attack (REQ-INC-02)
 *   INC-T2:  Healthy attacker passes weapon-attack gate (REQ-INC-02 negative case)
 *   INC-T3:  Incapacitated attacker → 400 ACTOR_INCAPACITATED on POST .../attack/apply (REQ-INC-02)
 *   INC-T4:  Incapacitated caster → 400 ACTOR_INCAPACITATED on POST .../cast-spell (REQ-INC-03)
 *   INC-T5:  Incapacitated healer → 400 ACTOR_INCAPACITATED on POST .../spell-heal (REQ-INC-04)
 *   INC-T6:  Incapacitated defender → 400 ACTOR_INCAPACITATED on POST .../attack/resolve-reaction cast-shield (REQ-INC-05)
 *   INC-T7:  Incapacitated defender → 400 ACTOR_INCAPACITATED on POST .../cast-spell/resolve-reaction cast-shield (REQ-INC-05)
 *   INC-T8:  Incapacitated counterspeller → 400 ACTOR_INCAPACITATED on POST .../cast-spell/resolve-reaction cast-counterspell (REQ-INC-05)
 *   INC-T9:  Incapacitated potential Shield reactor excluded from castAnnounced options (REQ-INC-06, canShield)
 *   INC-T10: Incapacitated potential Counterspell reactor excluded from eligibleCounterspellerIds (REQ-INC-06, canCounter)
 *   INC-T11: Read-path tolerance — GET encounter with Incapacitated combatant → 200 OK (REQ-INC-08)
 *   INC-T12: Server-authority — DB state gates even when client body contains no condition data (REQ-INC-09)
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-incapacitated-gating — Incapacitated action/reaction gate (PHB p.290)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // PC attacker/caster/healer: Wizard L3 (INT 15 → mod+2, spellcasting mod +2).
  // Wizard L3 slotsMax = [4,2,0,0,0,0,0,0,0]. L3 avoids subclass requirement.
  let wizardCharId: string;
  let longswordInstanceId: string;

  // PC defender: Wizard L3 (for Shield reactions, has 1st-level slots).
  // Wizard L3 slotsMax = [4,2,0,0,0,0,0,0,0].
  let defenderCharId: string;

  // PC counterspeller: Wizard L3 (has NO 3rd-level slots at L3).
  // NOTE: Wizard L5 requires subclass. For counterspell tests we need 3rd-level slots.
  // Use Fighter L5 with Eldritch Knight — but simpler: use a different class.
  // Actually we'll use Wizard L1 won't work (no 3rd+ slots), so we use a direct DB
  // approach: set slotsMax via character data manipulation in the test.
  // Simplest: Wizard L3 and manually set slotsMax in test helpers so it has 3rd-level slots.
  let counterspellerCharId: string;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  /** Insert 'Incapacitated' condition directly into encounter_combatant_conditions. */
  const setIncapacitated = async (combatantId: string): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
    await db.insert(encounterCombatantConditions).values({
      combatantId,
      conditionName: 'Incapacitated',
    });
  };

  /** Remove all conditions for a combatant (reset between tests). */
  const clearConditions = async (combatantId: string): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db
      .delete(encounterCombatantConditions)
      .where(eq(encounterCombatantConditions.combatantId, combatantId));
  };

  /** Get encounter version from DB. */
  const getEncounterVersion = async (encounterId: string): Promise<number> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select({ version: encounters.version }).from(encounters).where(eq(encounters.id, encounterId)).limit(1);
    return row?.version ?? -1;
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

  /** Set reactionUsed directly on combatant. */
  const setReactionUsed = async (combatantId: string, value: boolean): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatants } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(encounterCombatants).set({ reactionUsed: value }).where(eq(encounterCombatants.id, combatantId));
  };

  /** Read spellSlotsUsed from DB. */
  const getSlotsUsed = async (charId: string): Promise<number[]> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return new Array(9).fill(0) as number[];
    const data = row.data as Record<string, unknown>;
    return ((data['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0)) as number[];
  };

  /**
   * Inject slotsMax into character data (for test-only setup when the class doesn't
   * natively have 3rd-level slots at the character's level, e.g. Wizard L3).
   * This directly sets `spellSlotsMax` in the character JSONB so `computeSpellSlots`
   * returns the desired value in the use-case. NOTE: `computeSpellSlots` is called
   * from the classes array — we can't override it there. Instead we use a different
   * approach: we manually add a 5th-level wizard to unlock 3rd-level slots via class.
   * For tests that only need the DB-side eligibility check (canCounter), we instead
   * manipulate the character's classes data to be L5 directly in the JSONB.
   */
  const setCharacterLevelInData = async (charId: string, level: number): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return;
    const data = row.data as Record<string, unknown>;
    const classes = data['classes'] as Array<{ slug: string; level: number; source: string }> | undefined;
    if (!classes || classes.length === 0) return;
    const updatedClasses = classes.map((c) => ({ ...c, level }));
    await db.update(characters).set({ data: { ...data, classes: updatedClasses }, updatedAt: new Date() }).where(eq(characters.id, charId));
  };

  /** Set spellSlotsUsed directly on a character (for test setup/reset). */
  const setSlotsUsed = async (charId: string, slotsUsed: number[]): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    if (!row) return;
    const data = row.data as Record<string, unknown>;
    await db.update(characters).set({ data: { ...data, spellSlotsUsed: slotsUsed }, updatedAt: new Date() }).where(eq(characters.id, charId));
  };

  /**
   * Create a fresh encounter: wizard (caster/attacker, highest initiative) vs NPC target vs optional extras.
   * Returns combatant IDs in order.
   */
  const makeFreshEncounter = async (
    name: string,
    extras: Array<{ kind: 'pc' | 'npc'; characterId?: string; name: string; initiative: number; hpCurrent: number; hpMax: number; ac?: number }> = [],
  ) => {
    const app = await getTestApp();
    const combatants = [
      {
        name: 'Wizard (attacker/caster)',
        kind: 'pc' as const,
        characterId: wizardCharId,
        initiative: 20,
        hpCurrent: 30,
        hpMax: 30,
      },
      {
        name: 'Goblin NPC',
        kind: 'npc' as const,
        initiative: 5,
        hpCurrent: 20,
        hpMax: 20,
        ac: 13,
      },
      ...extras,
    ];
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { campaignId, name, combatants },
      })
      .then((r) => r.json());

    const wizardCombatantId = enc.currentCombatantId as string; // wizard has highest initiative (20)
    // Find NPC by kind='npc' (initiative 5)
    const allCombatants = enc.combatants as Array<{ id: string; kind: string; initiative: number }>;
    const npcCombatantId = allCombatants.find((c) => c.id !== wizardCombatantId && c.kind === 'npc')?.id ?? '';
    const extraCombatants = allCombatants.filter(
      (c) => c.id !== wizardCombatantId && c.id !== npcCombatantId,
    );
    return {
      encounterId: enc.id as string,
      wizardCombatantId,
      npcCombatantId,
      extraCombatants,
    };
  };

  // ── Setup ─────────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    // Campaign + world
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Incapacitated Gate Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // ── Wizard L3 (attacker/caster/healer) ────────────────────────────────────
    // INT 15 (+2 spellcasting mod), L3 → slotsMax = [4,2,0,0,0,0,0,0,0].
    // L3 avoids the L2 subclass requirement. Has 1st-level slots for Magic Missile + Cure Wounds.
    const wizard = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Wizard (incapacitated gate test)' },
      })
      .then((r) => r.json());
    wizardCharId = wizard.id;

    await expectOk(
      'wizard-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${wizardCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 8, dex: 12, con: 14, int: 15, wis: 10, cha: 13 },
        },
      }),
    );

    await expectOk(
      'wizard-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${wizardCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'wizard', source: 'PHB' },
          level: 1,
          skillChoices: ['arcana', 'history'],
        },
      }),
    );
    // Boost in data to L3 for slot coverage (slotsMax = [4,2,0,...])
    await setCharacterLevelInData(wizardCharId, 3);

    // Add longsword for weapon-attack tests (wizard will be non-proficient — that's fine, gate fires before proficiency check)
    await expectOk(
      'add-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${wizardCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );
    // Get instanceId from character sheet
    const wizardSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${wizardCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const longsword = wizardSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'longsword',
    );
    longswordInstanceId = longsword?.instanceId ?? '';

    // ── Defender Wizard L3 (Shield reactor) ───────────────────────────────────
    // Has 1st-level slots for Shield. Wizard L3 slotsMax = [4,2,0,0,0,0,0,0,0].
    const defender = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Defender Wizard (incapacitated gate test)' },
      })
      .then((r) => r.json());
    defenderCharId = defender.id;

    await expectOk(
      'defender-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${defenderCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 8, dex: 13, con: 14, int: 15, wis: 10, cha: 12 },
        },
      }),
    );

    await expectOk(
      'defender-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${defenderCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'wizard', source: 'PHB' },
          level: 1,
          skillChoices: ['arcana', 'history'],
        },
      }),
    );
    // Boost in data to L3 for 1st-level Shield slot coverage (slotsMax = [4,2,0,...])
    await setCharacterLevelInData(defenderCharId, 3);

    // ── Counterspeller Wizard L3 ───────────────────────────────────────────────
    // Wizard L3 base slotsMax = [4,2,0,...]. For counterspell tests we need a 3rd-level slot.
    // We'll manually set slotsMax to [4,3,2,...] in INC-T8/T10 test helpers via DB.
    const counterspeller = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Counterspeller Wizard (incapacitated gate test)' },
      })
      .then((r) => r.json());
    counterspellerCharId = counterspeller.id;

    await expectOk(
      'counterspeller-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${counterspellerCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 8, dex: 12, con: 14, int: 15, wis: 10, cha: 13 },
        },
      }),
    );

    await expectOk(
      'counterspeller-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${counterspellerCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'wizard', source: 'PHB' },
          level: 1,
          skillChoices: ['arcana', 'history'],
        },
      }),
    );
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── INC-T1: Incapacitated attacker → 400 on weapon-attack (perform) ──────────

  it(
    'INC-T1: Incapacitated attacker → ACTOR_INCAPACITATED on POST attack (REQ-INC-02, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const { encounterId, wizardCombatantId, npcCombatantId } = await makeFreshEncounter('INC-T1 incap attacker attack');
      await setIncapacitated(wizardCombatantId);

      const versionBefore = await getEncounterVersion(encounterId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: wizardCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('ACTOR_INCAPACITATED');

      // Read-path: version unchanged (no mutation on gate refusal)
      expect(await getEncounterVersion(encounterId)).toBe(versionBefore);

      await clearConditions(wizardCombatantId);
    },
  );

  // ── INC-T2: Healthy attacker passes weapon-attack gate ────────────────────────

  it(
    'INC-T2: Healthy attacker passes weapon-attack gate (REQ-INC-02 negative case)',
    async () => {
      const app = await getTestApp();
      const { encounterId, wizardCombatantId, npcCombatantId } = await makeFreshEncounter('INC-T2 healthy attacker');
      // No Incapacitated condition set

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: wizardCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      // Should get 200 (gate does not fire)
      expect(res.statusCode).toBe(200);
      expect(res.json().toHit).toBeDefined();
    },
  );

  // ── INC-T3: Incapacitated attacker → 400 on attack/apply ─────────────────────

  it(
    'INC-T3: Incapacitated attacker → ACTOR_INCAPACITATED on POST attack/apply (REQ-INC-02, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const { encounterId, wizardCombatantId, npcCombatantId } = await makeFreshEncounter('INC-T3 incap attacker apply');
      await setIncapacitated(wizardCombatantId);

      const version = await getEncounterVersion(encounterId);
      const hpBefore = await getCombatantHp(encounterId, npcCombatantId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: wizardCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
          version,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('ACTOR_INCAPACITATED');

      // No damage: HP and version unchanged
      expect(await getCombatantHp(encounterId, npcCombatantId)).toBe(hpBefore);
      expect(await getEncounterVersion(encounterId)).toBe(version);

      await clearConditions(wizardCombatantId);
    },
  );

  // ── INC-T4: Incapacitated caster → 400 on cast-spell ─────────────────────────

  it(
    'INC-T4: Incapacitated caster → ACTOR_INCAPACITATED on POST cast-spell (REQ-INC-03, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const { encounterId, wizardCombatantId, npcCombatantId } = await makeFreshEncounter('INC-T4 incap caster');
      await setIncapacitated(wizardCombatantId);

      const version = await getEncounterVersion(encounterId);
      const slotsBefore = await getSlotsUsed(wizardCharId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/cast-spell`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          casterId: wizardCombatantId,
          spellName: 'Magic Missile',
          slotLevel: 1,
          targets: [npcCombatantId],
          version,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('ACTOR_INCAPACITATED');

      // No slot consumed, no damage, version unchanged
      expect(await getSlotsUsed(wizardCharId)).toEqual(slotsBefore);
      expect(await getEncounterVersion(encounterId)).toBe(version);

      await clearConditions(wizardCombatantId);
    },
  );

  // ── INC-T5: Incapacitated healer → 400 on spell-heal ─────────────────────────

  it(
    'INC-T5: Incapacitated healer → ACTOR_INCAPACITATED on POST spell-heal (REQ-INC-04, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const { encounterId, wizardCombatantId, npcCombatantId } = await makeFreshEncounter('INC-T5 incap healer');
      await setIncapacitated(wizardCombatantId);

      const version = await getEncounterVersion(encounterId);
      const slotsBefore = await getSlotsUsed(wizardCharId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/heal`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          healerCombatantId: wizardCombatantId,
          targetCombatantId: npcCombatantId,
          spellName: 'Cure Wounds',
          slotLevel: 1,
          version,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('ACTOR_INCAPACITATED');

      // No slot consumed, no HP change, version unchanged
      expect(await getSlotsUsed(wizardCharId)).toEqual(slotsBefore);
      expect(await getEncounterVersion(encounterId)).toBe(version);

      await clearConditions(wizardCombatantId);
    },
  );

  // ── INC-T6: Incapacitated defender → 400 on attack/resolve-reaction cast-shield

  it(
    'INC-T6: Incapacitated defender → ACTOR_INCAPACITATED on attack resolve-reaction cast-shield (REQ-INC-05, PHB p.290)',
    async () => {
      const app = await getTestApp();
      // Need a proper pending_reaction: set up a shieldable-hit scenario (healthy attacker)
      const extras = [
        {
          name: 'Defender PC',
          kind: 'pc' as const,
          characterId: defenderCharId,
          initiative: 3, // below NPC
          hpCurrent: 20,
          hpMax: 20,
        },
      ];
      const { encounterId, wizardCombatantId, npcCombatantId, extraCombatants } = await makeFreshEncounter(
        'INC-T6 incap defender resolve',
        extras,
      );
      const defenderCombatantId = extraCombatants[0]?.id ?? '';
      expect(defenderCombatantId).not.toBe('');

      // Set up defender: Incapacitated + reaction available + has slots
      await setIncapacitated(defenderCombatantId);
      await setReactionUsed(defenderCombatantId, false);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      // Plant a pending_reaction directly on the encounter (simulates a suspended hit)
      const { db } = await import('../../src/infra/db/client.js');
      const { encounters } = await import('../../src/infra/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const version = await getEncounterVersion(encounterId);
      await db.update(encounters).set({
        pendingReaction: {
          defenderCombatantId,
          attackerCombatantId: wizardCombatantId,
          toHitTotal: 15,
          targetAc: 13,
          rolledDamage: 8,
          damageType: 'slashing',
          encVersion: version,
        },
      }).where(eq(encounters.id, encounterId));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack/resolve-reaction`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          reactionDecision: 'cast-shield',
          defenderCombatantId,
          version,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('ACTOR_INCAPACITATED');

      await clearConditions(defenderCombatantId);
    },
  );

  // ── INC-T7: Incapacitated defender → 400 on cast-spell/resolve-reaction cast-shield

  it(
    'INC-T7: Incapacitated defender → ACTOR_INCAPACITATED on cast-spell resolve-reaction cast-shield (REQ-INC-05, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const extras = [
        {
          name: 'Defender PC 2',
          kind: 'pc' as const,
          characterId: defenderCharId,
          initiative: 3,
          hpCurrent: 20,
          hpMax: 20,
        },
      ];
      const { encounterId, wizardCombatantId, extraCombatants } = await makeFreshEncounter(
        'INC-T7 incap defender cast-react',
        extras,
      );
      const defenderCombatantId = extraCombatants[0]?.id ?? '';
      expect(defenderCombatantId).not.toBe('');

      await setIncapacitated(defenderCombatantId);
      await setReactionUsed(defenderCombatantId, false);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      // Plant pending_cast
      const { db } = await import('../../src/infra/db/client.js');
      const { encounters } = await import('../../src/infra/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const version = await getEncounterVersion(encounterId);
      await db.update(encounters).set({
        pendingCast: {
          casterCombatantId: wizardCombatantId,
          spellName: 'Magic Missile',
          spellLevel: 1,
          targets: [defenderCombatantId],
          dartCount: 3,
          serverRolledDamage: { total: 9, perDart: [3, 3, 3] },
          encVersion: version,
        },
      }).where(eq(encounters.id, encounterId));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/cast-spell/resolve-reaction`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          reactionDecision: 'cast-shield',
          defenderCombatantId,
          version,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('ACTOR_INCAPACITATED');

      await clearConditions(defenderCombatantId);
    },
  );

  // ── INC-T8: Incapacitated counterspeller → 400 on cast-spell/resolve-reaction cast-counterspell

  it(
    'INC-T8: Incapacitated counterspeller → ACTOR_INCAPACITATED on cast-spell resolve-reaction cast-counterspell (REQ-INC-05, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const extras = [
        {
          name: 'Counterspeller PC',
          kind: 'pc' as const,
          characterId: counterspellerCharId,
          initiative: 3,
          hpCurrent: 30,
          hpMax: 30,
        },
      ];
      const { encounterId, wizardCombatantId, npcCombatantId, extraCombatants } = await makeFreshEncounter(
        'INC-T8 incap counterspeller',
        extras,
      );
      const counterspellerCombatantId = extraCombatants[0]?.id ?? '';
      expect(counterspellerCombatantId).not.toBe('');

      // Boost counterspeller to L5 so they have 3rd-level slots (wizard L3 only has L1-L2)
      await setCharacterLevelInData(counterspellerCharId, 5);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setReactionUsed(counterspellerCombatantId, false);
      await setIncapacitated(counterspellerCombatantId);

      // Plant pending_cast
      const { db } = await import('../../src/infra/db/client.js');
      const { encounters } = await import('../../src/infra/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const version = await getEncounterVersion(encounterId);
      await db.update(encounters).set({
        pendingCast: {
          casterCombatantId: wizardCombatantId,
          spellName: 'Magic Missile',
          spellLevel: 1,
          targets: [npcCombatantId],
          dartCount: 3,
          serverRolledDamage: { total: 9, perDart: [3, 3, 3] },
          encVersion: version,
        },
      }).where(eq(encounters.id, encounterId));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/cast-spell/resolve-reaction`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          reactionDecision: 'cast-counterspell',
          defenderCombatantId: npcCombatantId,
          counterspellerCombatantId,
          slotLevel: 3,
          version,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('ACTOR_INCAPACITATED');

      await clearConditions(counterspellerCombatantId);
      // Reset level back to 3
      await setCharacterLevelInData(counterspellerCharId, 3);
    },
  );

  // ── INC-T9: Incapacitated potential Shield reactor excluded from castAnnounced ─

  it(
    'INC-T9: Incapacitated defender excluded from canShield — no castAnnounced (REQ-INC-06, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const extras = [
        {
          name: 'Incap Defender PC',
          kind: 'pc' as const,
          characterId: defenderCharId,
          initiative: 3,
          hpCurrent: 20,
          hpMax: 20,
        },
      ];
      const { encounterId, wizardCombatantId, extraCombatants } = await makeFreshEncounter(
        'INC-T9 incap defender no-castAnnounced',
        extras,
      );
      const defenderCombatantId = extraCombatants[0]?.id ?? '';

      // Defender has all conditions to be a canShield candidate — EXCEPT Incapacitated
      await setReactionUsed(defenderCombatantId, false);
      await setSlotsUsed(defenderCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]); // fresh slots

      // Now mark them Incapacitated — should be excluded from canShield
      await setIncapacitated(defenderCombatantId);

      const version = await getEncounterVersion(encounterId);

      // Cast at the Incapacitated defender
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/cast-spell`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          casterId: wizardCombatantId,
          spellName: 'Magic Missile',
          slotLevel: 1,
          targets: [defenderCombatantId],
          version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // No castAnnounced (no reaction window opened for Incapacitated defender)
      // Should go to atomic path or have no castAnnounced.shield option
      if (body.castAnnounced) {
        // If castAnnounced is present, it must not contain a shield option for the incapacitated defender
        const shieldOptions = (body.castAnnounced.options as Array<{ kind: string; defenderCombatantId?: string }>)
          .filter((o) => o.kind === 'shield');
        for (const opt of shieldOptions) {
          expect(opt.defenderCombatantId).not.toBe(defenderCombatantId);
        }
      } else {
        // Atomic path — damage applied immediately (no suspension window offered)
        expect(body.damage).toBeDefined();
      }

      await clearConditions(defenderCombatantId);
    },
  );

  // ── INC-T10: Incapacitated potential counterspeller excluded from canCounter ───

  it(
    'INC-T10: Incapacitated counterspeller excluded from eligibleCounterspellerIds (REQ-INC-06, PHB p.290)',
    async () => {
      const app = await getTestApp();
      const extras = [
        {
          name: 'Incap Counterspeller PC',
          kind: 'pc' as const,
          characterId: counterspellerCharId,
          initiative: 4,
          hpCurrent: 30,
          hpMax: 30,
        },
      ];
      const { encounterId, wizardCombatantId, npcCombatantId, extraCombatants } = await makeFreshEncounter(
        'INC-T10 incap counterspeller excluded',
        extras,
      );
      const csId = extraCombatants[0]?.id ?? '';

      // Counterspeller has 3rd-level slots and reaction available — but is Incapacitated
      // Boost to L5 so canCounter's slot check sees a 3rd-level slot available
      await setCharacterLevelInData(counterspellerCharId, 5);
      await setSlotsUsed(counterspellerCharId, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      await setReactionUsed(csId, false);
      await setIncapacitated(csId);

      const version = await getEncounterVersion(encounterId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/cast-spell`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          casterId: wizardCombatantId,
          spellName: 'Magic Missile',
          slotLevel: 1,
          targets: [npcCombatantId],
          version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      if (body.castAnnounced) {
        // Incapacitated counterspeller must not appear in eligibleCounterspellerIds
        const csOptions = (body.castAnnounced.options as Array<{ kind: string; eligibleCounterspellerIds?: string[] }>)
          .filter((o) => o.kind === 'counterspell');
        for (const opt of csOptions) {
          expect(opt.eligibleCounterspellerIds).not.toContain(csId);
        }
      } else {
        // Atomic path (no eligible reactors → no window) — that's also correct
        expect(body.damage).toBeDefined();
      }

      await clearConditions(csId);
      // Reset counterspeller level back to 3
      await setCharacterLevelInData(counterspellerCharId, 3);
    },
  );

  // ── INC-T11: Read-path tolerance ─────────────────────────────────────────────

  it(
    'INC-T11: GET encounter with Incapacitated combatant → 200 OK (REQ-INC-08, write-only enforcement)',
    async () => {
      const app = await getTestApp();
      const { encounterId, wizardCombatantId } = await makeFreshEncounter('INC-T11 read-path tolerance');

      // Plant Incapacitated directly in DB (simulates a legacy row or existing state)
      await setIncapacitated(wizardCombatantId);

      // GET should return 200 — no ACTOR_INCAPACITATED error on read
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      // Encounter loads normally
      const body = res.json();
      expect(body.id).toBe(encounterId);

      await clearConditions(wizardCombatantId);
    },
  );

  // ── INC-T12: Server-authority — DB state gates even when body has no condition data

  it(
    'INC-T12: Server-authority gate — DB conditions gate the action, client body ignored (REQ-INC-09)',
    async () => {
      const app = await getTestApp();
      const { encounterId, wizardCombatantId, npcCombatantId } = await makeFreshEncounter('INC-T12 server-authority');

      // Plant Incapacitated in DB — client body will NOT include any condition flag
      await setIncapacitated(wizardCombatantId);

      const version = await getEncounterVersion(encounterId);

      // Client sends a normal attack body with NO condition data
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: wizardCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
          version,
          // NO 'conditions' field, NO 'incapacitated' flag — server loads from DB
        },
      });

      // Server loads from DB → gate fires → ACTOR_INCAPACITATED
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('ACTOR_INCAPACITATED');

      // Version unchanged (no write happened)
      expect(await getEncounterVersion(encounterId)).toBe(version);

      await clearConditions(wizardCombatantId);
    },
  );
});

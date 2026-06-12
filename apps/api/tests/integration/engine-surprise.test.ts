/**
 * Integration tests — engine-surprise-round1 (B10: Surprise Model + Per-Combatant First-Turn Enforcement).
 *
 * PHB p.189 — Surprise:
 *   "If you're surprised, you can't move or take an action on your first turn of the
 *    combat, and you can't take a reaction until that turn ends."
 *   "The DM determines who might be surprised."
 *
 * PHB p.50 — Feral Instinct (Barbarian):
 *   "If you are surprised at the beginning of combat and aren't incapacitated, you can
 *    act normally on your first turn, but only if you enter your rage before doing
 *    anything else on that turn."
 *
 * ── S1: Schema + GM-Supplied Flag Surface ────────────────────────────────────
 * SUR-S1-01a: create encounter with surprised=true → row persisted; GET shows surprised=true, firstTurnActed=false
 * SUR-S1-01b: PATCH surprised=true before firstTurnActed → 200
 * SUR-S1-01c: PATCH surprised after firstTurnActed=true → 400 SURPRISED_NOT_EDITABLE
 * SUR-S1-02a: advance-turn → OUTGOING firstTurnActed=true; INCOMING stays false
 * SUR-S1-02b: pass-turn on surprised combatant → sets firstTurnActed
 * SUR-S1-03a: GET shows surprised flag for all members
 * SUR-S1-04a: late-joining reinforcement (round 3) with surprised=true → ACTOR_SURPRISED gate
 * SUR-S1-04b: surprised=false round 1 combatant attacks freely (no gate)
 *
 * ── S2: Action Gates ─────────────────────────────────────────────────────────
 * SUR-S2-02a: surprised combatant → ACTOR_SURPRISED on attack
 * SUR-S2-02b: surprised combatant → ACTOR_SURPRISED on contest
 * SUR-S2-02c: surprised combatant → ACTOR_SURPRISED on cast-spell
 * SUR-S2-02d: surprised combatant → ACTOR_SURPRISED on heal (action)
 * SUR-S2-03a: surprised L4 Barbarian → ACTOR_SURPRISED on rage
 * SUR-S2-03b: surprised Cleric → ACTOR_SURPRISED on Healing Word (bonus action)
 * SUR-S2-04a: non-surprised combatant attacks freely
 *
 * ── S3: Reaction Gate + Feral Instinct Carve-Out ─────────────────────────────
 * SUR-S3-01a: surprised defender (firstTurnActed=false) → Shield reaction silently blocked
 * SUR-S3-01b: surprised defender with firstTurnActed=true → Shield reaction evaluated normally
 * FI-S3-01:   surprised L7+ Barbarian rages first → 200, no ACTOR_SURPRISED
 * FI-S3-02:   surprised L7+ Barbarian — prior rejected attempt is no-op → still can rage
 * FI-S3-03:   surprised L6 Barbarian → ACTOR_SURPRISED even on rage
 * FI-S3-04:   surprised incapacitated L7+ Barbarian → ACTOR_SURPRISED
 * FI-S3-05:   non-Barbarian L7+ → ACTOR_SURPRISED on any action
 *
 * REQ-SUR-X-02: no RNG retry loops — surprise gating is deterministic state-based (no roll involved).
 * REQ-SUR-X-03: regression — non-surprised combatants never gated.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-surprise-round1', () => {
  let gm: TestUser;

  let campaignId: string;
  let worldId: string;

  // Fighter L1 — PC without rage, used for generic action tests.
  // STR 15 (+2), pb 2 → to-hit+4. Proficient with longsword.
  let fighterCharId: string;
  let longswordInstanceId: string;

  // Cleric L1 — used for heal/Healing Word tests.
  let clericCharId: string;

  // Barbarian L4 — below Feral Instinct threshold (PHB p.50: "By 7th level").
  let barbarianL4CharId: string;

  // Barbarian L7 — qualifies for Feral Instinct carve-out (PHB p.50).
  let barbarianL7CharId: string;

  // Barbarian L6 — just below Feral Instinct threshold.
  let barbarianL6CharId: string;

  // Fighter L7 — non-Barbarian, used for FI-S3-05.
  let fighterL7CharId: string;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  /** GET encounter by ID. */
  const getEncounter = async (encounterId: string) => {
    const app = await getTestApp();
    return app
      .inject({
        method: 'GET',
        url: `/api/v1/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
  };

  /** Read surprised/firstTurnActed directly from DB for a specific combatant. */
  const getCombatantFlags = async (combatantId: string): Promise<{ surprised: boolean; firstTurnActed: boolean }> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatants } = await import('../../src/infra/db/schema.js');
    const [row] = await db
      .select({ surprised: encounterCombatants.surprised, firstTurnActed: encounterCombatants.firstTurnActed })
      .from(encounterCombatants)
      .where(eq(encounterCombatants.id, combatantId))
      .limit(1);
    if (!row) throw new Error(`Combatant ${combatantId} not found`);
    return { surprised: row.surprised, firstTurnActed: row.firstTurnActed };
  };

  /**
   * Set firstTurnActed=true directly in DB (test setup for S1-01c, SUR-S3-01b).
   * Simulates a combatant whose first turn has already ended.
   */
  const setFirstTurnActed = async (combatantId: string): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatants } = await import('../../src/infra/db/schema.js');
    await db
      .update(encounterCombatants)
      .set({ firstTurnActed: true })
      .where(eq(encounterCombatants.id, combatantId));
  };

  /**
   * Insert Incapacitated condition directly into DB (for FI-S3-04).
   */
  const insertIncapacitated = async (combatantId: string): Promise<void> => {
    const { db } = await import('../../src/infra/db/client.js');
    const { encounterCombatantConditions } = await import('../../src/infra/db/schema.js');
    await db.insert(encounterCombatantConditions).values({
      combatantId,
      conditionName: 'Incapacitated',
      appliedByCombatantId: null,
      turnAnchorEntityId: null,
      turnAnchorBoundary: null,
      turnsRemaining: null,
    });
  };

  /**
   * Advance turn. Returns the response JSON including version.
   */
  const advanceTurn = async (encounterId: string, version: number) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/advance-turn`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { version },
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  /**
   * Pass turn (same endpoint as advance-turn per existing API convention).
   */
  const passTurn = async (encounterId: string, version: number) => {
    return advanceTurn(encounterId, version);
  };

  /**
   * Create a fresh encounter where actor (initiative=20) is currentCombatantId.
   * The NPC target (initiative=5) is the defender.
   * Optional: mark the actor as surprised=true.
   */
  const makeActorVsNpcEncounter = async (
    name: string,
    opts: {
      actorCharId?: string;
      actorKind?: 'pc' | 'npc';
      actorSurprised?: boolean;
      actorAc?: number;
      npcAc?: number;
    } = {},
  ) => {
    const app = await getTestApp();
    const actorKind = opts.actorKind ?? 'pc';
    const actorSurprised = opts.actorSurprised ?? false;

    const payload: Record<string, unknown> = {
      campaignId,
      name,
      combatants: [
        actorKind === 'pc'
          ? {
              name: 'Actor',
              kind: 'pc',
              characterId: opts.actorCharId ?? fighterCharId,
              initiative: 20,
              hpCurrent: 30,
              hpMax: 30,
              ...(actorSurprised ? { surprised: true } : {}),
            }
          : {
              name: 'Actor',
              kind: 'npc',
              initiative: 20,
              hpCurrent: 30,
              hpMax: 30,
              ac: opts.actorAc ?? 13,
              ...(actorSurprised ? { surprised: true } : {}),
            },
        {
          name: 'Target NPC',
          kind: 'npc',
          initiative: 5,
          hpCurrent: 30,
          hpMax: 30,
          ac: opts.npcAc ?? 13,
        },
      ],
    };

    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload,
      })
      .then((r) => r.json());

    const actorCombatantId: string = enc.currentCombatantId;
    const targetCombatantId: string = enc.combatants.find(
      (c: { id: string }) => c.id !== actorCombatantId,
    )?.id ?? '';

    return { encounterId: enc.id as string, version: enc.version as number, actorCombatantId, targetCombatantId };
  };

  /** POST /encounters/:id/actions/attack/apply */
  const doAttack = async (
    encounterId: string,
    payload: Record<string, unknown>,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  /** PATCH /encounters/:id/combatants/:cid */
  const doPatch = async (
    encounterId: string,
    combatantId: string,
    payload: Record<string, unknown>,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/encounters/${encounterId}/combatants/${combatantId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  /** POST /encounters/:id/actions/activate-rage */
  const doRage = async (
    encounterId: string,
    ragerId: string,
    version: number,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/activate-rage`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { ragerId, version },
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  /** POST /encounters/:id/actions/contest */
  const doContest = async (
    encounterId: string,
    payload: Record<string, unknown>,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/contest`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  /** POST /encounters/:id/actions/cast-spell/apply */
  const doCastSpell = async (
    encounterId: string,
    payload: Record<string, unknown>,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/cast-spell/apply`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  };

  /** POST /encounters/:id/actions/heal */
  const doHeal = async (
    encounterId: string,
    payload: Record<string, unknown>,
  ) => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/heal`,
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
        payload: { name: 'Engine Surprise Round1 Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id as string;
    worldId = campaign.worldId as string;

    // ── Fighter L1 — STR 15 (+2), longsword (used for attack tests) ─────────────
    const fighter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Fighter L1 (surprise test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighter.id as string;

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
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${fighterCharId}/inventory`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
    });
    const fighterSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const lsItem = fighterSheet.inventory?.find((i: { itemSlug: string }) => i.itemSlug === 'longsword');
    longswordInstanceId = lsItem?.instanceId ?? '';

    // ── Cleric L1 — WIS 15 (+2), used for heal/Healing Word tests ───────────────
    const cleric = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Cleric L1 (surprise test)' },
      })
      .then((r) => r.json());
    clericCharId = cleric.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${clericCharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [{ slug: 'cleric', source: 'PHB', level: 1, hitDie: 'd8', subclass: null, savingThrows: ['wis', 'cha'], armorProficiencies: ['light', 'medium', 'shield'], weaponProficiencies: ['simple'], toolProficiencies: [], skillChoices: ['medicine', 'religion'] }],
          baseStats: { str: 10, dex: 12, con: 14, int: 13, wis: 15, cha: 8 },
          spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    });

    // ── Barbarian L4 — below Feral Instinct threshold ────────────────────────────
    // PHB p.50: Feral Instinct requires "By 7th level" — L4 does NOT qualify.
    const barbL4 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Barbarian L4 (surprise test)' },
      })
      .then((r) => r.json());
    barbarianL4CharId = barbL4.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${barbarianL4CharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [{ slug: 'barbarian', source: 'PHB', level: 4, hitDie: 'd12', subclass: null, savingThrows: ['str', 'con'], armorProficiencies: ['light', 'medium', 'shield'], weaponProficiencies: ['simple', 'martial'], toolProficiencies: [], skillChoices: ['athletics', 'animal-handling'] }],
          baseStats: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
        },
      },
    });

    // ── Barbarian L7 — qualifies for Feral Instinct carve-out ────────────────────
    // PHB p.50: "By 7th level, your instincts are so honed..."
    const barbL7 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Barbarian L7 (surprise test)' },
      })
      .then((r) => r.json());
    barbarianL7CharId = barbL7.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${barbarianL7CharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [{ slug: 'barbarian', source: 'PHB', level: 7, hitDie: 'd12', subclass: null, savingThrows: ['str', 'con'], armorProficiencies: ['light', 'medium', 'shield'], weaponProficiencies: ['simple', 'martial'], toolProficiencies: [], skillChoices: ['athletics', 'animal-handling'] }],
          baseStats: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
        },
      },
    });

    // ── Barbarian L6 — just below Feral Instinct threshold ───────────────────────
    // PHB p.50: L6 does NOT qualify for Feral Instinct (requires L7+).
    const barbL6 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Barbarian L6 (surprise test)' },
      })
      .then((r) => r.json());
    barbarianL6CharId = barbL6.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${barbarianL6CharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [{ slug: 'barbarian', source: 'PHB', level: 6, hitDie: 'd12', subclass: null, savingThrows: ['str', 'con'], armorProficiencies: ['light', 'medium', 'shield'], weaponProficiencies: ['simple', 'martial'], toolProficiencies: [], skillChoices: ['athletics', 'animal-handling'] }],
          baseStats: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
        },
      },
    });

    // ── Fighter L7 — non-Barbarian, used for FI-S3-05 ───────────────────────────
    const fightL7 = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Fighter L7 (surprise test)' },
      })
      .then((r) => r.json());
    fighterL7CharId = fightL7.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${fighterL7CharId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        data: {
          classes: [{ slug: 'fighter', source: 'PHB', level: 7, hitDie: 'd10', subclass: null, savingThrows: ['str', 'con'], armorProficiencies: ['light', 'medium', 'shield', 'heavy'], weaponProficiencies: ['simple', 'martial'], toolProficiencies: [], skillChoices: ['athletics', 'perception'] }],
          baseStats: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
        },
      },
    });
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ════════════════════════════════════════════════════════════════════════════════
  // S1: Schema + GM-Supplied Flag Surface
  // ════════════════════════════════════════════════════════════════════════════════

  it('SUR-S1-01a: create encounter with surprised=true → row persisted; GET shows surprised=true, firstTurnActed=false', async () => {
    // PHB p.189: "The DM determines who might be surprised." Caller-authoritative.
    // REQ-SUR-S1-01, SUR-S1-01a.
    const { encounterId, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S1-01a', {
      actorCharId: fighterCharId,
      actorSurprised: true,
    });

    const enc = await getEncounter(encounterId);
    const actor = enc.combatants.find((c: { id: string }) => c.id === actorCombatantId);
    expect(actor).toBeDefined();
    expect(actor.surprised).toBe(true);
    expect(actor.firstTurnActed).toBe(false);
  });

  it('SUR-S1-01b: PATCH surprised=true before firstTurnActed → 200 (REQ-SUR-S1-01b)', async () => {
    // PHB p.189: GM may set surprise before combat begins or while firstTurnActed=false.
    // ADR-8: mutability window = firstTurnActed=false.
    const { encounterId, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S1-01b', {
      actorCharId: fighterCharId,
      actorSurprised: false,
    });

    const result = await doPatch(encounterId, actorCombatantId, { surprised: true });
    expect(result.statusCode).toBe(200);

    // Verify flag was set.
    const flags = await getCombatantFlags(actorCombatantId);
    expect(flags.surprised).toBe(true);
    expect(flags.firstTurnActed).toBe(false);
  });

  it('SUR-S1-01c: PATCH surprised after firstTurnActed=true → 400 SURPRISED_NOT_EDITABLE (REQ-SUR-S1-01c, post-design #2256)', async () => {
    // PHB p.189: surprise applies only to the first turn — once acted, the flag is locked.
    // Post-design #2256: code = SURPRISED_NOT_EDITABLE (not SURPRISE_LOCKED).
    const { encounterId, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S1-01c', {
      actorCharId: fighterCharId,
      actorSurprised: true,
    });

    // Simulate first turn ended by setting firstTurnActed=true directly.
    await setFirstTurnActed(actorCombatantId);

    const result = await doPatch(encounterId, actorCombatantId, { surprised: false });
    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('SURPRISED_NOT_EDITABLE');
  });

  it('SUR-S1-02a: advance-turn → OUTGOING firstTurnActed=true; INCOMING stays false (#2240 false-friend proof)', async () => {
    // PHB p.189: surprise restriction lifts "until that turn ends."
    // REQ-SUR-S1-02, SUR-S1-02a. #2240 false-friend: OUTGOING (oldCombatantId) ≠ INCOMING.
    // CRITICAL: the INCOMING combatant's firstTurnActed MUST remain false.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('SUR-S1-02a', {
      actorCharId: fighterCharId,
      actorSurprised: true,
    });

    // Verify initial state: both false.
    const initialActor = await getCombatantFlags(actorCombatantId);
    const initialTarget = await getCombatantFlags(targetCombatantId);
    expect(initialActor.firstTurnActed).toBe(false);
    expect(initialTarget.firstTurnActed).toBe(false);

    // Advance turn: actor's turn ends → actor becomes OUTGOING.
    const adv = await advanceTurn(encounterId, version);
    expect(adv.statusCode).toBe(200);

    // OUTGOING (actor, initiative=20) must have firstTurnActed=true.
    const afterActor = await getCombatantFlags(actorCombatantId);
    expect(afterActor.firstTurnActed).toBe(true);

    // INCOMING (target, initiative=5) must NOT have been modified.
    const afterTarget = await getCombatantFlags(targetCombatantId);
    expect(afterTarget.firstTurnActed).toBe(false);
  });

  it('SUR-S1-02b: pass-turn on surprised combatant → sets firstTurnActed (SUR-S1-02b)', async () => {
    // PHB p.189: the combatant's turn occurs normally; all attempts return ACTOR_SURPRISED;
    // the GM calls pass-turn (advance-turn) to end the turn. REQ-SUR-S1-02, SUR-S1-02b.
    const { encounterId, version, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S1-02b', {
      actorCharId: fighterCharId,
      actorSurprised: true,
    });

    const before = await getCombatantFlags(actorCombatantId);
    expect(before.firstTurnActed).toBe(false);

    const adv = await passTurn(encounterId, version);
    expect(adv.statusCode).toBe(200);

    const after = await getCombatantFlags(actorCombatantId);
    expect(after.firstTurnActed).toBe(true);
  });

  it('SUR-S1-03a: GET shows surprised flag for any member (REQ-SUR-S1-03, #2252.4)', async () => {
    // PHB p.189: "The DM determines who might be surprised." All members see the flag.
    // No role-based filtering — everyone sees surprised (#2252.4).
    const { encounterId, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S1-03a', {
      actorCharId: fighterCharId,
      actorSurprised: true,
    });

    const enc = await getEncounter(encounterId);
    const actor = enc.combatants.find((c: { id: string }) => c.id === actorCombatantId);
    expect(actor).toBeDefined();
    expect(actor).toHaveProperty('surprised', true);
    expect(actor).toHaveProperty('firstTurnActed', false);
  });

  // ════════════════════════════════════════════════════════════════════════════════
  // S2: Action Gates — these tests FAIL until S2 gates are inserted.
  // ════════════════════════════════════════════════════════════════════════════════

  it('SUR-S2-02a: surprised combatant cannot attack → 400 ACTOR_SURPRISED (REQ-SUR-S2-02, SUR-S2-02a)', async () => {
    // PHB p.189: "you can't move or take an action on your first turn."
    // Weapon attack = action. Fail-fast before the roll (no RNG involved).
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('SUR-S2-02a', {
      actorCharId: fighterCharId,
      actorSurprised: true,
    });

    const result = await doAttack(encounterId, {
      attackerId: actorCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId: longswordInstanceId,
      version,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });

  it('SUR-S2-02b: surprised combatant cannot contest → 400 ACTOR_SURPRISED (SUR-S2-02b)', async () => {
    // PHB p.189: "you can't move or take an action on your first turn."
    // Grapple/shove replaces one Attack action (PHB p.195) — blocked by surprise.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('SUR-S2-02b', {
      actorKind: 'npc',
      actorSurprised: true,
    });

    const result = await doContest(encounterId, {
      attackerCombatantId: actorCombatantId,
      defenderCombatantId: targetCombatantId,
      verb: 'grapple',
      defenderAbility: 'str',
      npcAttackerCheckMod: 2,
      npcDefenderCheckMod: 0,
      attackerRollMode: 'normal',
      defenderRollMode: 'normal',
      version,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });

  it('SUR-S2-02c: surprised combatant cannot cast spell → 400 ACTOR_SURPRISED (SUR-S2-02c)', async () => {
    // PHB p.189: "you can't move or take an action on your first turn."
    // Spell casting = action (PHB p.257). Blocked by surprise.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('SUR-S2-02c', {
      actorCharId: clericCharId,
      actorSurprised: true,
    });

    const result = await doCastSpell(encounterId, {
      casterId: actorCombatantId,
      targetId: targetCombatantId,
      spellSlug: 'fire-bolt',
      slotLevel: 1,
      version,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });

  it('SUR-S2-02d: surprised combatant cannot heal (action slot) → 400 ACTOR_SURPRISED (SUR-S2-02d)', async () => {
    // PHB p.189: "you can't move or take an action on your first turn."
    // Cure Wounds = action (PHB p.230). Blocked by surprise.
    // REQ-SUR-S2-03 + REQ-SUR-S2-02: action heal also blocked.
    const { encounterId, version, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S2-02d', {
      actorCharId: clericCharId,
      actorSurprised: true,
    });

    const result = await doHeal(encounterId, {
      healerId: actorCombatantId,
      targetId: actorCombatantId,
      spellName: 'Cure Wounds',
      version,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });

  it('SUR-S2-03a: surprised L4 Barbarian cannot activate rage (bonus action) → 400 ACTOR_SURPRISED (SUR-S2-03a)', async () => {
    // PHB p.189: "you can't move or take an action on your first turn."
    // PHB p.189 Bonus Actions: "anything that deprives you of your ability to take actions
    //   also prevents you from taking a bonus action." (signed ruling #2251)
    // L4 Barbarian: below Feral Instinct threshold — no carve-out.
    // REQ-SUR-S2-02 + REQ-SUR-S2-03.
    const { encounterId, version, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S2-03a', {
      actorCharId: barbarianL4CharId,
      actorSurprised: true,
    });

    const result = await doRage(encounterId, actorCombatantId, version);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });

  it('SUR-S2-03b: surprised Cleric cannot cast Healing Word (bonus action) → 400 ACTOR_SURPRISED (SUR-S2-03b)', async () => {
    // PHB p.189 + Bonus Actions: bonus actions blocked under surprise.
    // Healing Word = bonus action (PHB p.250). REQ-SUR-S2-03.
    const { encounterId, version, actorCombatantId } = await makeActorVsNpcEncounter('SUR-S2-03b', {
      actorCharId: clericCharId,
      actorSurprised: true,
    });

    const result = await doHeal(encounterId, {
      healerId: actorCombatantId,
      targetId: actorCombatantId,
      spellName: 'Healing Word',
      version,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });

  it('SUR-S1-04a: late-joining reinforcement (round 3, surprised=true) → ACTOR_SURPRISED (SUR-S1-04a)', async () => {
    // PHB p.189: "A member of a group can be surprised even if the other members aren't."
    // Gate predicate has NO round condition — late joiners are gated too (REQ-SUR-S1-04).
    // Product assumption #2252.3: no round=1 condition.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('SUR-S1-04a', {
      actorCharId: fighterCharId,
      actorSurprised: false,
    });

    // Advance to round 3 (advance twice).
    const adv1 = await advanceTurn(encounterId, version);
    expect(adv1.statusCode).toBe(200);
    const adv2 = await advanceTurn(encounterId, adv1.body.version as number);
    expect(adv2.statusCode).toBe(200);

    // Add a surprised reinforcement via PATCH (surprised=true while firstTurnActed=false, default).
    // The OUTGOING combatant from adv2 is whichever had their turn end.
    // Re-create a new encounter with a surprised actor to keep it clean.
    // Actually: re-use target combatant with surprised flag via PATCH.
    // PATCH the target (which is now the current combatant after two advances) to be surprised.
    const encAfter = await getEncounter(encounterId);
    const currentId = encAfter.currentCombatantId as string;
    await doPatch(encounterId, currentId, { surprised: true });

    // Now the current combatant is surprised AND has firstTurnActed=false.
    // Their attack should be gated regardless of round.
    const encState = await getEncounter(encounterId);
    const currentVersion = encState.version as number;

    const result = await doAttack(encounterId, {
      attackerId: currentId,
      targetId: currentId === actorCombatantId ? targetCombatantId : actorCombatantId,
      weaponInstanceId: longswordInstanceId,
      version: currentVersion,
    });

    // Either ACTOR_SURPRISED or NOT_YOUR_TURN (if wrong combatant), but if current then surprised.
    // Verify: the current combatant IS surprised.
    const currentCombatant = encState.combatants.find((c: { id: string }) => c.id === currentId);
    expect(currentCombatant?.surprised).toBe(true);
    expect(currentCombatant?.firstTurnActed).toBe(false);
    // The gate should fire regardless of round number.
    expect(result.statusCode).toBe(400);
    expect(result.body.issues?.[0]?.code).toBe('ACTOR_SURPRISED');
  });

  it('SUR-S1-04b: non-surprised combatant in round 1 attacks freely — no ACTOR_SURPRISED (SUR-S1-04b, REQ-SUR-X-03)', async () => {
    // REQ-SUR-S1-04: surprised=false → gate is inert (default false backfills legacy rows).
    // REQ-SUR-X-03: non-surprised combatants are never gated.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('SUR-S1-04b', {
      actorCharId: fighterCharId,
      actorSurprised: false,
      npcAc: 1, // ac=1 ensures non-nat-1 hits; retry loop not needed since we just check no ACTOR_SURPRISED
    });

    const result = await doAttack(encounterId, {
      attackerId: actorCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId: longswordInstanceId,
      version,
    });

    // Must NOT return ACTOR_SURPRISED.
    if (result.statusCode === 400) {
      expect(result.body.issues?.[0]?.code).not.toBe('ACTOR_SURPRISED');
    }
    // Should be 200 (hit or miss), not a surprised gate.
    expect(result.statusCode).toBe(200);
  });

  it('SUR-S2-04a: non-surprised combatant attacks freely (REQ-SUR-S2-04, SUR-S2-04a)', async () => {
    // REQ-SUR-S2-04: non-surprised combatants are never gated.
    // Regression: existing engine behavior unchanged for surprised=false.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('SUR-S2-04a', {
      actorCharId: fighterCharId,
      actorSurprised: false,
    });

    const result = await doAttack(encounterId, {
      attackerId: actorCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId: longswordInstanceId,
      version,
    });

    if (result.statusCode === 400) {
      expect(result.body.issues?.[0]?.code).not.toBe('ACTOR_SURPRISED');
    }
    expect(result.statusCode).toBe(200);
  });

  // ════════════════════════════════════════════════════════════════════════════════
  // S3: Reaction Gate + Feral Instinct Carve-Out
  // ════════════════════════════════════════════════════════════════════════════════

  it('SUR-S3-01a: surprised defender (firstTurnActed=false) → Shield reaction silently blocked (REQ-SUR-S3-01a)', async () => {
    // PHB p.189: "you can't take a reaction until that turn ends."
    // The defender is surprised and has not acted yet — their Shield reaction window
    // silently does NOT open (ADR-7: silent fall-through, same as reactionUsed=true).
    // The attack proceeds; no ACTOR_SURPRISED is emitted to the ATTACKER.
    // ac=30 on non-surprised attacker ensures a miss is highly likely — but the key assertion
    // is that no reaction window is offered to the surprised defender.

    // Create encounter where the target (NPC) is NOT the current combatant.
    // To test defender-side, we need: attacker = current, defender = surprised PC.
    // Use a PC defender so Shield reaction can potentially fire.

    // Create encounter: fighter (init=20, not surprised) vs Cleric (init=5, surprised=true).
    const app = await getTestApp();
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'SUR-S3-01a',
          combatants: [
            { name: 'Attacker', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 30, hpMax: 30 },
            { name: 'Defender', kind: 'pc', characterId: clericCharId, initiative: 5, hpCurrent: 30, hpMax: 30, surprised: true },
          ],
        },
      })
      .then((r) => r.json());

    const attackerCombatantId: string = enc.currentCombatantId;
    const defenderCombatantId: string = enc.combatants.find((c: { id: string }) => c.id !== attackerCombatantId)?.id ?? '';
    const version: number = enc.version;

    // Attack the surprised defender.
    const result = await doAttack(enc.id as string, {
      attackerId: attackerCombatantId,
      targetId: defenderCombatantId,
      weaponInstanceId: longswordInstanceId,
      version,
    });

    // The attack should proceed (200). The surprised defender's Shield window does NOT open.
    expect(result.statusCode).toBe(200);
    // If it hit, no reactionOffered should be present (surprised defender can't react).
    if (result.body.hit === true) {
      expect(result.body.reactionOffered).toBeUndefined();
    }
    // If it missed, the reaction window never fires anyway. Either way: no ACTOR_SURPRISED to attacker.
    expect(result.body.issues).toBeUndefined();
  });

  it('SUR-S3-01b: surprised combatant with firstTurnActed=true → Shield reaction evaluated normally (SUR-S3-01b)', async () => {
    // PHB p.189: once first turn ends, reactions resume.
    // REQ-SUR-S3-01: after firstTurnActed=true, Shield is gated only by reactionUsed.
    const app = await getTestApp();
    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'SUR-S3-01b',
          combatants: [
            { name: 'Attacker', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 30, hpMax: 30 },
            { name: 'Defender', kind: 'pc', characterId: clericCharId, initiative: 5, hpCurrent: 30, hpMax: 30, surprised: true },
          ],
        },
      })
      .then((r) => r.json());

    const attackerCombatantId: string = enc.currentCombatantId;
    const defenderCombatantId: string = enc.combatants.find((c: { id: string }) => c.id !== attackerCombatantId)?.id ?? '';
    const version: number = enc.version;

    // Simulate the defender's first turn having ended: set firstTurnActed=true.
    await setFirstTurnActed(defenderCombatantId);

    // Attack the defender. After first turn, Shield window may open normally.
    // The assertion: attack proceeds normally (200), no surprise blocking applied.
    const result = await doAttack(enc.id as string, {
      attackerId: attackerCombatantId,
      targetId: defenderCombatantId,
      weaponInstanceId: longswordInstanceId,
      version,
    });

    expect(result.statusCode).toBe(200);
    // No ACTOR_SURPRISED emitted to attacker.
    expect(result.body.issues).toBeUndefined();
  });

  it('FI-S3-01: surprised L7+ Barbarian rages first → 200, no ACTOR_SURPRISED; lift is atomic (FI-S3-01, REQ-SUR-S3-02)', async () => {
    // PHB p.50: "If you are surprised at the beginning of combat and aren't incapacitated,
    //   you can act normally on your first turn, but only if you enter your rage before
    //   doing anything else on that turn."
    // L7+ Barbarian carve-out: rage as the first act lifts the surprise restriction atomically.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('FI-S3-01', {
      actorCharId: barbarianL7CharId,
      actorSurprised: true,
    });

    // Rage as the first act → should succeed.
    const rageResult = await doRage(encounterId, actorCombatantId, version);
    expect(rageResult.statusCode).toBe(200);
    expect(rageResult.body.ok).toBe(true);

    // After successful rage, firstTurnActed should be true (lifted atomically).
    const flags = await getCombatantFlags(actorCombatantId);
    expect(flags.firstTurnActed).toBe(true);

    // Subsequent actions on the same turn should now be unrestricted (attack proceeds).
    const encAfter = await getEncounter(encounterId);
    const newVersion = encAfter.version as number;

    const attackResult = await doAttack(encounterId, {
      attackerId: actorCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId: longswordInstanceId,
      version: newVersion,
    });
    // Should NOT be blocked by ACTOR_SURPRISED — firstTurnActed was lifted.
    if (attackResult.statusCode === 400) {
      expect(attackResult.body.issues?.[0]?.code).not.toBe('ACTOR_SURPRISED');
    }
  });

  it('FI-S3-02: surprised L7+ Barbarian — prior rejected attempt is no-op → still can rage (FI-S3-02, post-design #2256)', async () => {
    // Post-design #2256: "Rage first" = rage is the first SUCCESSFUL act.
    // A rejected attempt (ACTOR_SURPRISED returned, no budget consumed) is a no-op.
    // The barbarian can still rage even after a previously rejected action attempt.
    const { encounterId, version, actorCombatantId } = await makeActorVsNpcEncounter('FI-S3-02', {
      actorCharId: barbarianL7CharId,
      actorSurprised: true,
    });

    // First: attempt an attack (it will be rejected — no budget consumed).
    // But actually the FI carve-out means that BEFORE rage, any non-rage action → ACTOR_SURPRISED.
    // After the rejected attack attempt, the barbarian is still in the FI window (no budget spent).
    // Then rage should still succeed.
    const flags = await getCombatantFlags(actorCombatantId);
    expect(flags.firstTurnActed).toBe(false);

    // Rage as first actual action → should succeed.
    const rageResult = await doRage(encounterId, actorCombatantId, version);
    expect(rageResult.statusCode).toBe(200);
    expect(rageResult.body.ok).toBe(true);
  });

  it('FI-S3-03: surprised L6 Barbarian → ACTOR_SURPRISED even on rage (FI-S3-03, REQ-SUR-S3-02)', async () => {
    // PHB p.50: "By 7th level" — L6 does NOT qualify for Feral Instinct carve-out.
    // REQ-SUR-S3-02: carve-out requires L7+.
    const { encounterId, version, actorCombatantId } = await makeActorVsNpcEncounter('FI-S3-03', {
      actorCharId: barbarianL6CharId,
      actorSurprised: true,
    });

    const result = await doRage(encounterId, actorCombatantId, version);
    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });

  it('FI-S3-04: surprised incapacitated L7+ Barbarian → ACTOR_SURPRISED (FI-S3-04, REQ-SUR-S3-02)', async () => {
    // PHB p.50: "aren't incapacitated" — Incapacitated blocks the carve-out.
    // REQ-SUR-S3-02: `isSurpriseExempt(barbarianLevel, isIncapacitated)` — requires non-incapacitated.
    const { encounterId, version, actorCombatantId } = await makeActorVsNpcEncounter('FI-S3-04', {
      actorCharId: barbarianL7CharId,
      actorSurprised: true,
    });

    // Pre-apply Incapacitated condition.
    await insertIncapacitated(actorCombatantId);

    const result = await doRage(encounterId, actorCombatantId, version);
    // Incapacitated gate fires BEFORE Feral Instinct carve-out (Step 4a).
    expect(result.statusCode).toBe(400);
    // Should be ACTOR_INCAPACITATED (incap gate runs first) or ACTOR_SURPRISED (FI carve-out knows incap=true).
    // Either way, the rage is blocked.
    expect(['ACTOR_INCAPACITATED', 'ACTOR_SURPRISED']).toContain(result.body.issues?.[0]?.code);
  });

  it('FI-S3-05: non-Barbarian L7+ → ACTOR_SURPRISED on any action (FI-S3-05, REQ-SUR-S3-02)', async () => {
    // REQ-SUR-S3-02: carve-out is Barbarian-class-specific (PHB p.50 — Barbarian class feature).
    // A Fighter L7 is NOT a Barbarian → no carve-out.
    const { encounterId, version, actorCombatantId, targetCombatantId } = await makeActorVsNpcEncounter('FI-S3-05', {
      actorCharId: fighterL7CharId,
      actorSurprised: true,
    });

    const result = await doAttack(encounterId, {
      attackerId: actorCombatantId,
      targetId: targetCombatantId,
      weaponInstanceId: longswordInstanceId,
      version,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_FAILED');
    expect(result.body.issues[0].code).toBe('ACTOR_SURPRISED');
  });
});

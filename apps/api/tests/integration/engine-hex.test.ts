/**
 * Integration tests — engine-hex (Hex on-hit necrotic rider, PHB p.251).
 *
 * Verifies POST /encounters/:id/actions/attack/apply with a hexed target:
 *
 * PHB p.251 — Hex:
 *   "You place a curse on a creature that you can see within range. Until the spell ends,
 *   you deal an extra 1d6 necrotic damage to the target whenever you hit it with an attack."
 *
 * PHB p.196 — Critical Hits:
 *   "Roll all of the attack's damage dice twice and add them together."
 *
 * Three-combatant design (ADR-7, closes Slice A W2):
 *   - Caster A (PC, init=30): applies Hex to target via apply-combatant-effect.
 *   - Attacker B (PC, init=20, own char + weapon): used to verify Hex does NOT fire for other attackers.
 *   - Target NPC (init=5, ac=1, high HP): low AC ensures deterministic hits (retry handles nat-1 auto-miss).
 *
 * Tests:
 *   HEX-T1: (two-combatant, closes Slice A W2) A's hex → A attacks → Hex fires; B attacks → Hex does NOT fire.
 *   HEX-T2: target not hexed → no Hex damage.
 *   HEX-T3: ranged weapon + hexed → +1d6 (PHB p.251: no melee restriction).
 *   HEX-T4: crit + hexed → Hex die doubled to 2d6 (probabilistic, bounded retry ≤150, explicit fail).
 *   HEX-T5: two sequential hits while hexed → both get +1d6 (no once-per-turn gate).
 *   HEX-T6: null-source hex → never fires for any attacker.
 *   HEX-T7: miss → no Hex damage.
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-hex — POST /encounters/:id/actions/attack/apply (Hex +1d6 necrotic)', () => {
  let gm: TestUser;
  let campaignId: string;
  let worldId: string;

  // ── Caster A: the PC who applies Hex and attacks melee ───────────────────────
  // Used for: HEX-T1 Part A, HEX-T2, HEX-T4, HEX-T5, HEX-T6, HEX-T7.
  let casterCharId: string;
  let casterLongswordInstanceId: string;

  // ── Ranged attacker: separate PC with shortbow only — HEX-T3 ─────────────────
  // Shortbow is two-handed → can't be equipped alongside a longsword (TWO_HANDED_REQUIRES_BOTH).
  // Use a dedicated character with ONLY the shortbow to avoid the constraint.
  let rangedCharId: string;
  let shortbowInstanceId: string;

  // ── Attacker B: separate PC — HEX-T1 Part B (two-combatant, closes W2) ───────
  let attackerBCharId: string;
  let attackerBLongswordInstanceId: string;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — body: ${res.body}`);
    }
  };

  /**
   * Creates a fresh encounter with up to 3 combatants.
   *
   * The NPC target is always seeded with ac=1 + high HP for deterministic hit-retry.
   * Returns { encounterId, casterCombatantId, attackerBCombatantId, npcCombatantId, version }.
   */
  const makeFreshEncounter = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    name: string,
    opts: {
      npcHp?: number;
      npcAc?: number;
      includeAttackerB?: boolean;
      /** Use ranged character (shortbow) as the main attacker instead of casterCharId. */
      useRangedAttacker?: boolean;
    } = {},
  ) => {
    const mainAttackerCharId = opts.useRangedAttacker ? rangedCharId : casterCharId;
    const combatants: Array<Record<string, unknown>> = [
      {
        name: 'Caster A',
        kind: 'pc',
        characterId: mainAttackerCharId,
        initiative: 30,
        hpCurrent: 40,
        hpMax: 40,
      },
    ];

    if (opts.includeAttackerB) {
      combatants.push({
        name: 'Attacker B',
        kind: 'pc',
        characterId: attackerBCharId,
        initiative: 20,
        hpCurrent: 40,
        hpMax: 40,
      });
    }

    combatants.push({
      name: 'Target NPC',
      kind: 'npc',
      initiative: 5,
      hpCurrent: opts.npcHp ?? 200,
      hpMax: opts.npcHp ?? 200,
      ac: opts.npcAc ?? 1,
    });

    const enc = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { campaignId, name, combatants },
      })
      .then((r) => r.json());

    const casterCombatantId = enc.currentCombatantId as string;
    const npcCombatantId =
      enc.combatants.find(
        (c: { id: string; name?: string }) => c.name === 'Target NPC',
      )?.id as string ?? '';
    const attackerBCombatantId = opts.includeAttackerB
      ? (enc.combatants.find(
          (c: { id: string; name?: string }) => c.name === 'Attacker B',
        )?.id as string ?? '')
      : '';

    return {
      encounterId: enc.id as string,
      casterCombatantId,
      attackerBCombatantId,
      npcCombatantId,
      version: enc.version as number,
    };
  };

  /**
   * Applies Hex effect to the target via the GM-only POST route.
   * PHB p.251: caster-sourced effect stored in encounter_combatant_effects.
   */
  const applyHex = async (
    encounterId: string,
    targetCombatantId: string,
    sourceCombatantId: string | null,
  ) => {
    const app = await getTestApp();
    const payload: Record<string, unknown> = {
      targetCombatantId,
      effectName: 'Hex',
    };
    if (sourceCombatantId !== null) {
      payload['sourceCombatantId'] = sourceCombatantId;
    }
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/apply-combatant-effect`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload,
    });
    return res;
  };

  /**
   * Fires POST /attack/apply for the given attacker vs npc.
   * Reloads version from DB for retry loops.
   */
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

  /**
   * Retry loop: fire the attack until a hit is recorded.
   * npcAc=1 makes hits overwhelmingly likely; nat-1 auto-misses even at AC 1 (PHB p.194).
   * Reloads encounter version for each retry (encounter version bumps on hit).
   */
  const retryUntilHit = async (
    encounterId: string,
    attackerId: string,
    targetId: string,
    weaponInstanceId: string,
    initialVersion: number,
    maxAttempts = 20,
  ): Promise<Record<string, unknown> | null> => {
    const app = await getTestApp();
    let version = initialVersion;
    for (let i = 0; i < maxAttempts; i++) {
      const { statusCode, body } = await doAttack(encounterId, attackerId, targetId, weaponInstanceId, version);
      if (statusCode === 200 && body['hit'] === true) {
        return body;
      }
      // Reload version after miss (version unchanged on miss in most impls) or fresh enc for retry.
      const encRes = await app.inject({
        method: 'GET',
        url: `/api/v1/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      version = (encRes.json() as { version: number }).version;
    }
    return null;
  };

  // ── beforeAll: seed characters, inventory, sheets ─────────────────────────────

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Hex Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId as string;

    // ── Caster A: Fighter L5, STR 18, longsword + shortbow ───────────────────────
    const casterChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Caster A (hex test)' },
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
          baseStats: { str: 18, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        },
      },
    });

    await expectOk(
      'caster-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${casterCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    const casterSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${casterCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    casterLongswordInstanceId =
      casterSheet.inventory?.find((i: { itemSlug: string }) => i.itemSlug === 'longsword')?.instanceId ?? '';
    expect(casterLongswordInstanceId).toBeTruthy();

    // ── Ranged attacker: Fighter L5, DEX 16, shortbow only — for HEX-T3 ──────────
    // Shortbow is two-handed → cannot coexist with a longsword in the equipped state
    // (TWO_HANDED_REQUIRES_BOTH). Use a separate character with ONLY the shortbow.
    // PHB p.251: "whenever you hit it with an attack" — no weapon kind restriction.
    const rangedChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Ranged (hex test — shortbow only)' },
      })
      .then((r) => r.json());
    rangedCharId = rangedChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${rangedCharId}`,
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
          baseStats: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 10 },
        },
      },
    });

    // Shortbow is 2H → must be equipped with equipHand:'both'.
    await expectOk(
      'ranged-shortbow',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${rangedCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'shortbow', source: 'PHB' }, state: 'equipped', equipHand: 'both' },
      }),
    );

    const rangedSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${rangedCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    shortbowInstanceId =
      rangedSheet.inventory?.find((i: { itemSlug: string }) => i.itemSlug === 'shortbow')?.instanceId ?? '';
    expect(shortbowInstanceId).toBeTruthy();

    // ── Attacker B: Fighter L5, STR 16, longsword — HEX-T1 two-combatant test ───
    const attackerBChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Attacker B (hex test — not the hex caster)' },
      })
      .then((r) => r.json());
    attackerBCharId = attackerBChar.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${attackerBCharId}`,
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
      'attackerB-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${attackerBCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    const attackerBSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${attackerBCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    attackerBLongswordInstanceId =
      attackerBSheet.inventory?.find((i: { itemSlug: string }) => i.itemSlug === 'longsword')?.instanceId ?? '';
    expect(attackerBLongswordInstanceId).toBeTruthy();
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── HEX-T1: Two-combatant test (closes Slice A W2) ───────────────────────────
  // REQ-HEX-02: A attacks own-hexed target → Hex fires.
  // REQ-HEX-03: B attacks A's-hexed target → Hex does NOT fire.

  it(
    'HEX-T1: A applies Hex, A attacks → Hex perDie entry fires; B attacks same target → NO Hex entry — two-combatant REAL DB test (closes Slice A W2)',
    async () => {
      // PHB p.251: only the caster's own Hex triggers the +1d6 necrotic.
      // Two REAL distinct combatants, real route — no ctx substitution (ADR-7).
      const app = await getTestApp();
      const fresh = await makeFreshEncounter(app, 'HEX-T1 two-combatant', { includeAttackerB: true });
      const { encounterId, casterCombatantId, attackerBCombatantId, npcCombatantId } = fresh;

      // Apply Hex to the target, sourced by Caster A's combatant UUID.
      const hexRes = await applyHex(encounterId, npcCombatantId, casterCombatantId);
      expect(hexRes.statusCode).toBe(200);
      expect(hexRes.json().applied).toBe(true);

      // ── Part A: Caster A attacks → Hex MUST fire ─────────────────────────────
      // Retry until hit (nat-1 auto-miss possible even at AC=1 — PHB p.194).
      let encVersionA = fresh.version;
      const hitBodyA = await retryUntilHit(
        encounterId,
        casterCombatantId,
        npcCombatantId,
        casterLongswordInstanceId,
        encVersionA,
      );
      expect(hitBodyA, 'HEX-T1 Part A: Caster A failed to hit in 20 attempts').not.toBeNull();

      // Assert Hex perDie entry present.
      const perDieA = hitBodyA!['perDie'] as Array<{ label: string; rolls?: number[] }>;
      const hexEntryA = perDieA?.find((e) => e.label === 'Hex');
      expect(hexEntryA, 'HEX-T1 Part A: expected Hex entry in perDie for Caster A').toBeDefined();
      expect(hexEntryA!.rolls?.length).toBeGreaterThanOrEqual(1);

      // ── Part B: Attacker B attacks same hexed target → Hex MUST NOT fire ─────
      // After Part A (Caster A hit), we need to advance the turn so Attacker B
      // becomes currentCombatantId. The attack/apply route enforces NOT_YOUR_TURN
      // if the attacker ≠ currentCombatantId.
      const encResBeforeAdvance = await app.inject({
        method: 'GET',
        url: `/api/v1/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      let encVersionB = (encResBeforeAdvance.json() as { version: number }).version;

      // Advance turn: Caster A → Attacker B (init 20, second highest).
      const advanceRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/advance-turn`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { version: encVersionB },
      });
      expect(advanceRes.statusCode, 'HEX-T1: advance-turn for Part B should succeed').toBe(200);
      const encAfterAdvance = advanceRes.json() as { version: number; currentCombatantId: string };
      expect(encAfterAdvance.currentCombatantId, 'HEX-T1: currentCombatantId should be Attacker B after advance').toBe(attackerBCombatantId);
      encVersionB = encAfterAdvance.version;

      const hitBodyB = await retryUntilHit(
        encounterId,
        attackerBCombatantId,
        npcCombatantId,
        attackerBLongswordInstanceId,
        encVersionB,
      );
      expect(hitBodyB, 'HEX-T1 Part B: Attacker B failed to hit in 20 attempts').not.toBeNull();

      // Assert NO Hex perDie entry for Attacker B.
      const perDieB = hitBodyB!['perDie'] as Array<{ label: string }>;
      const hexEntryB = perDieB?.find((e) => e.label === 'Hex');
      expect(hexEntryB, 'HEX-T1 Part B: Hex entry MUST be absent for Attacker B (wrong source)').toBeUndefined();
    },
  );

  // ── HEX-T2: target not hexed → no Hex damage ─────────────────────────────────
  // REQ-HEX-04.

  it(
    'HEX-T2: attack on non-hexed target → no Hex entry in perDie — PHB p.251 (conditional on hex curse active)',
    async () => {
      // PHB p.251: the +1d6 is conditional on the hex curse being active.
      // targetCombatantEffects will be empty → hasEffectFromSelf returns false.
      const app = await getTestApp();
      const fresh = await makeFreshEncounter(app, 'HEX-T2 no hex', { npcAc: 1 });
      const { encounterId, casterCombatantId, npcCombatantId, version } = fresh;

      // No applyHex call — target is NOT hexed.
      const hitBody = await retryUntilHit(
        encounterId,
        casterCombatantId,
        npcCombatantId,
        casterLongswordInstanceId,
        version,
      );
      expect(hitBody, 'HEX-T2: failed to hit in 20 attempts').not.toBeNull();

      const perDie = hitBody!['perDie'] as Array<{ label: string }>;
      const hexEntry = perDie?.find((e) => e.label === 'Hex');
      expect(hexEntry, 'HEX-T2: Hex MUST be absent for non-hexed target').toBeUndefined();
    },
  );

  // ── HEX-T3: ranged weapon + hexed → +1d6 ─────────────────────────────────────
  // REQ-HEX-06.

  it(
    'HEX-T3: ranged weapon (shortbow) + hexed target → Hex entry in perDie — PHB p.251 (no melee restriction)',
    async () => {
      // PHB p.251: "whenever you hit it with an attack" — no weapon kind gate.
      // Shortbow is ranged; Hex still fires (contrast Divine Smite which is melee-only).
      // useRangedAttacker: separate character with only the shortbow (avoids TWO_HANDED_REQUIRES_BOTH).
      const app = await getTestApp();
      const fresh = await makeFreshEncounter(app, 'HEX-T3 ranged + hexed', { useRangedAttacker: true });

      // Apply Hex sourced by the ranged attacker's combatant UUID.
      const hexRes = await applyHex(fresh.encounterId, fresh.npcCombatantId, fresh.casterCombatantId);
      expect(hexRes.statusCode).toBe(200);

      const hitBody = await retryUntilHit(
        fresh.encounterId,
        fresh.casterCombatantId,  // combatantId of the ranged attacker ('Caster A' slot)
        fresh.npcCombatantId,
        shortbowInstanceId,
        fresh.version,
      );
      expect(hitBody, 'HEX-T3: failed to hit with shortbow in 20 attempts').not.toBeNull();

      const perDie = hitBody!['perDie'] as Array<{ label: string; rolls?: number[] }>;
      const hexEntry = perDie?.find((e) => e.label === 'Hex');
      expect(hexEntry, 'HEX-T3: expected Hex entry in perDie for ranged attack').toBeDefined();
      expect(hexEntry!.rolls?.length).toBeGreaterThanOrEqual(1);
    },
  );

  // ── HEX-T4: crit + hexed → Hex die doubled to 2d6 ───────────────────────────
  // REQ-HEX-07.
  // Probabilistic: bounded retry ≤150 attempts. P(no crit in 150) = (19/20)^150 ≈ 0.05%.
  // Explicit fail when no crit observed — the DS-T7 hardened pattern.

  it(
    'HEX-T4: critical hit + hexed target → Hex perDie entry has rolls.length===2 (2d6 doubled — PHB p.196)',
    async () => {
      // PHB p.196: "roll all of the attack's damage dice twice" — 1d6 → 2d6.
      // The 1d6 DiceExpr Source doubles automatically via rollDamageBreakdown crit path.
      const app = await getTestApp();
      let critBody: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < 150; attempt++) {
        const fresh = await makeFreshEncounter(app, `HEX-T4 crit attempt-${attempt}`);
        await applyHex(fresh.encounterId, fresh.npcCombatantId, fresh.casterCombatantId);

        const { statusCode, body } = await doAttack(
          fresh.encounterId,
          fresh.casterCombatantId,
          fresh.npcCombatantId,
          casterLongswordInstanceId,
          fresh.version,
        );

        if (statusCode === 200 && body['hit'] === true && body['crit'] === true) {
          critBody = body;
          break;
        }
        // Non-crit hit or miss — create fresh encounter next iteration.
      }

      // Fail EXPLICITLY — never silently skip the crit assertions (the DS-T7 hardened pattern).
      expect(
        critBody,
        'HEX-T4: no crit observed in 150 attempts (~0.05% probability) — rerun or investigate RNG',
      ).not.toBeNull();

      // On crit: Hex entry must have rolls.length === 2 (1d6 → 2d6 doubled).
      // PHB p.196: crit doubles all damage dice.
      const perDie = critBody!['perDie'] as Array<{ label: string; rolls?: number[] }>;
      const hexEntry = perDie?.find((e) => e.label === 'Hex');
      expect(hexEntry, 'HEX-T4: expected Hex entry in perDie on crit hit').toBeDefined();
      expect(hexEntry!.rolls?.length).toBe(2);
    },
  );

  // ── HEX-T5: two sequential hits while hexed → both get +1d6 ─────────────────
  // REQ-HEX-05: no once-per-turn gate.

  it(
    'HEX-T5: two sequential hits while hexed → both perDie responses have Hex entry — PHB p.251 (no once-per-turn gate)',
    async () => {
      // PHB p.251: "whenever you hit it with an attack" — no once-per-turn restriction.
      // Contrast Sneak Attack which explicitly says "once per turn" (PHB p.96).
      const app = await getTestApp();
      const fresh = await makeFreshEncounter(app, 'HEX-T5 two-hits', { npcHp: 500 });
      const { encounterId, casterCombatantId, npcCombatantId } = fresh;

      await applyHex(encounterId, npcCombatantId, casterCombatantId);

      // Hit #1.
      const hitBody1 = await retryUntilHit(
        encounterId,
        casterCombatantId,
        npcCombatantId,
        casterLongswordInstanceId,
        fresh.version,
      );
      expect(hitBody1, 'HEX-T5 hit #1: failed to hit in 20 attempts').not.toBeNull();

      const perDie1 = hitBody1!['perDie'] as Array<{ label: string; rolls?: number[] }>;
      const hexEntry1 = perDie1?.find((e) => e.label === 'Hex');
      expect(hexEntry1, 'HEX-T5 hit #1: expected Hex entry in perDie').toBeDefined();

      // Reload version for hit #2.
      const encResAfterHit1 = await app.inject({
        method: 'GET',
        url: `/api/v1/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      const version2 = (encResAfterHit1.json() as { version: number }).version;

      // Hit #2 — Hex must fire again (no once-per-turn gate).
      const hitBody2 = await retryUntilHit(
        encounterId,
        casterCombatantId,
        npcCombatantId,
        casterLongswordInstanceId,
        version2,
      );
      expect(hitBody2, 'HEX-T5 hit #2: failed to hit in 20 attempts').not.toBeNull();

      const perDie2 = hitBody2!['perDie'] as Array<{ label: string; rolls?: number[] }>;
      const hexEntry2 = perDie2?.find((e) => e.label === 'Hex');
      expect(hexEntry2, 'HEX-T5 hit #2: expected Hex entry in perDie (no once-per-turn gate)').toBeDefined();
    },
  );

  // ── HEX-T6: null-source hex → never fires ────────────────────────────────────
  // REQ-HEX-08.

  it(
    'HEX-T6: hex applied without sourceCombatantId (null source) → no Hex entry in perDie for any attacker — PHB p.251',
    async () => {
      // Slice A ON DELETE SET NULL semantics: if source combatant is deleted,
      // sourceCombatantId becomes null. hasEffectFromSelf: null !== any UUID → false.
      // We simulate this by applying the effect without a sourceCombatantId.
      const app = await getTestApp();
      const fresh = await makeFreshEncounter(app, 'HEX-T6 null-source hex');

      // Apply with null source (no sourceCombatantId in payload).
      const hexRes = await applyHex(fresh.encounterId, fresh.npcCombatantId, null);
      expect(hexRes.statusCode).toBe(200);

      const hitBody = await retryUntilHit(
        fresh.encounterId,
        fresh.casterCombatantId,
        fresh.npcCombatantId,
        casterLongswordInstanceId,
        fresh.version,
      );
      expect(hitBody, 'HEX-T6: failed to hit in 20 attempts').not.toBeNull();

      const perDie = hitBody!['perDie'] as Array<{ label: string }>;
      const hexEntry = perDie?.find((e) => e.label === 'Hex');
      expect(hexEntry, 'HEX-T6: Hex MUST be absent for null-source effect').toBeUndefined();
    },
  );

  // ── HEX-T7: miss → no Hex damage ─────────────────────────────────────────────
  // REQ-HEX-09.

  it(
    'HEX-T7: miss against hexed target → no Hex entry in perDie (Hex is ON_HIT — PHB p.251)',
    async () => {
      // PHB p.251: "whenever you HIT it" — the rider is on-hit only.
      // High AC (30) → guaranteed miss for all non-nat-20 rolls.
      const app = await getTestApp();
      const fresh = await makeFreshEncounter(app, 'HEX-T7 miss', {
        npcAc: 30,
        npcHp: 50,
      });

      await applyHex(fresh.encounterId, fresh.npcCombatantId, fresh.casterCombatantId);

      // Attempt attack once — AC=30 makes miss overwhelmingly likely.
      // Retry once if nat-20 crit hits AC=30 regardless.
      let missBody: Record<string, unknown> | null = null;
      let version = fresh.version;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { statusCode, body } = await doAttack(
          fresh.encounterId,
          fresh.casterCombatantId,
          fresh.npcCombatantId,
          casterLongswordInstanceId,
          version,
        );
        if (statusCode === 200 && body['hit'] === false) {
          missBody = body;
          break;
        }
        // Rare nat-20 hit — update version and retry for a miss.
        const encRes = await app.inject({
          method: 'GET',
          url: `/api/v1/encounters/${fresh.encounterId}`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
        });
        version = (encRes.json() as { version: number }).version;
      }

      expect(missBody, 'HEX-T7: could not get a miss against AC=30 in 5 attempts (extreme outlier)').not.toBeNull();
      expect(missBody!['hit']).toBe(false);

      // On miss: breakdown is empty or perDie has no Hex entry.
      const perDie = missBody!['perDie'] as Array<{ label: string }> | undefined;
      const hexEntry = perDie?.find((e) => e.label === 'Hex');
      expect(hexEntry, 'HEX-T7: Hex MUST be absent on miss (ON_HIT trigger)').toBeUndefined();
    },
  );
});

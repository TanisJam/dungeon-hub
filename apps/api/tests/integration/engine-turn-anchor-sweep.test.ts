/**
 * Integration tests — engine-turn-anchor-sweep (Slice 3b-i: turn-anchor duration sweep).
 *
 * Verifies that advanceEncounterTurn sweeps anchored conditions correctly:
 *   TAS-T1: backward-compat — null-anchor (permanent) condition survives repeated advances (REQ-TAS-02)
 *   TAS-T2: two-fire trace — turns_remaining=1 survives first anchor-turn-end, expires at second (REQ-TAS-04)
 *   TAS-T3: dual-pair sweep — Stunned+Incapacitated both deleted in one DELETE pass (REQ-TAS-05)
 *   TAS-T4: three-fire trace — turns_remaining=2 survives two anchor-turn-ends, expires at third (REQ-TAS-09)
 *   TAS-T5: no-op advance — no anchored conditions → turn advances normally, no error (REQ-TAS-07)
 *   TAS-T6: start-boundary NOT swept — boundary='start' rows untouched by 3b-i DELETE (REQ-TAS-06)
 *   TAS-T7: VERSION_CONFLICT — stale version → 409, condition NOT decremented (REQ-TAS-03)
 *
 * PHB p.189: duration timing — "until the end of X's next turn" = two-fire expiry pattern.
 * PHB p.85:  Stunning Strike — motivating consumer.
 * PHB p.292: Stunned implies Incapacitated (dual-insert via applyConditions loop).
 *
 * Seeding: mirrors engine-forced-check.test.ts — Fighter (PC, initiative 20) vs Goblin (NPC, initiative 5).
 * Fighter is currentCombatantId at encounter start (highest initiative).
 * Turn order: Fighter → Goblin → Fighter → Goblin → ...
 *   advance 1: outgoing=Fighter
 *   advance 2: outgoing=Goblin
 *   advance 3: outgoing=Fighter (Fire 2)
 *   advance 4: outgoing=Goblin
 *   advance 5: outgoing=Fighter (Fire 3)
 *
 * Known pre-existing failures (NOT ours): health.test.ts, auth-link-revoke.test.ts (GoTrue/Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('engine-turn-anchor-sweep — POST /encounters/:id/advance-turn + /actions/forced-check', () => {
  let gm: TestUser;
  let campaignId: string;
  let fighterCharId: string;

  // ── expectOk helper ────────────────────────────────────────────────────────────

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  // ── beforeAll: create GM, campaign, Fighter character ────────────────────────

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Turn Anchor Sweep Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    const worldId = campaign.worldId as string;

    // Fighter L1 — CON+2 (score 14), STR+2 (score 15). Mirror engine-forced-check.test.ts.
    const fighter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Aldric (sweep test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighter.id as string;

    await expectOk(
      'fighter-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          method: 'standard-array',
          scores: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 },
        },
      }),
    );

    await expectOk(
      'fighter-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/class`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['athletics', 'perception'],
        },
      }),
    );
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  // ── makeFreshEncounter helper ─────────────────────────────────────────────────
  // Returns { encounterId, fighterId, npcId, version } — fighterId is currentCombatantId.

  const makeFreshEncounter = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    name: string,
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
            {
              name: 'Aldric',
              kind: 'pc',
              characterId: fighterCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
            },
            {
              name: 'Goblin',
              kind: 'npc',
              initiative: 5,
              hpCurrent: 20,
              hpMax: 20,
              ac: 13,
            },
          ],
        },
      })
      .then((r) => r.json());

    const fighterId = enc.currentCombatantId as string; // highest initiative → current
    const npcId =
      (enc.combatants.find((c: { id: string }) => c.id !== fighterId)?.id as string) ?? '';
    const version = enc.version as number;
    return { encounterId: enc.id as string, fighterId, npcId, version };
  };

  // ── advanceTurn helper ────────────────────────────────────────────────────────
  // Calls POST /encounters/:id/advance-turn, returns new version + encounter body.

  const advanceTurn = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    encounterId: string,
    version: number,
  ): Promise<{ newVersion: number; currentCombatantId: string; statusCode: number }> => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/advance-turn`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { version },
    });
    if (res.statusCode !== 200) {
      return { newVersion: version, currentCombatantId: '', statusCode: res.statusCode };
    }
    const body = res.json();
    return {
      newVersion: body.version as number,
      currentCombatantId: body.currentCombatantId as string,
      statusCode: res.statusCode,
    };
  };

  // ── applyStunnedToNpc helper ──────────────────────────────────────────────────
  // Applies Stunned (+ Incapacitated) to the NPC goblin via forced-check.
  // Uses DC=30 + npcSaveMod=0 → deterministically fails.

  const applyStunnedToNpc = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    encounterId: string,
    npcId: string,
    anchorOpts?: {
      turnAnchorEntityId: string;
      turnAnchorBoundary: 'start' | 'end';
      turnsRemaining: number;
    },
  ) => {
    const payload: Record<string, unknown> = {
      targetCombatantId: npcId,
      ability: 'con',
      dc: 30,
      conditionOnFail: 'Stunned',
      npcSaveMod: 0,
    };
    if (anchorOpts) {
      payload['turnAnchorEntityId'] = anchorOpts.turnAnchorEntityId;
      payload['turnAnchorBoundary'] = anchorOpts.turnAnchorBoundary;
      payload['turnsRemaining'] = anchorOpts.turnsRemaining;
    }
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload,
    });
    return res;
  };

  // ── isStunned probe ───────────────────────────────────────────────────────────
  // Probes whether Goblin is still Stunned by trying an STR save at DC=30.
  // If Stunned → auto-fail (outcome='autoFail', reason='stunned-str-dex').
  // If NOT stunned → rolls (outcome='fail' or 'save').
  // Returns true if Stunned (auto-fail), false if not.

  const isStunnedProbe = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    encounterId: string,
    npcId: string,
  ): Promise<boolean> => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId: npcId,
        ability: 'str',
        dc: 30,
        conditionOnFail: 'Stunned',
        npcSaveMod: 0,
      },
    });
    const body = res.json();
    return body.outcome === 'autoFail';
  };

  // ── wasReinserted probe ───────────────────────────────────────────────────────
  // After a sweep, if Stunned was removed, a new forced-check fail REINSERTS it.
  // applied=['Stunned','Incapacitated'] means the row was absent (deleted) and re-inserted.
  // Returns true if both conditions were re-inserted (proving absence before this call).

  const wasReinserted = async (
    app: Awaited<ReturnType<typeof getTestApp>>,
    encounterId: string,
    npcId: string,
  ): Promise<boolean> => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${encounterId}/actions/forced-check`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        targetCombatantId: npcId,
        ability: 'str',
        dc: 30,
        conditionOnFail: 'Stunned',
        npcSaveMod: 0,
      },
    });
    if (res.statusCode !== 200) return false;
    const body = res.json();
    // outcome='fail' (rolls since NOT stunned) + applied contains both conditions
    return (
      body.outcome === 'fail' &&
      Array.isArray(body.applied) &&
      body.applied.includes('Stunned') &&
      body.applied.includes('Incapacitated')
    );
  };

  // ── TAS-T1: backward-compat — permanent condition survives 5 advances ─────────

  it(
    'TAS-T1: backward-compat — null-anchor Stunned survives 5 advance-turns (REQ-TAS-02, ADR-4)',
    async () => {
      // PHB p.292: Stunned + Incapacitated dual-insert.
      // Apply Stunned WITHOUT anchor params → null columns → SQL NULL != value → never swept.
      // Advance turn 5 times. Assert Goblin STILL Stunned after all advances.
      const app = await getTestApp();
      const { encounterId, npcId, version } = await makeFreshEncounter(
        app,
        'TAS-T1 backward-compat permanent condition',
      );

      // Apply Stunned with NO anchor params (permanent).
      const applyRes = await applyStunnedToNpc(app, encounterId, npcId);
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().applied).toContain('Stunned');

      // Advance 5 times, chaining versions.
      let v = version;
      for (let i = 0; i < 5; i++) {
        const adv = await advanceTurn(app, encounterId, v);
        expect(adv.statusCode).toBe(200);
        v = adv.newVersion;
      }

      // Goblin should still be Stunned (STR auto-fail probe).
      const stunned = await isStunnedProbe(app, encounterId, npcId);
      expect(stunned).toBe(true);
    },
  );

  // ── TAS-T2: two-fire trace — turns_remaining=1 (REQ-TAS-04, PHB p.189) ────────

  it(
    'TAS-T2: two-fire trace — turns_remaining=1 survives Fire 1, expires at Fire 2 (REQ-TAS-04, PHB p.189)',
    async () => {
      // Setup: Fighter(20) current. Apply Stunned to Goblin with anchor=Fighter, boundary='end', turnsRemaining=1.
      // Turn order (2 combatants): F→G→F→G→...
      //   advance 1 (outgoing=Fighter = Fire 1): DELETE finds 0 (turnsRemaining=1>0), DECREMENT 1→0. Still Stunned.
      //   advance 2 (outgoing=Goblin):  no match (anchor=Fighter, outgoing=Goblin) → no-op. Still Stunned.
      //   advance 3 (outgoing=Fighter = Fire 2): DELETE finds row (turnsRemaining=0, boundary='end') → DELETED.
      const app = await getTestApp();
      const { encounterId, fighterId, npcId, version } = await makeFreshEncounter(
        app,
        'TAS-T2 two-fire trace turns_remaining=1',
      );

      const applyRes = await applyStunnedToNpc(app, encounterId, npcId, {
        turnAnchorEntityId: fighterId,
        turnAnchorBoundary: 'end',
        turnsRemaining: 1,
      });
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().applied).toContain('Stunned');

      // Fire 1: advance (outgoing=Fighter). DECREMENT 1→0. Goblin still Stunned.
      const adv1 = await advanceTurn(app, encounterId, version);
      expect(adv1.statusCode).toBe(200);
      const stunned1 = await isStunnedProbe(app, encounterId, npcId);
      expect(stunned1).toBe(true); // still present after Fire 1 (turned_remaining=0 but not yet deleted)

      // Goblin's turn: advance (outgoing=Goblin). Anchor=Fighter → no match → no-op.
      const adv2 = await advanceTurn(app, encounterId, adv1.newVersion);
      expect(adv2.statusCode).toBe(200);
      const stunned2 = await isStunnedProbe(app, encounterId, npcId);
      expect(stunned2).toBe(true); // still present (sweep didn't run for Goblin anchor)

      // Fire 2: advance (outgoing=Fighter). DELETE finds turns_remaining=0 → removes BOTH rows.
      const adv3 = await advanceTurn(app, encounterId, adv2.newVersion);
      expect(adv3.statusCode).toBe(200);

      // Now Goblin is NO LONGER Stunned → reinsertion probe confirms deletion.
      const reinserted = await wasReinserted(app, encounterId, npcId);
      expect(reinserted).toBe(true); // both Stunned+Incapacitated were absent → re-inserted
    },
  );

  // ── TAS-T3: dual-pair — Stunned+Incapacitated swept atomically (REQ-TAS-05) ───

  it(
    'TAS-T3: dual-pair — Stunned+Incapacitated removed together in one DELETE pass (REQ-TAS-05)',
    async () => {
      // turnsRemaining=0 on insert → expires at very next Fighter turn-end (REQ-TAS-10).
      // advance 1 (outgoing=Fighter): DELETE finds both rows (turns_remaining=0, boundary='end', anchor=Fighter) → DELETED.
      const app = await getTestApp();
      const { encounterId, fighterId, npcId, version } = await makeFreshEncounter(
        app,
        'TAS-T3 dual-pair atomic sweep',
      );

      // Insert with turnsRemaining=0 → deleted at very first anchor turn-end.
      const applyRes = await applyStunnedToNpc(app, encounterId, npcId, {
        turnAnchorEntityId: fighterId,
        turnAnchorBoundary: 'end',
        turnsRemaining: 0,
      });
      expect(applyRes.statusCode).toBe(200);
      const applyBody = applyRes.json();
      // Dual-insert: both Stunned AND Incapacitated inserted.
      expect(applyBody.applied).toContain('Stunned');
      expect(applyBody.applied).toContain('Incapacitated');

      // Advance once (outgoing=Fighter). DELETE matches both rows.
      const adv1 = await advanceTurn(app, encounterId, version);
      expect(adv1.statusCode).toBe(200);

      // Probe: both conditions gone → STR save (not auto-fail) + re-insertion of BOTH.
      const reinserted = await wasReinserted(app, encounterId, npcId);
      expect(reinserted).toBe(true); // Stunned + Incapacitated both re-inserted (both were absent)
    },
  );

  // ── TAS-T4: three-fire trace — turns_remaining=2 (REQ-TAS-09) ─────────────────

  it(
    'TAS-T4: three-fire trace — turns_remaining=2 survives Fire 1+2, expires at Fire 3 (REQ-TAS-09)',
    async () => {
      // Turn order with 2 combatants [Fighter(20), Goblin(5)]:
      //   advance 1 (outgoing=Fighter = Fire 1): DECREMENT 2→1. Goblin still Stunned.
      //   advance 2 (outgoing=Goblin): no match → no-op.
      //   advance 3 (outgoing=Fighter = Fire 2): DECREMENT 1→0. Goblin still Stunned.
      //   advance 4 (outgoing=Goblin): no match → no-op.
      //   advance 5 (outgoing=Fighter = Fire 3): DELETE (turns_remaining=0) → DELETED.
      const app = await getTestApp();
      const { encounterId, fighterId, npcId, version } = await makeFreshEncounter(
        app,
        'TAS-T4 three-fire trace turns_remaining=2',
      );

      const applyRes = await applyStunnedToNpc(app, encounterId, npcId, {
        turnAnchorEntityId: fighterId,
        turnAnchorBoundary: 'end',
        turnsRemaining: 2,
      });
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().applied).toContain('Stunned');

      // Fire 1 (advance 1): outgoing=Fighter. DECREMENT 2→1.
      const adv1 = await advanceTurn(app, encounterId, version);
      expect(adv1.statusCode).toBe(200);
      expect(await isStunnedProbe(app, encounterId, npcId)).toBe(true); // still Stunned

      // Goblin's turn (advance 2): outgoing=Goblin. No match.
      const adv2 = await advanceTurn(app, encounterId, adv1.newVersion);
      expect(adv2.statusCode).toBe(200);
      expect(await isStunnedProbe(app, encounterId, npcId)).toBe(true); // still Stunned

      // Fire 2 (advance 3): outgoing=Fighter. DECREMENT 1→0.
      const adv3 = await advanceTurn(app, encounterId, adv2.newVersion);
      expect(adv3.statusCode).toBe(200);
      expect(await isStunnedProbe(app, encounterId, npcId)).toBe(true); // still Stunned (turns_remaining=0 but not deleted yet)

      // Goblin's turn (advance 4): outgoing=Goblin. No match.
      const adv4 = await advanceTurn(app, encounterId, adv3.newVersion);
      expect(adv4.statusCode).toBe(200);
      expect(await isStunnedProbe(app, encounterId, npcId)).toBe(true); // still Stunned

      // Fire 3 (advance 5): outgoing=Fighter. DELETE (turns_remaining=0) → REMOVED.
      const adv5 = await advanceTurn(app, encounterId, adv4.newVersion);
      expect(adv5.statusCode).toBe(200);

      // Goblin no longer Stunned → re-insertion probe confirms both rows were deleted.
      const reinserted = await wasReinserted(app, encounterId, npcId);
      expect(reinserted).toBe(true);
    },
  );

  // ── TAS-T5: no-op advance — no anchored conditions (REQ-TAS-07) ──────────────

  it(
    'TAS-T5: no-op advance — no anchored conditions → turn advances normally (REQ-TAS-07)',
    async () => {
      // Fresh encounter with NO conditions applied.
      // Advance turn → should succeed with 200, version incremented, currentCombatantId changed.
      const app = await getTestApp();
      const { encounterId, fighterId, npcId, version } = await makeFreshEncounter(
        app,
        'TAS-T5 no-op advance no conditions',
      );

      const adv = await advanceTurn(app, encounterId, version);
      expect(adv.statusCode).toBe(200);
      expect(adv.newVersion).toBe(version + 1);
      // After advancing from Fighter(20), current should be Goblin(5).
      expect(adv.currentCombatantId).toBe(npcId);
      // Verify we can advance again (second advance works — Goblin → Fighter).
      const adv2 = await advanceTurn(app, encounterId, adv.newVersion);
      expect(adv2.statusCode).toBe(200);
      expect(adv2.currentCombatantId).toBe(fighterId);
    },
  );

  // ── TAS-T6: 'start'-boundary NOT swept (REQ-TAS-06) ──────────────────────────

  it(
    'TAS-T6: start-boundary condition NOT swept when turns_remaining=0 (REQ-TAS-06, ADR-2)',
    async () => {
      // boundary='start' → 3b-i DELETE clause keys only on boundary='end' → row persists.
      // This is intentionally deferred: no PHB effect uses "until START of X's next turn".
      const app = await getTestApp();
      const { encounterId, fighterId, npcId, version } = await makeFreshEncounter(
        app,
        'TAS-T6 start-boundary not swept',
      );

      // Insert with boundary='start', turnsRemaining=0.
      const applyRes = await applyStunnedToNpc(app, encounterId, npcId, {
        turnAnchorEntityId: fighterId,
        turnAnchorBoundary: 'start',
        turnsRemaining: 0,
      });
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().applied).toContain('Stunned');

      // Advance once (outgoing=Fighter). 'start' rows NOT deleted.
      const adv = await advanceTurn(app, encounterId, version);
      expect(adv.statusCode).toBe(200);

      // Goblin STILL Stunned (start-boundary row survived the advance).
      const stunned = await isStunnedProbe(app, encounterId, npcId);
      expect(stunned).toBe(true);
    },
  );

  // ── TAS-T7: VERSION_CONFLICT — stale version, sweep rolled back (REQ-TAS-03) ──

  it(
    'TAS-T7: VERSION_CONFLICT — stale version returns 409, condition NOT decremented (REQ-TAS-03)',
    async () => {
      // Apply anchored condition with turnsRemaining=1.
      // Call advance-turn with version-1 (stale) → 409 VERSION_CONFLICT.
      // Verify condition is still present and turns_remaining was NOT decremented
      // (probe: Goblin still Stunned via STR auto-fail → rows not touched).
      //
      // Note: this proves the WHERE+version guard aborted the sweep (CAS matched 0 rows).
      // It does not directly prove Drizzle rollback isolation, but the CAS-FIRST pattern
      // guarantees no mutation ran before the early-return (ADR-1 — cheapest abort path).
      const app = await getTestApp();
      const { encounterId, fighterId, npcId, version } = await makeFreshEncounter(
        app,
        'TAS-T7 VERSION_CONFLICT sweep aborted',
      );

      const applyRes = await applyStunnedToNpc(app, encounterId, npcId, {
        turnAnchorEntityId: fighterId,
        turnAnchorBoundary: 'end',
        turnsRemaining: 1,
      });
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().applied).toContain('Stunned');

      // Advance with STALE version (version - 1).
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/advance-turn`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { version: version - 1 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('VERSION_CONFLICT');

      // Goblin still Stunned — sweep did NOT run (CAS guard rejected before any mutation).
      const stunned = await isStunnedProbe(app, encounterId, npcId);
      expect(stunned).toBe(true);

      // Confirm encounter can still advance correctly with the valid version.
      const adv = await advanceTurn(app, encounterId, version);
      expect(adv.statusCode).toBe(200);
      // After valid advance, condition decremented (1→0) but still present.
      const stunnedAfterValid = await isStunnedProbe(app, encounterId, npcId);
      expect(stunnedAfterValid).toBe(true); // turns_remaining=0 but not yet deleted (DELETE-FIRST on next fire)
    },
  );
});

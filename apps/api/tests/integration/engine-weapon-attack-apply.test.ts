/**
 * Integration tests — engine-weapon-attack-apply (engine-attack-apply-damage MUTATION SLICE
 * + engine-to-hit-ac: server-authoritative to-hit + AC).
 *
 * Verifies POST /encounters/:id/actions/attack/apply:
 *   REQ-ATK-APPLY-01: HP is reduced and clamped at 0 (PHB p.197).
 *   REQ-ATK-APPLY-02: server derives damage — client body has NO damage field.
 *   REQ-ATK-VERSION-01: optimistic CAS — fresh version succeeds+bumps; stale → 409.
 *   REQ-ATK-TURN-01: attacker must be currentCombatantId.
 *   REQ-ATK-AUTH-01: GM-only; non-GM → 403.
 *   REQ-ATK-RESPONSE-01: 200 body has hit + to-hit + damage fields on hit.
 *   REQ-ATK-NOTFOUND-01: missing target → 404; missing weapon → 404.
 *   REQ-ATK-NPC-01: NPC target (characterId null) — HP updated via encounter_combatants.
 *   REQ-ATK-PURE-01: read-only /attack still non-mutating (regression gate).
 *   REQ-APPLY-FLOW-02: miss → no HP mutation, no version bump, 200 with hit:false.
 *   REQ-APPLY-FLOW-05: NO_TARGET_AC → 400 VALIDATION_FAILED.
 *   REQ-ROUTE-BODY-01: crit removed from request body — server derives crit from rollToHit.
 *   REQ-ROUTE-BODY-02: miss response: {hit:false, d20, d20All, total, toHitBonus, targetAc}.
 *   REQ-ROUTE-BODY-03: hit response: {hit:true, crit, d20, ..., rolledDamage, perDie, newHp, damageType}.
 *   REQ-ROUTE-BODY-04: NO_TARGET_AC → 400 VALIDATION_FAILED with issues[{code:'NO_TARGET_AC'}].
 *   REQ-AC-CREATE-01: ac required for NPC combatants at creation time → 400 if omitted.
 *
 * RED-first note: tests for the original slice were written before the route existed.
 * engine-to-hit-ac tests follow the same discipline.
 *
 * PHB p.194 — Attack Rolls: nat-20 = auto-hit+crit; nat-1 = auto-miss.
 * PHB p.196 — Critical Hits: dice doubled, flat mods unchanged.
 * PHB p.197 — hp clamp at 0.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

describe('engine-weapon-attack-apply — POST /encounters/:id/actions/attack/apply', () => {
  let gm: TestUser;
  let player: TestUser;  // non-GM, for 403 test

  let campaignId: string;
  let worldId: string;

  // Fighter character (longsword, proficient, STR+2)
  let fighterCharId: string;
  let longswordInstanceId: string;

  // Encounter: fighter (initiative=20) vs NPC goblin (initiative=5)
  let encounterId: string;
  let fighterCombatantId: string;
  let npcCombatantId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
    }
  };

  /** Helper: get current encounter state including version. */
  const getEncounter = async (id: string) => {
    const app = await getTestApp();
    return app
      .inject({
        method: 'GET',
        url: `/api/v1/encounters/${id}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
  };

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();

    // ── Campaign + world ──────────────────────────────────────────────────────
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Apply Damage Integration Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // Player joins as non-GM member (for APPLY-T4 403 test)
    await addCampaignAndWorldMember(campaignId, player.id, 'player');

    // ── Fighter L1 character — STR 15 (+2), pb 2, longsword proficient ────────
    // Standard array [15,14,13,12,10,8] — STR 15 (mod+2). PHB p.15 (pb).
    const fighter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Aldric (apply test)' },
      })
      .then((r) => r.json());
    fighterCharId = fighter.id;

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
    const longsword = fighterSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'longsword',
    );
    longswordInstanceId = longsword?.instanceId ?? '';

    // ── Create encounter: fighter (init=20) vs NPC goblin (init=5, hp=20, ac=13) ──
    // REQ-AC-CREATE-01: NPC combatants now require ac. Goblin ac=13 (PHB MM p.166).
    // Goblin hp=20 so most test damage won't kill it (avoids hp=0 state changes
    // across tests). Individual tests that need specific hp use their own encounters.
    const encounter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'Apply Damage Test Encounter',
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

    encounterId = encounter.id;
    fighterCombatantId = encounter.currentCombatantId; // fighter has highest initiative
    npcCombatantId = encounter.combatants.find(
      (c: { id: string }) => c.id !== fighterCombatantId,
    )?.id ?? '';
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    await closeTestApp();
  });

  // ── APPLY-T1: fresh version succeeds; HP drops; version bumped ────────────────

  it(
    'APPLY-T1: fresh version → 200 with hit:true; HP drops; encounters.version bumps (REQ-ATK-VERSION-01.1, REQ-ROUTE-BODY-03)',
    async () => {
      // PHB p.196: damage reduces HP. REQ-ATK-VERSION-01.1: version becomes version+1.
      // Use a fresh encounter so we know the exact version and hp.
      // The longsword attack rolls to-hit against AC=13; with STR+2+PB+2 = +4 to hit,
      // a roll of 9+ hits. If it misses, loop until a hit is confirmed (or test the shape).
      // We test the shape regardless of hit/miss — version only bumps on hit (REQ-APPLY-FLOW-02).
      const app = await getTestApp();

      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T1 fresh version test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 50, hpMax: 50, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const targetId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';
      const versionBefore: number = freshEnc.version;
      const targetHpBefore = 50;

      // Use ac=1 to guarantee a hit (any roll + toHitBonus >= 1).
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        // REQ-ROUTE-BODY-01: no crit field — server derives crit.
        payload: {
          attackerId,
          targetId,
          weaponInstanceId: longswordInstanceId,
          version: versionBefore,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // REQ-ROUTE-BODY-03: hit response shape when hit=true.
      expect(body.hit).toBe(true);
      expect(typeof body.crit).toBe('boolean');
      expect(typeof body.d20).toBe('number');
      expect(Array.isArray(body.d20All)).toBe(true);
      expect(body.d20All.length).toBe(1); // normal roll mode
      expect(typeof body.total).toBe('number');
      expect(typeof body.toHitBonus).toBe('number');
      expect(body.targetAc).toBe(1);
      expect(typeof body.rolledDamage).toBe('number');
      expect(body.rolledDamage).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(body.perDie)).toBe(true);
      expect(body.perDie.length).toBeGreaterThan(0);
      expect(typeof body.newHp).toBe('number');

      // HP must have dropped by rolledDamage (or clamped to 0)
      const expectedNewHp = Math.max(0, targetHpBefore - body.rolledDamage);
      expect(body.newHp).toBe(expectedNewHp);

      // Verify HP persisted in DB
      const afterEnc = await getEncounter(freshEnc.id);
      const goblinAfter = afterEnc.combatants.find(
        (c: { id: string }) => c.id === targetId,
      );
      expect(goblinAfter?.hpCurrent).toBe(expectedNewHp);

      // REQ-ATK-VERSION-01.1: version incremented on hit
      expect(afterEnc.version).toBe(versionBefore + 1);
    },
  );

  // ── APPLY-T2: stale version → 409 VERSION_CONFLICT ───────────────────────────

  it(
    'APPLY-T2: stale version → 409 VERSION_CONFLICT; no HP mutation (REQ-ATK-VERSION-01.2)',
    async () => {
      // PHB p.197: HP should not change on a failed request.
      const app = await getTestApp();

      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T2 stale version test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 15, hpMax: 15, ac: 13 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const targetId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';
      const currentVersion: number = freshEnc.version;
      const staleVersion = currentVersion - 1; // definitely stale

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId,
          targetId,
          weaponInstanceId: longswordInstanceId,
          version: staleVersion,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('VERSION_CONFLICT');

      // Verify no HP mutation occurred
      const afterEnc = await getEncounter(freshEnc.id);
      const goblinAfter = afterEnc.combatants.find(
        (c: { id: string }) => c.id === targetId,
      );
      expect(goblinAfter?.hpCurrent).toBe(15); // unchanged
      expect(afterEnc.version).toBe(currentVersion); // version unchanged
    },
  );

  // ── APPLY-T3: attacker not current combatant → 409 NOT_YOUR_TURN ─────────────

  it(
    'APPLY-T3: attacker is not currentCombatantId → 409 NOT_YOUR_TURN (REQ-ATK-TURN-01.2)',
    async () => {
      const app = await getTestApp();

      // Create encounter where NPC has highest initiative (NPC's turn)
      const npcFirstEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T3 not-your-turn test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 5, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin', kind: 'npc', initiative: 20, hpCurrent: 7, hpMax: 7, ac: 13 },
            ],
          },
        })
        .then((r) => r.json());

      // NPC is currentCombatantId (initiative 20)
      const currentId: string = npcFirstEnc.currentCombatantId;
      // Fighter's combatant ID (NOT current)
      const fighterCombId: string = npcFirstEnc.combatants.find(
        (c: { id: string }) => c.id !== currentId,
      )?.id ?? '';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${npcFirstEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombId, // not the current combatant
          targetId: currentId,
          weaponInstanceId: longswordInstanceId,
          version: npcFirstEnc.version,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('NOT_YOUR_TURN');
    },
  );

  // ── APPLY-T4: non-GM caller → 403 FORBIDDEN ──────────────────────────────────

  it(
    'APPLY-T4: non-GM player → 403 FORBIDDEN (REQ-ATK-AUTH-01.2)',
    async () => {
      // PHB: DM controls combat state. REQ-ATK-AUTH-01.2: non-GM must be rejected.
      const app = await getTestApp();

      const enc = await getEncounter(encounterId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
        headers: { authorization: `Bearer ${player.accessToken}` }, // non-GM player
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
          version: enc.version,
        },
      });

      expect(res.statusCode).toBe(403);
    },
  );

  // ── APPLY-T5: missing targetId → 404 NOT_FOUND ───────────────────────────────

  it(
    'APPLY-T5: targetId not in encounter → 404 NOT_FOUND (REQ-ATK-NOTFOUND-01.1)',
    async () => {
      const app = await getTestApp();
      const enc = await getEncounter(encounterId);
      const fakeTargetId = '00000000-0000-0000-0000-000000000003';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: fakeTargetId,
          weaponInstanceId: longswordInstanceId,
          version: enc.version,
        },
      });

      expect(res.statusCode).toBe(404);
    },
  );

  // ── APPLY-T6: missing weaponInstanceId → 404 NOT_FOUND ───────────────────────

  it(
    'APPLY-T6: weaponInstanceId not in attacker inventory → 404 NOT_FOUND (REQ-ATK-NOTFOUND-01.2)',
    async () => {
      const app = await getTestApp();
      const enc = await getEncounter(encounterId);
      const fakeWeaponId = '00000000-0000-0000-0000-000000000004';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: fakeWeaponId,
          version: enc.version,
        },
      });

      expect(res.statusCode).toBe(404);
    },
  );

  // ── APPLY-T7: NPC target (characterId=null) → HP updated directly ─────────────

  it(
    'APPLY-T7: NPC target (characterId null) → HP updated without char-sheet query (REQ-ATK-NPC-01.1)',
    async () => {
      // REQ-ATK-NPC-01.1: NPC target handled by updating encounter_combatants directly.
      // The test proves HP changes (=request succeeded) for an NPC target.
      const app = await getTestApp();

      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T7 NPC target test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin (NPC, no char)', kind: 'npc', initiative: 5, hpCurrent: 30, hpMax: 30, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const npcId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';

      // Verify the NPC has no characterId
      const npcCombatant = freshEnc.combatants.find((c: { id: string }) => c.id === npcId);
      expect(npcCombatant?.characterId).toBeNull();

      // Use ac=1 to guarantee a hit.
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId,
          targetId: npcId,
          weaponInstanceId: longswordInstanceId,
          version: freshEnc.version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // REQ-ROUTE-BODY-03: hit response (ac=1 guarantees hit)
      expect(body.hit).toBe(true);

      // NPC HP updated in DB
      const afterEnc = await getEncounter(freshEnc.id);
      const npcAfter = afterEnc.combatants.find((c: { id: string }) => c.id === npcId);
      expect(npcAfter?.hpCurrent).toBe(body.newHp);
      // version bumped
      expect(afterEnc.version).toBe(freshEnc.version + 1);
    },
  );

  // ── APPLY-T8: nat-20 confirmed crit via d20 field ────────────────────────────

  it(
    'APPLY-T8: when d20=20, crit=true in response (REQ-TOHIT-CRIT-01, PHB p.194 + p.196)',
    async () => {
      // PHB p.194: "If the d20 roll for an attack is a 20, the attack hits ... a critical hit."
      // PHB p.196: "Roll all of the attack's damage dice twice."
      // We verify: hit=true, crit=true, and the weapon perDie entry has 2 rolls (2d8 = crit).
      // Since we can't deterministically force a nat-20 in integration, we run multiple
      // attacks (ac=1 guarantees hit) and check that when d20===20, crit===true.
      // This is an indirect proof: the crit value matches nat-20 detection.
      const app = await getTestApp();

      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T8 crit shape test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 200, hpMax: 200, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const targetId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        // REQ-ROUTE-BODY-01: no crit field — server derives it
        payload: {
          attackerId,
          targetId,
          weaponInstanceId: longswordInstanceId,
          version: freshEnc.version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Shape validation: hit + crit fields present and correct type.
      expect(typeof body.hit).toBe('boolean');
      expect(typeof body.crit).toBe('boolean');
      expect(typeof body.d20).toBe('number');
      expect(typeof body.total).toBe('number');
      expect(body.targetAc).toBe(1);

      // Crit must agree with d20 field: crit iff d20===20 (PHB p.194).
      if (body.d20 === 20) {
        expect(body.crit).toBe(true);
        // On crit: weapon entry should have 2 die rolls (1d8 → 2d8).
        const weaponEntry = body.perDie.find(
          (e: { label: string; rolls?: number[] }) => e.label === 'weapon',
        );
        expect(weaponEntry?.rolls?.length).toBe(2);
      } else {
        expect(body.crit).toBe(false);
        // On non-crit: weapon entry has 1 die roll (1d8 → 1d8).
        const weaponEntry = body.perDie.find(
          (e: { label: string; rolls?: number[] }) => e.label === 'weapon',
        );
        expect(weaponEntry?.rolls?.length).toBe(1);
      }
    },
  );

  // ── APPLY-T9: overkill → newHp = 0 ──────────────────────────────────────────

  it(
    'APPLY-T9: damage exceeds hpCurrent → newHp === 0 (REQ-ATK-APPLY-01.2, PHB p.197)',
    async () => {
      // PHB p.197: "Hit points can't go below 0." Overkill damage is discarded.
      const app = await getTestApp();

      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T9 overkill test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              // hp=1, ac=1 ensures a hit. Any damage kills it (min longsword = 1d8+2 = 3 min).
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 1, hpMax: 7, ac: 1 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const targetId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId,
          targetId,
          weaponInstanceId: longswordInstanceId,
          version: freshEnc.version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // PHB p.197: newHp must be 0 (not negative); ac=1 ensures hit.
      expect(body.hit).toBe(true);
      expect(body.newHp).toBe(0);
      expect(body.newHp).toBeGreaterThanOrEqual(0);

      // Verify persisted in DB
      const afterEnc = await getEncounter(freshEnc.id);
      const goblinAfter = afterEnc.combatants.find(
        (c: { id: string }) => c.id === targetId,
      );
      expect(goblinAfter?.hpCurrent).toBe(0);
    },
  );

  // ── APPLY-T10: REGRESSION — read-only /attack version unchanged ───────────────

  it(
    'APPLY-T10: POST /attack (read-only) still does NOT mutate version (REQ-ATK-PURE-01.1, REQ-ATK-READONLY-01)',
    async () => {
      // REQ-ATK-READONLY-01: the read-only /attack endpoint must remain zero-mutation.
      // This is the regression gate for the ADR-8 buildAttackContext refactor.
      const app = await getTestApp();

      const before = await getEncounter(encounterId);
      const versionBefore = before.version;
      const goblinHpBefore = before.combatants.find(
        (c: { id: string }) => c.id === npcCombatantId,
      )?.hpCurrent;

      await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      const after = await getEncounter(encounterId);
      // Version must NOT change (REQ-ATK-READONLY-01)
      expect(after.version).toBe(versionBefore);
      // HP must NOT change
      const goblinHpAfter = after.combatants.find(
        (c: { id: string }) => c.id === npcCombatantId,
      )?.hpCurrent;
      expect(goblinHpAfter).toBe(goblinHpBefore);
    },
  );

  // ── APPLY-T11: miss → hit:false, no HP mutation, no version bump ──────────────

  it(
    'APPLY-T11: attack misses → 200 with hit:false; no HP mutation; no version bump (REQ-APPLY-FLOW-02, REQ-ROUTE-BODY-02)',
    async () => {
      // PHB p.194: a miss causes no damage.
      // Use an impossibly high AC (30) so the attack always misses.
      // Even nat-20 (total=20+bonus) misses... wait, nat-20 is always a hit (PHB p.194).
      // Use ac=30 with toHitBonus ~+4 — any non-nat-20 misses (16/20 = 80% miss chance).
      // We create a fresh encounter and run until we get a miss, OR we verify the shape
      // when hit=false. The RNG is unpredictable in integration — but with ac=30 and
      // a +4 bonus, only a nat-20 hits (5% chance), so most runs produce hit:false.
      // If we accidentally hit (nat-20), the test runs a second encounter with same setup.
      const app = await getTestApp();

      let hitFalseBody: Record<string, unknown> | null = null;
      let attempts = 0;

      while (!hitFalseBody && attempts < 20) {
        attempts++;

        const freshEnc = await app
          .inject({
            method: 'POST',
            url: '/api/v1/encounters',
            headers: { authorization: `Bearer ${gm.accessToken}` },
            payload: {
              campaignId,
              name: `APPLY-T11 miss test attempt ${attempts}`,
              combatants: [
                { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
                // ac=30 — only a nat-20 hits
                { name: 'Dragon', kind: 'npc', initiative: 5, hpCurrent: 100, hpMax: 100, ac: 30 },
              ],
            },
          })
          .then((r) => r.json());

        const attackerId: string = freshEnc.currentCombatantId;
        const targetId: string = freshEnc.combatants.find(
          (c: { id: string }) => c.id !== attackerId,
        )?.id ?? '';
        const versionBefore: number = freshEnc.version;
        const npcHpBefore: number = 100;

        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            attackerId,
            targetId,
            weaponInstanceId: longswordInstanceId,
            version: freshEnc.version,
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();

        if (body.hit === false) {
          hitFalseBody = body;

          // REQ-ROUTE-BODY-02: miss response shape.
          expect(body.hit).toBe(false);
          expect(typeof body.d20).toBe('number');
          expect(Array.isArray(body.d20All)).toBe(true);
          expect(body.d20All.length).toBe(1);
          expect(typeof body.total).toBe('number');
          expect(typeof body.toHitBonus).toBe('number');
          expect(body.targetAc).toBe(30);
          // No damage fields on a miss (REQ-TOHIT-CRIT-02)
          expect(body.rolledDamage).toBeUndefined();
          expect(body.perDie).toBeUndefined();
          expect(body.newHp).toBeUndefined();
          expect(body.damageType).toBeUndefined();
          // No HP mutation (REQ-APPLY-FLOW-02)
          const afterEnc = await getEncounter(freshEnc.id);
          const npcAfter = afterEnc.combatants.find((c: { id: string }) => c.id === targetId);
          expect(npcAfter?.hpCurrent).toBe(npcHpBefore);
          // No version bump (REQ-APPLY-FLOW-02: miss is a no-op mutation)
          expect(afterEnc.version).toBe(versionBefore);
        }
        // If hit=true (nat-20), loop again for another attempt.
      }

      // If all 20 attempts produced nat-20s (astronomically unlikely — 0.05^20 ≈ 10^-26),
      // fail with a meaningful message.
      if (!hitFalseBody) {
        throw new Error('APPLY-T11: could not produce a miss after 20 attempts (impossible with ac=30 unless RNG always returns 20)');
      }
    },
  );

  // ── APPLY-T12: NO_TARGET_AC → 400 VALIDATION_FAILED ─────────────────────────

  it(
    'APPLY-T12: NPC target with null AC → 400 VALIDATION_FAILED {code:NO_TARGET_AC} (REQ-APPLY-FLOW-05, REQ-ROUTE-BODY-04)',
    async () => {
      // REQ-AC-RESOLVE-04: legacy NPC row with ac=NULL → NO_TARGET_AC → 400.
      // We bypass the create-encounter Zod refine by directly inserting a combatant
      // with a null AC via a separate encounter that uses the DB directly.
      // Alternative: use the SQL migration's nullable column.
      //
      // We use a raw DB insert to simulate a legacy row with ac=NULL.
      // The `createEncounter` route now requires ac for NPC — so we can't use the API.
      // Instead: create encounter with a PC attacker (ac not required for PC), then
      // we can't easily insert a null-ac NPC via the API.
      //
      // Pragmatic approach: insert via drizzle directly in the test helper.
      const { db: testDb } = await import('../../src/infra/db/client.js');
      const { encounterCombatants: ec, encounters: enc } = await import('../../src/infra/db/schema.js');
      const { eq: drEq } = await import('drizzle-orm');

      const app = await getTestApp();

      // Create encounter first (with a valid NPC so the route works).
      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T12 NO_TARGET_AC test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              // Initially valid NPC — we'll patch the ac to null directly in DB.
              { name: 'LegacyNpc', kind: 'npc', initiative: 5, hpCurrent: 20, hpMax: 20, ac: 13 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const npcId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';

      // Patch the NPC's ac to null in the DB to simulate a legacy row.
      await testDb
        .update(ec)
        .set({ ac: null })
        .where(drEq(ec.id, npcId));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId,
          targetId: npcId,
          weaponInstanceId: longswordInstanceId,
          version: freshEnc.version,
        },
      });

      // REQ-ROUTE-BODY-04: NO_TARGET_AC → 400 VALIDATION_FAILED with issues[].
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues.some((i: { code: string }) => i.code === 'NO_TARGET_AC')).toBe(true);

      // No HP mutation — NPC hp unchanged.
      const afterEnc = await getEncounter(freshEnc.id);
      const npcAfter = afterEnc.combatants.find((c: { id: string }) => c.id === npcId);
      expect(npcAfter?.hpCurrent).toBe(20); // unchanged
      expect(afterEnc.version).toBe(freshEnc.version); // version unchanged
    },
  );

  // ── APPLY-T13: NPC creation without ac → 400 VALIDATION_FAILED ───────────────

  it(
    'APPLY-T13: POST /encounters with NPC combatant missing ac → 400 VALIDATION_FAILED (REQ-AC-CREATE-01)',
    async () => {
      // REQ-AC-CREATE-01: ac REQUIRED for NPC combatants at creation time.
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'APPLY-T13 missing ac test',
          combatants: [
            { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
            // NPC without ac — should be rejected by Zod refine
            { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 7, hpMax: 7 },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
    },
  );

  // ── APPLY-T14: PC combatant creation with ac field → ac silently ignored (REQ-AC-CREATE-02) ──

  it(
    'APPLY-T14: POST /encounters with PC combatant including ac:18 → ac NOT persisted (REQ-AC-CREATE-02)',
    async () => {
      // REQ-AC-CREATE-02: ac field is optional/ignored for PC combatants.
      // The PC's AC is always derived server-side at attack time; the column must stay NULL.
      // This test proves the silent-ignore contract: body ac=18 is stripped, row stores null.
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'APPLY-T14 PC ac ignored test',
          combatants: [
            // PC combatant includes ac:18 — should be silently stripped
            {
              name: 'Aldric',
              kind: 'pc',
              characterId: fighterCharId,
              initiative: 20,
              hpCurrent: 12,
              hpMax: 12,
              ac: 18,
            },
            { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 7, hpMax: 7, ac: 13 },
          ],
        },
      });

      // Encounter creation must succeed (201) — ac:18 on a PC is not a validation error.
      expect(res.statusCode).toBe(201);
      const created = res.json();

      // Find the PC combatant in the response.
      const pcCombatant = created.combatants.find(
        (c: { kind: string }) => c.kind === 'pc',
      );
      expect(pcCombatant).toBeDefined();

      // REQ-AC-CREATE-02: the provided ac:18 MUST NOT be stored for a PC combatant.
      // The column must be null — PC AC is always derived at attack time.
      expect(pcCombatant?.ac).toBeNull();

      // Verify via GET that the DB column is indeed null (not just a serialization artifact).
      const fetched = await getEncounter(created.id);
      const pcFetched = fetched.combatants.find(
        (c: { kind: string }) => c.kind === 'pc',
      );
      expect(pcFetched?.ac).toBeNull();

      // NPC combatant should have its ac persisted normally.
      const npcFetched = fetched.combatants.find(
        (c: { kind: string }) => c.kind === 'npc',
      );
      expect(npcFetched?.ac).toBe(13);
    },
  );

  // ── APPLY-T15: PC target AC derivation — Cloak of Protection +1 (SUGGESTION 2 / Scenario 13) ──

  it(
    'APPLY-T15: PC target → AC derived server-side including persisted Cloak of Protection +1 (REQ-AC-RESOLVE-02, Scenario 13)',
    async () => {
      // PHB p.14 — Armor Class; DMG 159 — Cloak of Protection (+1 AC).
      // REQ-AC-RESOLVE-02: PC-target AC is derived via the 10-step leaf loader flow
      // (loadItemDataMany + loadPersistedModifiers + deriveArmorClassModifiers + resolveStat).
      //
      // Setup:
      //   Target PC: DEX 14 (+2 mod), no armor → unarmored AC = 10 + 2 = 12.
      //   Cloak of Protection: persisted modifier_instance for target → +1 AC (item category).
      //   Derived AC = 12 + 1 = 13.
      //
      // RNG proof: the response always includes targetAc (on both hit and miss — REQ-APPLY-FLOW-02
      // + REQ-APPLY-FLOW-03). We assert targetAc === 13 regardless of the d20 outcome.
      // This proves the full PC derive path ran end-to-end (NOT a stored column value).
      //
      // The Cloak +1 is what makes targetAc=13 vs targetAc=12. If the persisted modifier
      // were ignored, targetAc would be 12. The assertion only passes if the server
      // correctly loaded the modifier_instance via loadPersistedModifiers and included it
      // in the AC derivation.

      const app = await getTestApp();

      // ── Step 1: Create target PC character (DEX 14) ───────────────────────────
      const targetCharRes = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: { worldId, name: 'Cloaked Scout (APPLY-T15 target)' },
        })
        .then((r) => r.json());
      const targetCharId: string = targetCharRes.id;

      // Set DEX 14 (+2) using the standard array [15,14,13,12,10,8].
      // DEX=14 (+2 mod) → unarmored AC = 10 + 2 = 12. (PHB p.14)
      // The standard array must be fully distributed: str=15,dex=14,con=13,int=12,wis=10,cha=8.
      await expectOk(
        'T15-target-stats',
        await app.inject({
          method: 'PUT',
          url: `/api/v1/characters/${targetCharId}/stats`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            method: 'standard-array',
            scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
          },
        }),
      );

      // ── Step 2: Seed Cloak of Protection modifier_instance directly ───────────
      // The Cloak of Protection is a wondrous item (not a spell) — its persisted bonus
      // lives in modifier_instances. We seed it directly to isolate the resolver path.
      //
      // Def: NumMod { kind:'num', op:'add', value:1, stat:'ac', category:'item' }
      //   DMG 159: "+1 bonus to AC while you wear this cloak."
      //   category:'item' → keep-highest stacking (REQ-RESOLVE-01).
      //
      // Scope: { owner: targetCharId, target: { axis:'self' }, trigger:'always' }
      //   axis:'self' → registry.query includes this mod when resolving for targetCharId
      //   (query.ts lines 67-69: included = instance.scope.owner === self).
      //
      // ownerCharacterId (DB FK column) = targetCharId so cascade deletes work.
      // No concentrationToken, no duration, no predicate → permanently active.
      const { db: testDb } = await import('../../src/infra/db/client.js');
      const { modifierInstances: miTable } = await import('../../src/infra/db/schema.js');
      const { randomUUID } = await import('node:crypto');

      const cloakInstanceId = randomUUID();
      const cloakItemId = randomUUID(); // Unique item instance ID (distinguishes multiple cloaks)

      await testDb.insert(miTable).values({
        id: cloakInstanceId,
        ownerCharacterId: targetCharId,
        targetCharacterId: targetCharId,
        // DMG 159: +1 AC, item category (keep-highest stacking)
        def: {
          kind: 'num',
          op: 'add',
          value: 1,
          stat: 'ac',
          category: 'item',
        } as object,
        // axis:'self' → applies to owning character only; scope.owner must match charId
        // for registry.query to include it (see registry/query.ts line 69).
        scope: {
          owner: targetCharId,
          target: { axis: 'self' },
          trigger: 'always',
        } as object,
        label: 'Cloak of Protection',
        // No duration, no concentrationToken, no predicate — permanently active.
      });

      // ── Step 3: Create encounter — fighter (attacker) vs Cloaked Scout (target PC) ──
      // Target is a PC combatant: NO ac field in the body (PC AC is derived).
      // Fighter (initiative=20) is attacker/currentCombatantId; Scout (initiative=5) is target.
      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T15 PC target Cloak test',
            combatants: [
              {
                name: 'Aldric',
                kind: 'pc',
                characterId: fighterCharId,
                initiative: 20,
                hpCurrent: 12,
                hpMax: 12,
                // No ac for PC combatants — derived at attack time (REQ-AC-CREATE-02).
              },
              {
                name: 'Cloaked Scout',
                kind: 'pc',
                characterId: targetCharId,
                initiative: 5,
                hpCurrent: 20,
                hpMax: 20,
                // No ac for PC combatants — must be null in DB regardless.
              },
            ],
          },
        })
        .then((r) => r.json());

      expect(freshEnc.id).toBeDefined();

      const attackerId: string = freshEnc.currentCombatantId; // fighter (initiative=20)
      const targetCombatantId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';

      // Confirm the target PC combatant has ac=null in the DB (derived, not stored).
      const targetCombatant = freshEnc.combatants.find(
        (c: { id: string }) => c.id === targetCombatantId,
      );
      expect(targetCombatant?.ac).toBeNull();

      // ── Step 4: POST attack/apply — assert targetAc === 13 ────────────────────
      // Fighter to-hit bonus: STR+2 (mod from score 15) + PB+2 (L1 fighter) = +4.
      // Target derived AC = 12 (unarmored DEX+2) + 1 (Cloak, item) = 13.
      //
      // The RNG result (hit or miss) doesn't matter for the AC assertion:
      //   - miss: response = { hit:false, ..., targetAc } (REQ-APPLY-FLOW-02 / REQ-ROUTE-BODY-02)
      //   - hit: response = { hit:true, ..., targetAc } (REQ-APPLY-FLOW-03 / REQ-ROUTE-BODY-03)
      // Both shapes include targetAc. One request is sufficient.
      //
      // BOUNDARY PROOF: targetAc=13 means the server added the Cloak +1 to the base 12.
      //   If loadPersistedModifiers were skipped, AC would be 12 (test would FAIL).
      //   If deriveArmorClassModifiers were skipped, AC would be wrong (no base 10 + DEX).
      //   Only the correct 10-step flow produces 13.
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        // REQ-ROUTE-BODY-01: no crit field — server derives crit from rollToHit.
        payload: {
          attackerId,
          targetId: targetCombatantId,
          weaponInstanceId: longswordInstanceId,
          version: freshEnc.version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Core assertion: targetAc must be the DERIVED value (12 base + 1 cloak = 13).
      // This fails if the server ignored the persisted Cloak modifier_instance.
      // This fails if the server read ac from the DB column (which is null for PC targets).
      // Only the correct loadPersistedModifiers → registry → resolveStat('ac') path gives 13.
      expect(body.targetAc).toBe(13);

      // Shape assertion: both hit and miss include targetAc (spec REQ-ROUTE-BODY-02/03).
      expect(typeof body.hit).toBe('boolean');
      expect(typeof body.d20).toBe('number');
      expect(body.d20All).toHaveLength(1); // normal roll mode (no advantage/disadvantage on fighter L1)
      expect(typeof body.total).toBe('number');
      expect(typeof body.toHitBonus).toBe('number');

      // Cleanup: the modifier_instance will be cascade-deleted when the test user's
      // character is deleted in afterAll (FK: ownerCharacterId → characters.id CASCADE).
      // No explicit cleanup needed here. The cloakItemId is unused post-assertion.
      void cloakItemId;
    },
  );
});

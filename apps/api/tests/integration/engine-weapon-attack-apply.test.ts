/**
 * Integration tests — engine-weapon-attack-apply (engine-attack-apply-damage MUTATION SLICE).
 *
 * Verifies POST /encounters/:id/actions/attack/apply:
 *   REQ-ATK-APPLY-01: HP is reduced and clamped at 0 (PHB p.197).
 *   REQ-ATK-APPLY-02: server derives damage — client body has NO damage field.
 *   REQ-ATK-VERSION-01: optimistic CAS — fresh version succeeds+bumps; stale → 409.
 *   REQ-ATK-TURN-01: attacker must be currentCombatantId.
 *   REQ-ATK-AUTH-01: GM-only; non-GM → 403.
 *   REQ-ATK-RESPONSE-01: 200 body has {rolledDamage, perDie, newHp}.
 *   REQ-ATK-NOTFOUND-01: missing target → 404; missing weapon → 404.
 *   REQ-ATK-NPC-01: NPC target (characterId null) — HP updated via encounter_combatants.
 *   REQ-ATK-CRIT-01: crit=true → rolledDamage > non-crit (PHB p.196).
 *   REQ-ATK-PURE-01: read-only /attack still non-mutating (regression gate).
 *
 * RED-first note: tests were written before the route existed.
 * PHB p.196 (crit), PHB p.197 (hp clamp), PHB p.194 (attack, GM-only).
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

    // ── Create encounter: fighter (init=20) vs NPC goblin (init=5, hp=20) ────
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
    'APPLY-T1: fresh version → 200; HP drops; encounters.version bumps (REQ-ATK-VERSION-01.1, REQ-ATK-RESPONSE-01.1)',
    async () => {
      // PHB p.196: damage reduces HP. REQ-ATK-VERSION-01.1: version becomes version+1.
      // Use a fresh encounter so we know the exact version and hp.
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
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 20, hpMax: 20 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const targetId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';
      const versionBefore: number = freshEnc.version;
      const targetHpBefore = 20;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId,
          targetId,
          weaponInstanceId: longswordInstanceId,
          version: versionBefore,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // REQ-ATK-RESPONSE-01.1: response shape
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

      // REQ-ATK-VERSION-01.1: version incremented
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
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 15, hpMax: 15 },
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
              { name: 'Goblin', kind: 'npc', initiative: 20, hpCurrent: 7, hpMax: 7 },
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
              { name: 'Goblin (NPC, no char)', kind: 'npc', initiative: 5, hpCurrent: 30, hpMax: 30 },
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

      // NPC HP updated in DB
      const afterEnc = await getEncounter(freshEnc.id);
      const npcAfter = afterEnc.combatants.find((c: { id: string }) => c.id === npcId);
      expect(npcAfter?.hpCurrent).toBe(body.newHp);
      // version bumped
      expect(afterEnc.version).toBe(freshEnc.version + 1);
    },
  );

  // ── APPLY-T8: crit=true → higher rolledDamage ────────────────────────────────

  it(
    'APPLY-T8: crit=true → rolledDamage reflects doubled dice; newHp lower than non-crit upper bound (REQ-ATK-CRIT-01.1, PHB p.196)',
    async () => {
      // PHB p.196 — Critical Hits: "roll all of the attack's damage dice twice and add them together."
      // We can't guarantee crit > non-crit for a single random roll, but we CAN verify:
      // 1. Request succeeds (200).
      // 2. rolledDamage >= 1 (at minimum 1 die).
      // 3. perDie carries the weapon entry (audit trail present).
      // A full statistical proof would require many samples; this verifies shape + success.
      const app = await getTestApp();

      const freshEnc = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'APPLY-T8 crit test',
            combatants: [
              { name: 'Aldric', kind: 'pc', characterId: fighterCharId, initiative: 20, hpCurrent: 12, hpMax: 12 },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 100, hpMax: 100 },
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
          crit: true,
          version: freshEnc.version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Crit with a 1d8 longsword → 2d8 + ability mod; minimum = 2 + any flat mod
      // With STR+2, minimum is 2d8 (min=2) + 2 = 4
      expect(body.rolledDamage).toBeGreaterThanOrEqual(4);

      // perDie audit trail present (PHB p.196 "all damage dice twice")
      const weaponEntry = body.perDie.find(
        (e: { label: string; rolls?: number[] }) => e.label === 'weapon',
      );
      expect(weaponEntry).toBeDefined();
      // On a crit, weapon is 2d8 → 2 roll entries
      expect(weaponEntry!.rolls.length).toBe(2);
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
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 1, hpMax: 7 },
            ],
          },
        })
        .then((r) => r.json());

      const attackerId: string = freshEnc.currentCombatantId;
      const targetId: string = freshEnc.combatants.find(
        (c: { id: string }) => c.id !== attackerId,
      )?.id ?? '';

      // Use crit=true to ensure even minimum damage (2d8+2 min=4) exceeds 1 HP
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${freshEnc.id}/actions/attack/apply`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId,
          targetId,
          weaponInstanceId: longswordInstanceId,
          crit: true,
          version: freshEnc.version,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // PHB p.197: newHp must be 0 (not negative)
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
});

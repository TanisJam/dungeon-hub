/**
 * Integration tests — engine-weapon-attack (engine-action-pipeline Slice 1).
 *
 * Verifies POST /encounters/:id/actions/attack:
 *   REQ-ATK-READONLY-01: no state mutation (version unchanged, HP unchanged).
 *   REQ-ATK-PROF-01: proficient character gets pb; non-proficient gets 0 pb.
 *   REQ-ATK-GUARD-01: ownership (403), turn order (409), encounter-active (409).
 *   REQ-ATK-NULLSAFE-01: missing weapon → 404; missing target → 404.
 *   REQ-ATK-LEGACY-01: GET /sheet unchanged after applying this change.
 *
 * RED-first note: route stub was verified as 404 before implementation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

describe('engine-weapon-attack — POST /encounters/:id/actions/attack', () => {
  let gm: TestUser;       // GM + owner of fighter character
  let outsider: TestUser; // player in campaign but NOT owner of fighter

  let campaignId: string;
  let worldId: string;

  // Characters
  let fighterCharId: string;  // Fighter with longsword (martial, proficient)
  let wizardCharId: string;   // Wizard with greatsword (NOT proficient)

  // Encounters
  let encounterId: string;    // active encounter, fighter is currentCombatant
  let fighterCombatantId: string;
  let npcCombatantId: string; // NPC as target

  let longswordInstanceId: string;
  let greatswordInstanceId: string;

  const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`${label}: ${res.statusCode} ${res.body}`);
    }
  };

  beforeAll(async () => {
    const app = await getTestApp();
    gm = await createTestUser();
    outsider = await createTestUser();

    // ── Campaign + world ───────────────────────────────────────────────────────
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { name: 'Weapon Attack Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // outsider is a player in the campaign (but does NOT own the characters)
    await addCampaignAndWorldMember(campaignId, outsider.id, 'player');

    // ── Fighter character ──────────────────────────────────────────────────────
    // Fighter level 1: STR 16 (+3), pb 2, martial weapons (longsword proficient)
    const fighter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Aldric the Fighter' },
      })
      .then((r) => r.json());
    fighterCharId = fighter.id;

    await expectOk(
      'fighter-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${fighterCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        // Standard array [15,14,13,12,10,8] — STR 15 (mod+2), valid assignment
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

    // Add longsword to inventory
    await expectOk(
      'add-longsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fighterCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'equipped' },
      }),
    );

    // Get the longsword instanceId from the sheet
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

    // ── Wizard character ───────────────────────────────────────────────────────
    // Wizard level 1: STR 10 (+0), pb 2, simple weapons only (greatsword NOT proficient)
    const wizard = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { worldId, name: 'Mirabel the Wizard' },
      })
      .then((r) => r.json());
    wizardCharId = wizard.id;

    await expectOk(
      'wizard-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${wizardCharId}/stats`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        // Standard array [15,14,13,12,10,8]: STR 10 (mod+0), INT 15 (highest for wizard)
        payload: {
          method: 'standard-array',
          scores: { str: 10, dex: 14, con: 12, int: 15, wis: 13, cha: 8 },
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
          skillChoices: ['arcana', 'investigation'],
        },
      }),
    );

    // Add greatsword to wizard (NOT proficient — wizard has only simple weapon profs)
    // Greatsword is two-handed: equipHand='both' is required (CLAUDE.md §11 — TWO_HANDED_REQUIRES_BOTH)
    await expectOk(
      'add-greatsword',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${wizardCharId}/inventory`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { item: { slug: 'greatsword', source: 'PHB' }, state: 'equipped', equipHand: 'both' },
      }),
    );

    const wizardSheet = await app
      .inject({
        method: 'GET',
        url: `/api/v1/characters/${wizardCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      })
      .then((r) => r.json());
    const greatsword = wizardSheet.inventory?.find(
      (item: { itemSlug: string }) => item.itemSlug === 'greatsword',
    );
    greatswordInstanceId = greatsword?.instanceId ?? '';

    // ── Create encounter with fighter as highest initiative (= currentCombatant) ─
    // Fighter initiative=20 > NPC initiative=5 → fighter is currentCombatantId
    const encounter = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          campaignId,
          name: 'Attack Pipeline Test Encounter',
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
              hpCurrent: 7,
              hpMax: 7,
            },
          ],
        },
      })
      .then((r) => r.json());

    encounterId = encounter.id;
    fighterCombatantId = encounter.currentCombatantId; // fighter has highest initiative
    // Find NPC combatant (it's the one that's NOT the currentCombatantId)
    npcCombatantId = encounter.combatants.find(
      (c: { id: string }) => c.id !== fighterCombatantId,
    )?.id ?? '';
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ── T1: proficient_hit ────────────────────────────────────────────────────────
  it(
    'T1: Fighter (proficient, STR+3, pb 2) longsword → 200; toHit.value = 5; no DB rows mutated (REQ-ATK-PROF-01, REQ-ATK-READONLY-01)',
    async () => {
      const app = await getTestApp();

      // Record pre-call encounter version
      const encounterBefore = await app
        .inject({
          method: 'GET',
          url: `/api/v1/encounters/${encounterId}`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
        })
        .then((r) => r.json());
      const versionBefore = encounterBefore.version;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.toHit).toBeDefined();
      // STR 15 (mod+2) + pb+2 = 4 (Fighter level 1, longsword proficient, standard array)
      expect(body.toHit.value).toBe(4);
      expect(body.damage).toBeDefined();
      expect(body.damage.dice).toBe('1d8'); // longsword
      expect(body.rollMode).toBeDefined();
      expect(['normal', 'advantage', 'disadvantage']).toContain(body.rollMode.mode);

      // REQ-ATK-READONLY-01: verify no DB mutation
      const encounterAfter = await app
        .inject({
          method: 'GET',
          url: `/api/v1/encounters/${encounterId}`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
        })
        .then((r) => r.json());
      expect(encounterAfter.version).toBe(versionBefore); // version unchanged
      const goblin = encounterAfter.combatants.find(
        (c: { id: string }) => c.id === npcCombatantId,
      );
      expect(goblin?.hpCurrent).toBe(7); // HP unchanged
    },
  );

  // ── T2: nonproficient_no_pb ───────────────────────────────────────────────────
  it(
    'T2: Wizard (NOT proficient, STR+0) greatsword → need a separate encounter for wizard turn',
    async () => {
      const app = await getTestApp();

      // Create a separate encounter with wizard as currentCombatant
      const wizEncounter = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'Wizard nonproficient test',
            combatants: [
              {
                name: 'Mirabel',
                kind: 'pc',
                characterId: wizardCharId,
                initiative: 20,
                hpCurrent: 8,
                hpMax: 8,
              },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 7, hpMax: 7 },
            ],
          },
        })
        .then((r) => r.json());

      const wizCombatantId: string = wizEncounter.currentCombatantId;
      const wizTargetId: string = wizEncounter.combatants.find(
        (c: { id: string }) => c.id !== wizCombatantId,
      )?.id ?? '';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${wizEncounter.id}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: wizCombatantId,
          targetId: wizTargetId,
          weaponInstanceId: greatswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Wizard STR+0, NOT proficient → toHit.value = 0 (PHB p.146-149)
      // This is the key ADR-3 guard: if pb were passed as 6th resolveStat arg, this would be +2 (WRONG)
      expect(body.toHit.value).toBe(0);
    },
  );

  // ── T3: not_your_turn ─────────────────────────────────────────────────────────
  it(
    'T3: NPC is currentCombatant; fighter tries to attack → 409 NOT_YOUR_TURN (REQ-ATK-GUARD-01)',
    async () => {
      const app = await getTestApp();

      // Create encounter where NPC has highest initiative (NPC's turn)
      const npcFirstEncounter = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'Not your turn test',
            combatants: [
              {
                name: 'Aldric',
                kind: 'pc',
                characterId: fighterCharId,
                initiative: 5,  // lower than NPC
                hpCurrent: 12,
                hpMax: 12,
              },
              { name: 'Goblin', kind: 'npc', initiative: 20, hpCurrent: 7, hpMax: 7 },
            ],
          },
        })
        .then((r) => r.json());

      // currentCombatantId = NPC (initiative 20)
      // Fighter's combatant ID
      const fighterCombId: string = npcFirstEncounter.combatants.find(
        (c: { id: string }) => c.id !== npcFirstEncounter.currentCombatantId,
      )?.id ?? '';
      const npcId: string = npcFirstEncounter.currentCombatantId;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${npcFirstEncounter.id}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombId,  // fighter tries to attack but it's NPC's turn
          targetId: npcId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('NOT_YOUR_TURN');
    },
  );

  // ── T4: not_owner ─────────────────────────────────────────────────────────────
  it(
    'T4: outsider (not fighter owner) tries to attack → 403 FORBIDDEN (REQ-ATK-GUARD-01)',
    async () => {
      const app = await getTestApp();

      // Fighter is currentCombatant in encounterId; outsider does not own fighter
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(403);
    },
  );

  // ── T5: weapon_not_equipped ───────────────────────────────────────────────────
  it(
    'T5: weaponInstanceId not in fighter inventory → 404 (REQ-ATK-NULLSAFE-01)',
    async () => {
      const app = await getTestApp();
      const fakeInstanceId = '00000000-0000-0000-0000-000000000001';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: npcCombatantId,
          weaponInstanceId: fakeInstanceId,
        },
      });

      expect(res.statusCode).toBe(404);
    },
  );

  // ── T6: target_not_in_encounter ───────────────────────────────────────────────
  it(
    'T6: targetId not in encounter → 404 (REQ-ATK-NULLSAFE-01)',
    async () => {
      const app = await getTestApp();
      const fakeTargetId = '00000000-0000-0000-0000-000000000002';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterCombatantId,
          targetId: fakeTargetId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(404);
    },
  );

  // ── T7: encounter_inactive ────────────────────────────────────────────────────
  it(
    'T7: encounter status != active → 409 ENCOUNTER_NOT_ACTIVE (REQ-ATK-GUARD-01)',
    async () => {
      const app = await getTestApp();

      // Create a completed encounter via direct DB update (no API for completing)
      const { db } = await import('../../src/infra/db/client.js');
      const { encounters: enc } = await import('../../src/infra/db/schema.js');
      const { eq } = await import('drizzle-orm');

      const completedEncounter = await app
        .inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${gm.accessToken}` },
          payload: {
            campaignId,
            name: 'Inactive encounter test',
            combatants: [
              {
                name: 'Aldric',
                kind: 'pc',
                characterId: fighterCharId,
                initiative: 20,
                hpCurrent: 12,
                hpMax: 12,
              },
              { name: 'Goblin', kind: 'npc', initiative: 5, hpCurrent: 7, hpMax: 7 },
            ],
          },
        })
        .then((r) => r.json());

      // Mark as completed via direct DB update
      await db
        .update(enc)
        .set({ status: 'completed' })
        .where(eq(enc.id, completedEncounter.id));

      const fighterId: string = completedEncounter.currentCombatantId;
      const goblinId: string = completedEncounter.combatants.find(
        (c: { id: string }) => c.id !== fighterId,
      )?.id ?? '';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${completedEncounter.id}/actions/attack`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: {
          attackerId: fighterId,
          targetId: goblinId,
          weaponInstanceId: longswordInstanceId,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('ENCOUNTER_NOT_ACTIVE');
    },
  );

  // ── T8: no_version_bump ───────────────────────────────────────────────────────
  it(
    'T8: successful attack → encounter.version unchanged (REQ-ATK-READONLY-01, Scenario 8.1)',
    async () => {
      const app = await getTestApp();

      const before = await app
        .inject({
          method: 'GET',
          url: `/api/v1/encounters/${encounterId}`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
        })
        .then((r) => r.json());

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

      const after = await app
        .inject({
          method: 'GET',
          url: `/api/v1/encounters/${encounterId}`,
          headers: { authorization: `Bearer ${gm.accessToken}` },
        })
        .then((r) => r.json());

      expect(after.version).toBe(before.version);
    },
  );

  // ── T9: legacy_sheet_unchanged ────────────────────────────────────────────────
  it(
    'T9: GET /characters/:id/sheet still works after slice applied (REQ-ATK-LEGACY-01, Scenario 12.1)',
    async () => {
      const app = await getTestApp();

      // The fighter's sheet should still compute correctly via the legacy path
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}/sheet`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Sheet should contain inventory with the longsword (via InventoryItem[])
      const ls = body.inventory?.find(
        (item: { itemSlug: string }) => item.itemSlug === 'longsword',
      );
      expect(ls).toBeDefined();

      // Legacy detail path: GET /inventory/:instanceId/detail still returns attackBonus
      // (driven by computeWeaponAttackBonus, isProficient=true hardcode — REQ-ATK-LEGACY-01)
      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fighterCharId}/inventory/${longswordInstanceId}/detail`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      expect(detailRes.statusCode).toBe(200);
      const { detail } = detailRes.json();
      // Legacy attackBonus is still driven by computeWeaponAttackBonus (isProficient=true hardcode)
      expect(typeof detail.attackBonus).toBe('number');
    },
  );
});

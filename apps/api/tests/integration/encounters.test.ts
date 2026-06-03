import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';
import { db } from '../../src/infra/db/client.js';
import {
  encounterCombatants,
  encounterCombatantConditions,
  encounterCombatantEffects,
} from '../../src/infra/db/schema.js';

describe('encounters', () => {
  let alice: TestUser; // GM
  let bob: TestUser; // outsider (no member)
  let charlie: TestUser; // player member of alice's campaign
  let campaignId: string;

  beforeAll(async () => {
    await getTestApp();
    alice = await createTestUser();
    bob = await createTestUser();
    charlie = await createTestUser();

    const app = await getTestApp();
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Encounters Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = c.id;
    await addCampaignAndWorldMember(campaignId, charlie.id, 'player');
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    if (charlie) await deleteTestUser(charlie.id);
    await closeTestApp();
  });

  const baseCombatants = [
    { name: 'Mira', kind: 'pc', initiative: 18, hpCurrent: 22, hpMax: 22 },
    // REQ-AC-CREATE-01: NPC combatants require ac at creation. Goblin AC=13 (PHB MM p.166).
    { name: 'Goblin α', kind: 'npc', initiative: 15, hpCurrent: 5, hpMax: 7, ac: 13 },
    { name: 'Brann', kind: 'pc', initiative: 13, hpCurrent: 28, hpMax: 32 },
  ];

  it('T1: GM creates encounter — 201 with version=1, round=1, currentCombatantId=highest-init (AE-CREATE-DM-ONLY-01)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/encounters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { campaignId, name: 'Emboscada', combatants: baseCombatants },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.campaignId).toBe(campaignId);
    expect(body.round).toBe(1);
    expect(body.status).toBe('active');
    expect(body.version).toBe(1);
    expect(body.combatants).toHaveLength(3);
    const mira = body.combatants.find((c: { name: string }) => c.name === 'Mira');
    expect(body.currentCombatantId).toBe(mira.id);
  });

  it('T2: non-GM rejected — 403 (AE-CREATE-DM-ONLY-01)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/encounters',
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { campaignId, name: 'Hacker Encounter', combatants: baseCombatants },
    });
    expect(res.statusCode).toBe(403);
  });

  it('T3: GET /encounters?campaignId returns newest first (AE-LIST-02)', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/encounters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { campaignId, name: 'List A', combatants: baseCombatants },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/encounters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { campaignId, name: 'List B', combatants: baseCombatants },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.length).toBeGreaterThanOrEqual(2);
    // newest first → "List B" appears before "List A"
    const idxA = data.findIndex((e: { name: string }) => e.name === 'List A');
    const idxB = data.findIndex((e: { name: string }) => e.name === 'List B');
    expect(idxB).toBeLessThan(idxA);
  });

  it('T4: GET /encounters/:id returns combatants (AE-DETAIL-03)', async () => {
    const app = await getTestApp();
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId, name: 'Detail Test', combatants: baseCombatants },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${created.id}`,
      headers: { authorization: `Bearer ${charlie.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.combatants).toHaveLength(3);
  });

  it('T5a: POST /:id/advance-turn — 200 with bumped version + new currentCombatantId (AE-ADVANCE-TURN-04)', async () => {
    const app = await getTestApp();
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId, name: 'Advance Test', combatants: baseCombatants },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${created.id}/advance-turn`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { version: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.currentCombatantId).not.toBe(created.currentCombatantId);
    const goblin = created.combatants.find((c: { name: string }) => c.name === 'Goblin α');
    expect(body.currentCombatantId).toBe(goblin.id);
  });

  it('T5b: advance-turn with stale version → 409 (AE-ADVANCE-TURN-04 conflict)', async () => {
    const app = await getTestApp();
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId, name: 'Conflict Test', combatants: baseCombatants },
      })
      .then((r) => r.json());

    // First call succeeds and bumps version to 2.
    await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${created.id}/advance-turn`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { version: 1 },
    });
    // Second call with stale version=1 → 409.
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${created.id}/advance-turn`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { version: 1 },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe('VERSION_CONFLICT');
  });

  /**
   * REQ-WCO-API-01 — Extended combatant response shape with NON-DEFAULT action-economy values.
   *
   * Seed combatant with 1 condition row + 1 effect row, then directly update the combatant row
   * to set non-default action-economy values (actionUsed=true, bonusActionUsed=true,
   * attacksRemaining=2). This proves the serializer actually reads and returns these fields;
   * a serializer that hard-coded `false`/`0` would fail the assertions below.
   *
   * PHB Appendix A p.291 — Stunned condition.
   * PHB p.251 — Hex: caster-sourced effect.
   * PHB p.189 — one action and one bonus action per turn (action-economy basis).
   */
  it('T7: GET /encounters/:id — combatant with condition + effect + non-default action-economy returned (REQ-WCO-API-01)', async () => {
    const app = await getTestApp();

    // Create a minimal encounter (1 NPC so we can apply conditions without a character sheet).
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          campaignId,
          name: 'WCO API Shape Test',
          combatants: [{ name: 'Goblin WCO', kind: 'npc', initiative: 10, hpCurrent: 7, hpMax: 7, ac: 13 }],
        },
      })
      .then((r) => r.json());

    const combatantId: string = created.combatants[0].id;

    // Seed condition row directly (encounter_combatant_conditions).
    // PHB Appendix A p.291: Stunned — incapacitated, can't move, speech slurred.
    await db.insert(encounterCombatantConditions).values({
      combatantId,
      conditionName: 'Stunned',
      appliedByCombatantId: null,
    });

    // Seed effect row directly (encounter_combatant_effects).
    // PHB p.251: Hex — caster-sourced effect, disadvantage on ability checks.
    await db.insert(encounterCombatantEffects).values({
      combatantId,
      effectName: 'Hex',
      sourceCombatantId: null,
    });

    // Flip action-economy to NON-DEFAULT values so the assertion proves the serializer
    // reads the actual DB state rather than returning hard-coded defaults.
    // PHB p.189: action + bonus action spent; 2 Extra Attacks remaining under Attack action.
    await db
      .update(encounterCombatants)
      .set({ actionUsed: true, bonusActionUsed: true, attacksRemaining: 2 })
      .where(eq(encounterCombatants.id, combatantId));

    // T7: assert GET returns new shape — conditions[], effects[], action-economy fields.
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${created.id}`,
      headers: { authorization: `Bearer ${charlie.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const combatant = body.combatants[0];

    // REQ-WCO-API-01: conditions and effects arrays present.
    expect(combatant.conditions).toEqual([{ name: 'Stunned', appliedByCombatantId: null }]);
    expect(combatant.effects).toEqual([{ name: 'Hex', sourceCombatantId: null }]);

    // REQ-WCO-API-01: non-default action-economy values — proves serializer reads DB state.
    expect(combatant.actionUsed).toBe(true);
    expect(combatant.bonusActionUsed).toBe(true);
    expect(combatant.attacksRemaining).toBe(2);
    expect(typeof combatant.reactionUsed).toBe('boolean');
  });

  /**
   * REQ-WCO-API-02 — Read-path tolerance for legacy rows.
   *
   * Combatant with NO condition/effect rows → conditions: [], effects: [], HTTP 200.
   * Also verifies action-economy safe defaults (false/0 — schema defaults NOT NULL).
   */
  it('T8: GET /encounters/:id — legacy combatant with no condition/effect rows → empty arrays, HTTP 200 (REQ-WCO-API-02)', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          campaignId,
          name: 'WCO Legacy Tolerance Test',
          combatants: [{ name: 'Skeleton WCO', kind: 'npc', initiative: 8, hpCurrent: 13, hpMax: 13, ac: 13 }],
        },
      })
      .then((r) => r.json());

    // No condition/effect rows seeded — legacy combatant.
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${created.id}`,
      headers: { authorization: `Bearer ${charlie.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const combatant = body.combatants[0];

    // REQ-WCO-API-02: empty arrays, not null, not missing.
    expect(combatant.conditions).toEqual([]);
    expect(combatant.effects).toEqual([]);

    // REQ-WCO-API-02: action-economy defaults (NOT NULL DEFAULT false/0 in schema).
    expect(combatant.actionUsed).toBe(false);
    expect(combatant.bonusActionUsed).toBe(false);
    expect(combatant.attacksRemaining).toBe(0);
  });

  /**
   * REQ-WCO-API-01 — Multi-combatant grouping: no cross-combatant condition/effect leakage.
   *
   * Creates an encounter with TWO combatants. Seeds a condition on C1 and an effect on C2.
   * Asserts that the Map-keyed grouping in loadEncounter (load-encounter.ts) routes each
   * child row to the correct combatant — C1 gets Stunned, C2 gets Hex, and neither row
   * appears in the other combatant's arrays.
   *
   * PHB Appendix A p.292 — Stunned condition.
   * PHB p.251 — Hex: caster-sourced effect, disadvantage on ability checks.
   */
  it('T9: GET /encounters/:id — conditions/effects grouped per combatant, no cross-combatant leakage (REQ-WCO-API-01)', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          campaignId,
          name: 'WCO Grouping Test',
          combatants: [
            { name: 'Fighter C1', kind: 'npc', initiative: 20, hpCurrent: 30, hpMax: 30, ac: 16 },
            { name: 'Warlock C2', kind: 'npc', initiative: 10, hpCurrent: 20, hpMax: 20, ac: 12 },
          ],
        },
      })
      .then((r) => r.json());

    // Identify C1 and C2 by initiative order (highest first).
    const c1 = created.combatants.find((c: { name: string }) => c.name === 'Fighter C1') as {
      id: string;
    };
    const c2 = created.combatants.find((c: { name: string }) => c.name === 'Warlock C2') as {
      id: string;
    };

    // Seed Stunned condition on C1 only.
    // PHB Appendix A p.292: Stunned — incapacitated, can't move or take actions.
    await db.insert(encounterCombatantConditions).values({
      combatantId: c1.id,
      conditionName: 'Stunned',
      appliedByCombatantId: null,
    });

    // Seed Hex effect on C2 only.
    // PHB p.251: Hex — caster-sourced effect, disadvantage on ability checks.
    await db.insert(encounterCombatantEffects).values({
      combatantId: c2.id,
      effectName: 'Hex',
      sourceCombatantId: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${created.id}`,
      headers: { authorization: `Bearer ${charlie.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    const bodyC1 = body.combatants.find((c: { name: string }) => c.name === 'Fighter C1');
    const bodyC2 = body.combatants.find((c: { name: string }) => c.name === 'Warlock C2');

    // C1: Stunned condition present, effects empty (Hex must NOT leak here).
    expect(bodyC1.conditions).toEqual([{ name: 'Stunned', appliedByCombatantId: null }]);
    expect(bodyC1.effects).toEqual([]);

    // C2: effects contain Hex, conditions empty (Stunned must NOT leak here).
    expect(bodyC2.conditions).toEqual([]);
    expect(bodyC2.effects).toEqual([{ name: 'Hex', sourceCombatantId: null }]);
  });

  // REQ-WCO-WEB-08: GET /encounters/:id must return a caller-specific callerRole field
  // so the web client can gate TurnControlsIsland (GM-only control).
  // 'gm' for the campaign GM; 'player' for any other campaign member.
  it('T10: GET /encounters/:id includes callerRole — "gm" for alice, "player" for charlie (REQ-WCO-WEB-08)', async () => {
    const app = await getTestApp();
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId, name: 'CallerRole Test', combatants: baseCombatants },
      })
      .then((r) => r.json());

    // GM caller — alice created the campaign so she is 'gm'
    const gmRes = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(gmRes.statusCode).toBe(200);
    expect(gmRes.json().callerRole).toBe('gm');

    // Player caller — charlie was added as 'player' member
    const playerRes = await app.inject({
      method: 'GET',
      url: `/api/v1/encounters/${created.id}`,
      headers: { authorization: `Bearer ${charlie.accessToken}` },
    });
    expect(playerRes.statusCode).toBe(200);
    expect(playerRes.json().callerRole).toBe('player');
  });

  it('T6: PATCH /:id/combatants/:cid HP=0 → advance skips it (AE-COMBATANT-HP-PATCH-05)', async () => {
    const app = await getTestApp();
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId, name: 'HP Patch Test', combatants: baseCombatants },
      })
      .then((r) => r.json());

    const goblin = created.combatants.find((c: { name: string }) => c.name === 'Goblin α');
    const brann = created.combatants.find((c: { name: string }) => c.name === 'Brann');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/encounters/${created.id}/combatants/${goblin.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { hpCurrent: 0 },
    });
    expect(patch.statusCode).toBe(200);

    const advance = await app.inject({
      method: 'POST',
      url: `/api/v1/encounters/${created.id}/advance-turn`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { version: 2 }, // version bumped by HP patch
    });
    expect(advance.statusCode).toBe(200);
    // Advance from Mira (current) skips dead Goblin → goes to Brann.
    expect(advance.json().currentCombatantId).toBe(brann.id);
  });
});

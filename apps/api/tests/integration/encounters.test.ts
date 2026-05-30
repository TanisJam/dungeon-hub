import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

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

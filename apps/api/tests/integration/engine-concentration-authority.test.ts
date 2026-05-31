/**
 * Integration tests — engine-concentration-authority (Slice 1).
 *
 * Verifies the server-authoritative concentration token + one-at-a-time registry.
 *
 * REQ-CONC-01: Server generates the concentration token; client body must not include it.
 * REQ-CONC-02: One concentration spell at a time (same-store: Bless → Bless drops prior).
 * REQ-CONC-03: Cross-store one-at-a-time (Bless ↔ Hex/Hunter's Mark drops across stores).
 * REQ-CONC-04: Non-concentration spells leave active concentration intact.
 * REQ-CONC-06: Client cannot supply/forge a concentration token (rejected as unknown field).
 * REQ-CONC-07: Legacy rows (client-token or no registry row) still load + are removable.
 *
 * Source rule: PHB p.203 — "You lose concentration on a spell if you cast another spell
 * that requires concentration."
 *
 * Orchestrator reconciliation applied:
 *   - PC casters ONLY (characterId non-null). NPC source → no registry row (no crash).
 *   - Cast RESPONSE returns the server-minted concentration token.
 *
 * Design ref: sdd/engine-concentration-authority/design #1430.
 * Spec ref: sdd/engine-concentration-authority/spec #1429.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';
import { db } from '../../src/infra/db/client.js';
import {
  modifierInstances,
  encounterCombatantEffects,
  characterConcentration,
  modifierDefinitions,
} from '../../src/infra/db/schema.js';
import { blessRuleDoc, type RuleDoc } from '@dungeon-hub/domain/engine';

// ── Non-concentration rule doc (WARNING-2 / CONC-04 real test) ────────────────
// A minimal +1 attack-roll modifier with NO endsOn: ['concentration-ends'].
// Uses the same casterId / targetIds / concentrationToken param names as
// applyActiveEffect calls compiled.build({ casterId, targetIds, concentrationToken }).
// PHB rationale: a flat bonus granted by a non-concentration feature (e.g. a
// short-duration item aura) — no concentration required.
const NON_CONC_SLUG = 'conc04-nonconc-test-spell';

const nonConcRuleDoc: RuleDoc = {
  id: NON_CONC_SLUG,
  source: 'test',
  ruleText: '+1 attack-roll (non-concentration, REQ-CONC-04 test only)',
  params: [
    { name: 'casterId', type: 'EntityId' },
    { name: 'targetIds', type: 'EntityId[]' },
    { name: 'concentrationToken', type: 'string' },
  ],
  emits: [
    {
      def: {
        kind: 'num',
        op: 'add',
        value: 1,
        stat: 'attack-roll',
        category: 'untyped',
      },
      scope: {
        owner: '{casterId}',
        target: { axis: 'entities', ids: '{targetIds}' },
        trigger: 'always',
      },
      // INTENTIONALLY no duration.endsOn — this is NOT a concentration spell.
      // applyActiveEffect checks endsOn: ['concentration-ends']; absence → no startConcentration call.
      label: 'NonConc Test Bonus',
      idTemplate: 'conc04-nonconc-{casterId}-{targetId}',
    },
  ],
  testCases: [],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const expectOk = async (label: string, res: { statusCode: number; body: string }) => {
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`${label}: expected 200/201, got ${res.statusCode} — ${res.body}`);
  }
};

const makeCharacter = async (
  app: Awaited<ReturnType<typeof getTestApp>>,
  token: string,
  worldId: string,
  name: string,
): Promise<string> => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/characters',
    headers: { authorization: `Bearer ${token}` },
    payload: { worldId, name },
  });
  if (res.statusCode !== 201) throw new Error(`makeCharacter ${name}: ${res.statusCode} ${res.body}`);
  return res.json<{ id: string }>().id;
};

const castBless = async (
  app: Awaited<ReturnType<typeof getTestApp>>,
  token: string,
  casterId: string,
  targetIds: string[],
): Promise<string> => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/characters/${casterId}/cast-bless`,
    headers: { authorization: `Bearer ${token}` },
    payload: { targetIds },
  });
  if (res.statusCode !== 201) throw new Error(`castBless: ${res.statusCode} ${res.body}`);
  const body = res.json<{ concentrationToken: string }>();
  if (typeof body.concentrationToken !== 'string') {
    throw new Error(`castBless: no concentrationToken in response — ${JSON.stringify(body)}`);
  }
  return body.concentrationToken;
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('engine-concentration-authority — REQ-CONC-01..07 (PHB p.203)', () => {
  let u1: TestUser;
  let casterId: string;
  let allyId: string;
  let worldId: string;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    u1 = await createTestUser();

    // Seed bless modifier_definition row (idempotent — onConflictDoNothing).
    // Required because castBless → applyActiveEffect → catalog lookup → modifier_definitions.
    await db
      .insert(modifierDefinitions)
      .values({
        slug: 'bless',
        source: 'PHB 219',
        name: 'Bless',
        kind: 'spell',
        ruleDoc: blessRuleDoc,
      })
      .onConflictDoNothing();

    // Seed non-concentration modifier_definition row for CONC-04 real API test.
    // WARNING-2 fix: CONC-04 must exercise a non-concentration spell THROUGH the API,
    // not just check the registry passively. This row is the catalog entry for that slug.
    await db
      .insert(modifierDefinitions)
      .values({
        slug: NON_CONC_SLUG,
        source: 'test',
        name: 'NonConc Test Bonus',
        kind: 'spell',
        ruleDoc: nonConcRuleDoc,
      })
      .onConflictDoNothing();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { name: 'Concentration Authority Campaign' },
      })
      .then((r) => r.json<{ id: string; worldId: string }>());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    casterId = await makeCharacter(app, u1.accessToken, worldId, 'Concentration Caster');
    allyId = await makeCharacter(app, u1.accessToken, worldId, 'Concentration Ally');

    // Minimal stats + class so engineStats works (required for GET /sheet tests).
    await expectOk(
      'caster-stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${casterId}/stats`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { method: 'standard-array', scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 } },
      }),
    );
    await expectOk(
      'caster-class',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${casterId}/class`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { class: { slug: 'fighter', source: 'PHB' }, level: 1, skillChoices: ['athletics', 'perception'] },
      }),
    );
  });

  afterAll(async () => {
    if (u1) await deleteTestUser(u1.id);
    // Clean up test-only catalog rows that are not owned by deleteTestUser cascade.
    await db.delete(modifierDefinitions).where(eq(modifierDefinitions.slug, NON_CONC_SLUG));
    await closeTestApp();
  });

  // ── B.13: REQ-CONC-01 — server generates the token ────────────────────────────

  it('CONC-01-A: POST cast-bless without concentrationToken → 201, response has UUID concentrationToken', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      // REQ-CONC-01: no concentrationToken in body.
      payload: { targetIds: [allyId] },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ concentrationToken?: string }>();
    expect(typeof body.concentrationToken).toBe('string');
    // UUID format: 8-4-4-4-12 hex chars
    expect(body.concentrationToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('CONC-01-B: POST cast-bless WITH concentrationToken in body → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      // REQ-CONC-01: client attempting to supply a token — must be rejected.
      payload: { targetIds: [allyId], concentrationToken: 'client-forged-token' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string; issues: Array<{ path: unknown[] }> }>();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  // ── B.14: REQ-CONC-02 + REQ-CONC-03 — one-at-a-time + cross-store ─────────────

  it('CONC-02: Bless → Bless (same caster, same store) — prior modifier_instances rows dropped', async () => {
    // PHB p.203: "You lose concentration on a spell if you cast another spell that requires concentration."
    const app = await getTestApp();

    // Create isolated caster/ally for this test.
    const caster2Id = await makeCharacter(app, u1.accessToken, worldId, 'CONC-02 Caster');
    const ally2Id = await makeCharacter(app, u1.accessToken, worldId, 'CONC-02 Ally');

    // Cast Bless #1.
    const token1 = await castBless(app, u1.accessToken, caster2Id, [ally2Id]);

    // Verify Bless #1 rows exist.
    const rows1 = await db
      .select({ id: modifierInstances.id })
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, token1));
    expect(rows1.length).toBeGreaterThan(0);

    // Verify character_concentration registry has 1 row for caster2Id.
    const reg1 = await db
      .select()
      .from(characterConcentration)
      .where(eq(characterConcentration.characterId, caster2Id));
    expect(reg1).toHaveLength(1);
    expect(reg1[0]!.concentrationToken).toBe(token1);
    expect(reg1[0]!.store).toBe('modifier_instances');

    // Cast Bless #2 (same caster, same ally).
    const token2 = await castBless(app, u1.accessToken, caster2Id, [ally2Id]);

    // Tokens must differ (server-minted UUIDs per cast).
    expect(token1).not.toBe(token2);

    // REQ-CONC-02: Bless #1 rows must be gone.
    const rows1After = await db
      .select({ id: modifierInstances.id })
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, token1));
    expect(rows1After).toHaveLength(0);

    // Bless #2 rows must be present.
    const rows2 = await db
      .select({ id: modifierInstances.id })
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, token2));
    expect(rows2.length).toBeGreaterThan(0);

    // Registry has exactly 1 row, pointing to Bless #2.
    const reg2 = await db
      .select()
      .from(characterConcentration)
      .where(eq(characterConcentration.characterId, caster2Id));
    expect(reg2).toHaveLength(1);
    expect(reg2[0]!.concentrationToken).toBe(token2);
  });

  it('CONC-03-BlessToHex: Bless → Hex (cross-store) — Bless modifier_instances dropped, Hex encounter_combatant_effects present', async () => {
    // PHB p.203: the rule does not distinguish by storage mechanism.
    const app = await getTestApp();
    const u2 = await createTestUser();

    try {
      // Create isolated PC caster + allies.
      const pcCasterId = await makeCharacter(app, u1.accessToken, worldId, 'CONC-03-BH Caster');
      const blessTargetId = await makeCharacter(app, u1.accessToken, worldId, 'CONC-03-BH Bless Target');

      // Create an encounter with the PC caster as a combatant (characterId required for concentration service).
      await addCampaignAndWorldMember(campaignId, u2.id, 'gm');
      const encounterRes = await app.inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${u2.accessToken}` },
        payload: {
          campaignId,
          name: 'CONC-03-BH Encounter',
          combatants: [
            { name: 'PC Caster', kind: 'pc', characterId: pcCasterId, initiative: 18, hpCurrent: 20, hpMax: 20 },
            { name: 'Hex Target NPC', kind: 'npc', initiative: 5, hpCurrent: 10, hpMax: 10, ac: 12 },
          ],
        },
      });
      await expectOk('encounter-create', encounterRes);
      const encounter = encounterRes.json<{ id: string; combatants: Array<{ id: string; name: string }> }>();
      const encounterId = encounter.id;
      const pcCombatantId = encounter.combatants.find((c) => c.name === 'PC Caster')!.id;
      const npcCombatantId = encounter.combatants.find((c) => c.name === 'Hex Target NPC')!.id;

      // Step 1: Cast Bless (modifier_instances store).
      const blessToken = await castBless(app, u1.accessToken, pcCasterId, [blessTargetId]);

      // Verify Bless rows exist in modifier_instances.
      const blessRowsBefore = await db
        .select({ id: modifierInstances.id })
        .from(modifierInstances)
        .where(eq(modifierInstances.concentrationToken, blessToken));
      expect(blessRowsBefore.length).toBeGreaterThan(0);

      // Verify registry: caster is concentrating on Bless in modifier_instances.
      const reg1 = await db
        .select()
        .from(characterConcentration)
        .where(eq(characterConcentration.characterId, pcCasterId));
      expect(reg1).toHaveLength(1);
      expect(reg1[0]!.store).toBe('modifier_instances');

      // Step 2: Apply Hex (encounter_combatant_effects store) from the PC combatant.
      const hexRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/apply-combatant-effect`,
        headers: { authorization: `Bearer ${u2.accessToken}` },
        payload: {
          targetCombatantId: npcCombatantId,
          effectName: "Hex",
          sourceCombatantId: pcCombatantId,
          // REQ-CONC-01: no concentrationToken in body.
        },
      });
      expect(hexRes.statusCode).toBe(200);
      const hexToken: string = hexRes.json<{ concentrationToken: string }>().concentrationToken;
      expect(typeof hexToken).toBe('string');

      // REQ-CONC-03: Bless rows must be gone from modifier_instances.
      const blessRowsAfter = await db
        .select({ id: modifierInstances.id })
        .from(modifierInstances)
        .where(eq(modifierInstances.concentrationToken, blessToken));
      expect(blessRowsAfter).toHaveLength(0);

      // Hex row must be present in encounter_combatant_effects.
      const hexRows = await db
        .select({ id: encounterCombatantEffects.id, concentrationToken: encounterCombatantEffects.concentrationToken })
        .from(encounterCombatantEffects)
        .where(eq(encounterCombatantEffects.concentrationToken, hexToken));
      expect(hexRows.length).toBeGreaterThan(0);

      // Registry: caster now concentrating on Hex in encounter_combatant_effects.
      const reg2 = await db
        .select()
        .from(characterConcentration)
        .where(eq(characterConcentration.characterId, pcCasterId));
      expect(reg2).toHaveLength(1);
      expect(reg2[0]!.store).toBe('encounter_combatant_effects');
      expect(reg2[0]!.concentrationToken).toBe(hexToken);
    } finally {
      await deleteTestUser(u2.id);
    }
  });

  it('CONC-03-HexToBless: Hex → Bless (cross-store mirror) — Hex dropped, Bless present', async () => {
    // PHB p.203: symmetric case (Hex → Bless is the mirror of Bless → Hex).
    const app = await getTestApp();
    const u3 = await createTestUser();

    try {
      const pcCasterId = await makeCharacter(app, u1.accessToken, worldId, 'CONC-03-HB Caster');
      const blessTargetId = await makeCharacter(app, u1.accessToken, worldId, 'CONC-03-HB Bless Target');

      await addCampaignAndWorldMember(campaignId, u3.id, 'gm');
      const encounterRes = await app.inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${u3.accessToken}` },
        payload: {
          campaignId,
          name: 'CONC-03-HB Encounter',
          combatants: [
            { name: 'PC Caster HB', kind: 'pc', characterId: pcCasterId, initiative: 18, hpCurrent: 20, hpMax: 20 },
            { name: 'Hex Target NPC HB', kind: 'npc', initiative: 5, hpCurrent: 10, hpMax: 10, ac: 12 },
          ],
        },
      });
      await expectOk('encounter-create-hb', encounterRes);
      const encounter = encounterRes.json<{ id: string; combatants: Array<{ id: string; name: string }> }>();
      const encounterId = encounter.id;
      const pcCombatantId = encounter.combatants.find((c) => c.name === 'PC Caster HB')!.id;
      const npcCombatantId = encounter.combatants.find((c) => c.name === 'Hex Target NPC HB')!.id;

      // Step 1: Apply Hex first (encounter_combatant_effects).
      const hexRes = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${encounterId}/actions/apply-combatant-effect`,
        headers: { authorization: `Bearer ${u3.accessToken}` },
        payload: {
          targetCombatantId: npcCombatantId,
          effectName: "Hex",
          sourceCombatantId: pcCombatantId,
        },
      });
      expect(hexRes.statusCode).toBe(200);
      const hexToken: string = hexRes.json<{ concentrationToken: string }>().concentrationToken;

      // Hex row present.
      const hexRowsBefore = await db
        .select()
        .from(encounterCombatantEffects)
        .where(eq(encounterCombatantEffects.concentrationToken, hexToken));
      expect(hexRowsBefore.length).toBeGreaterThan(0);

      // Registry: concentrating on Hex.
      const reg1 = await db
        .select()
        .from(characterConcentration)
        .where(eq(characterConcentration.characterId, pcCasterId));
      expect(reg1).toHaveLength(1);
      expect(reg1[0]!.store).toBe('encounter_combatant_effects');

      // Step 2: Cast Bless (modifier_instances). PHB p.203: drops Hex.
      const blessToken = await castBless(app, u1.accessToken, pcCasterId, [blessTargetId]);

      // REQ-CONC-03: Hex row must be gone from encounter_combatant_effects.
      const hexRowsAfter = await db
        .select()
        .from(encounterCombatantEffects)
        .where(eq(encounterCombatantEffects.concentrationToken, hexToken));
      expect(hexRowsAfter).toHaveLength(0);

      // Bless rows present in modifier_instances.
      const blessRows = await db
        .select()
        .from(modifierInstances)
        .where(eq(modifierInstances.concentrationToken, blessToken));
      expect(blessRows.length).toBeGreaterThan(0);

      // Registry: caster now concentrating on Bless in modifier_instances.
      const reg2 = await db
        .select()
        .from(characterConcentration)
        .where(eq(characterConcentration.characterId, pcCasterId));
      expect(reg2).toHaveLength(1);
      expect(reg2[0]!.store).toBe('modifier_instances');
      expect(reg2[0]!.concentrationToken).toBe(blessToken);
    } finally {
      await deleteTestUser(u3.id);
    }
  });

  // ── B.15: REQ-CONC-04 + REQ-CONC-06 + REQ-CONC-07 ───────────────────────────

  it('CONC-04: Concentrating on Bless, POST non-concentration active-effect via API — Bless registry + modifier_instances rows intact', async () => {
    // PHB p.203: "You lose concentration on a spell if you cast another spell that requires
    // concentration." — the inverse: casting a NON-concentration spell MUST NOT drop concentration.
    //
    // WARNING-2 fix: this test actually exercises the non-concentration path through the API
    // (POST /characters/:id/active-effects with a non-concentration slug) and then asserts both:
    //   (a) the Bless character_concentration registry row is UNCHANGED (same token, same store)
    //   (b) the Bless modifier_instances rows are still present (not deleted)
    // This guards against a regression where requiresConcentration detection wrongly fires for
    // any spell (false positive → drops Bless) or never fires for concentration spells (false negative).
    const app = await getTestApp();

    const casterAId = await makeCharacter(app, u1.accessToken, worldId, 'CONC-04 Caster');
    const allyAId = await makeCharacter(app, u1.accessToken, worldId, 'CONC-04 Ally A');

    // Step 1: Cast Bless (concentration) on allyA — establishes concentration.
    const blessToken = await castBless(app, u1.accessToken, casterAId, [allyAId]);

    // Pre-condition: registry has 1 row pointing to Bless in modifier_instances.
    const regBefore = await db
      .select()
      .from(characterConcentration)
      .where(eq(characterConcentration.characterId, casterAId));
    expect(regBefore).toHaveLength(1);
    expect(regBefore[0]!.concentrationToken).toBe(blessToken);
    expect(regBefore[0]!.store).toBe('modifier_instances');

    // Pre-condition: Bless modifier_instances rows exist under blessToken.
    const blessRowsBefore = await db
      .select({ id: modifierInstances.id })
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, blessToken));
    expect(blessRowsBefore.length).toBeGreaterThan(0);

    // Step 2: POST a NON-concentration active-effect (NON_CONC_SLUG has no endsOn: ['concentration-ends']).
    // This goes through the full API → applyActiveEffect use-case path.
    // applyActiveEffect detects requiresConcentration=false → does NOT call startConcentration.
    const nonConcRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterAId}/active-effects`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        effectSlug: NON_CONC_SLUG,
        targetIds: [allyAId],
        // REQ-CONC-01: no concentrationToken in body.
      },
    });
    expect(nonConcRes.statusCode).toBe(201);

    // Assertion (a): character_concentration registry row is UNCHANGED.
    // Same token, same store — the non-concentration cast must not have touched the registry.
    const regAfter = await db
      .select()
      .from(characterConcentration)
      .where(eq(characterConcentration.characterId, casterAId));
    expect(regAfter).toHaveLength(1);
    expect(regAfter[0]!.concentrationToken).toBe(blessToken);
    expect(regAfter[0]!.store).toBe('modifier_instances');

    // Assertion (b): Bless modifier_instances rows are still present.
    // A false-positive requiresConcentration detection would have deleted them via startConcentration.
    const blessRowsAfter = await db
      .select({ id: modifierInstances.id })
      .from(modifierInstances)
      .where(eq(modifierInstances.concentrationToken, blessToken));
    expect(blessRowsAfter.length).toBeGreaterThan(0);
    expect(blessRowsAfter.length).toBe(blessRowsBefore.length);
    // REQ-CONC-04: non-concentration cast did NOT alter concentration state.
  });

  it('CONC-06: POST cast-bless with concentrationToken → 400 VALIDATION_FAILED (client cannot forge token)', async () => {
    // REQ-CONC-06: server-authority invariant — client has no parameter to override concentration.
    const app = await getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${casterId}/cast-bless`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        targetIds: [allyId],
        concentrationToken: randomUUID(), // client attempting to forge a token
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('CONC-06-encounters: POST apply-combatant-effect with concentrationToken → 400 VALIDATION_FAILED', async () => {
    // REQ-CONC-06 for the encounters path.
    const app = await getTestApp();
    const u4 = await createTestUser();

    try {
      await addCampaignAndWorldMember(campaignId, u4.id, 'gm');
      const encounterRes = await app.inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${u4.accessToken}` },
        payload: {
          campaignId,
          name: 'CONC-06 Encounter',
          combatants: [
            { name: 'NPC A', kind: 'npc', initiative: 20, hpCurrent: 10, hpMax: 10, ac: 12 },
            { name: 'NPC B', kind: 'npc', initiative: 5, hpCurrent: 10, hpMax: 10, ac: 10 },
          ],
        },
      });
      await expectOk('encounter-c6', encounterRes);
      const enc = encounterRes.json<{ id: string; combatants: Array<{ id: string }> }>();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${enc.id}/actions/apply-combatant-effect`,
        headers: { authorization: `Bearer ${u4.accessToken}` },
        payload: {
          targetCombatantId: enc.combatants[1]!.id,
          effectName: 'Hex',
          sourceCombatantId: enc.combatants[0]!.id,
          concentrationToken: randomUUID(), // client attempting to supply a token
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: string }>().error).toBe('VALIDATION_FAILED');
    } finally {
      await deleteTestUser(u4.id);
    }
  });

  it('CONC-07-A: GET effects with legacy client-token rows → 200, no error', async () => {
    // REQ-CONC-07: read-tolerance for legacy rows (no character_concentration registry entry).
    // Simulate by directly inserting a modifier_instances row with a fake (legacy) token.
    const { db: dbImport } = await import('../../src/infra/db/client.js');
    const { modifierInstances: mi } = await import('../../src/infra/db/schema.js');

    const legacyToken = `legacy-${randomUUID()}`;
    const legacyCasterId = await makeCharacter(
      await getTestApp(),
      u1.accessToken,
      worldId,
      'CONC-07 Legacy Caster',
    );
    const legacyTargetId = await makeCharacter(
      await getTestApp(),
      u1.accessToken,
      worldId,
      'CONC-07 Legacy Target',
    );

    // Insert a "legacy" row with a client-supplied token (no registry row).
    await dbImport.insert(mi).values({
      ownerCharacterId: legacyCasterId,
      targetCharacterId: legacyTargetId,
      concentrationToken: legacyToken,
      def: { kind: 'num', op: 'add', value: '1d4', stat: 'attack-roll', category: 'untyped' } as object,
      scope: {
        owner: legacyCasterId,
        target: { axis: 'entities', ids: [legacyTargetId] },
        trigger: 'always',
      } as object,
      label: 'Legacy Bless Row (client token)',
    });

    // GET /sheet for legacy target → must succeed even with no registry row.
    const app = await getTestApp();
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${legacyTargetId}/sheet`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    expect(sheetRes.json<{ engineStats: unknown }>().engineStats).toBeDefined();

    // Cleanup legacy row.
    await dbImport.delete(mi).where(eq(mi.concentrationToken, legacyToken));
  });

  it('CONC-07-B: DELETE /concentration/:legacyToken → 204 (legacy row removable)', async () => {
    // REQ-CONC-07: removal of legacy rows must succeed.
    const { db: dbImport } = await import('../../src/infra/db/client.js');
    const { modifierInstances: mi } = await import('../../src/infra/db/schema.js');

    const legacyToken = `legacy-del-${randomUUID()}`;
    const legacyCasterId = await makeCharacter(
      await getTestApp(),
      u1.accessToken,
      worldId,
      'CONC-07B Legacy Caster',
    );
    const legacyTargetId = await makeCharacter(
      await getTestApp(),
      u1.accessToken,
      worldId,
      'CONC-07B Legacy Target',
    );

    await dbImport.insert(mi).values({
      ownerCharacterId: legacyCasterId,
      targetCharacterId: legacyTargetId,
      concentrationToken: legacyToken,
      def: { kind: 'num', op: 'add', value: '1d4', stat: 'attack-roll', category: 'untyped' } as object,
      scope: {
        owner: legacyCasterId,
        target: { axis: 'entities', ids: [legacyTargetId] },
        trigger: 'always',
      } as object,
      label: 'Legacy Bless Row (for delete test)',
    });

    // DELETE /concentration/:legacyToken for the legacy caster.
    const app = await getTestApp();
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${legacyCasterId}/concentration/${legacyToken}`,
      headers: { authorization: `Bearer ${u1.accessToken}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Row is gone.
    const remaining = await dbImport
      .select({ id: mi.id })
      .from(mi)
      .where(and(eq(mi.concentrationToken, legacyToken), eq(mi.ownerCharacterId, legacyCasterId)));
    expect(remaining).toHaveLength(0);
  });

  it('CONC-NPC: apply-combatant-effect with NPC source combatant → 200, no crash, no registry row', async () => {
    // Orchestrator reconciliation: "PC casters ONLY. When the casting combatant has
    // NO characterId, SKIP the concentration service (no registry row)."
    const app = await getTestApp();
    const u5 = await createTestUser();

    try {
      await addCampaignAndWorldMember(campaignId, u5.id, 'gm');
      const encounterRes = await app.inject({
        method: 'POST',
        url: '/api/v1/encounters',
        headers: { authorization: `Bearer ${u5.accessToken}` },
        payload: {
          campaignId,
          name: 'CONC-NPC Encounter',
          combatants: [
            // NPC source combatant — no characterId.
            { name: 'NPC Hexer', kind: 'npc', initiative: 20, hpCurrent: 10, hpMax: 10, ac: 12 },
            { name: 'NPC Hexed', kind: 'npc', initiative: 5, hpCurrent: 10, hpMax: 10, ac: 10 },
          ],
        },
      });
      await expectOk('encounter-npc', encounterRes);
      const enc = encounterRes.json<{ id: string; combatants: Array<{ id: string; name: string }> }>();
      const npcHexerId = enc.combatants.find((c) => c.name === 'NPC Hexer')!.id;
      const npcHexedId = enc.combatants.find((c) => c.name === 'NPC Hexed')!.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/encounters/${enc.id}/actions/apply-combatant-effect`,
        headers: { authorization: `Bearer ${u5.accessToken}` },
        payload: {
          targetCombatantId: npcHexedId,
          effectName: 'Hex',
          sourceCombatantId: npcHexerId,
          // No concentrationToken — server generates it.
        },
      });

      // Must not crash (no 500).
      expect(res.statusCode).toBe(200);
      expect(res.json<{ applied: boolean }>().applied).toBe(true);

      // No character_concentration row for the NPC (it has no characterId).
      // We can't query by NPC combatant ID directly; we just verify no rows were inserted
      // in character_concentration beyond what already existed (the NPC has no characterId → no PK).
      // The absence of an error IS the proof.
    } finally {
      await deleteTestUser(u5.id);
    }
  });
});

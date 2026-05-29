/**
 * Integration tests — engine-timeline-duration (Composable Modifier System Slice 1).
 *
 * Validates the full read-time expiry pipeline and the startRound write path:
 *   REQ-DUR-LOAD-01: loadPersistedModifiers filters expired instances via evaluateDuration.
 *   REQ-DUR-EVAL-02: bless_expires_after_10_rounds — active R..R+9, expired R+10.
 *   REQ-DUR-EVAL-03: conservative fallback — no encounterId → modifier always active.
 *   REQ-DUR-STORE-01: applyActiveEffect writes start_round from encounter context.
 *   REQ-DUR-REST-01: short-rest removes 'short-rest' endsOn rows; long-rest removes both.
 *   REQ-DUR-TOLERATE-01: legacy rows (start_round NULL) load without error.
 *   REQ-DUR-CONTRACT-01: GET /sheet without encounterId → zero behavior change.
 *
 * Strict TDD note: tests written BEFORE confirming wiring (RED first).
 * PHB p.181 — time conversions (1 minute = 10 rounds).
 * PHB p.203 — Bless: 1 minute duration.
 * PHB p.186 — rests and their scope.
 *
 * Design ref: sdd/engine-timeline-duration/design — ADR-3, ADR-4, ADR-5.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

// ── Test fixture builder ──────────────────────────────────────────────────────

async function buildMinimalCharacter(app: Awaited<ReturnType<typeof getTestApp>>, worldId: string, token: string, name: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/characters',
    headers: { authorization: `Bearer ${token}` },
    payload: { worldId, name },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`buildMinimalCharacter ${name}: ${res.statusCode} ${res.body}`);
  }
  return res.json<{ id: string }>();
}

async function buildMinimalStats(app: Awaited<ReturnType<typeof getTestApp>>, charId: string, token: string) {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/v1/characters/${charId}/stats`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      method: 'standard-array',
      scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
    },
  });
  if (res.statusCode !== 200) throw new Error(`buildMinimalStats: ${res.statusCode} ${res.body}`);
}

async function buildMinimalClass(app: Awaited<ReturnType<typeof getTestApp>>, charId: string, token: string) {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/v1/characters/${charId}/class`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      class: { slug: 'fighter', source: 'PHB' },
      level: 1,
      skillChoices: ['athletics', 'perception'],
    },
  });
  if (res.statusCode !== 200) throw new Error(`buildMinimalClass: ${res.statusCode} ${res.body}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('engine-timeline-duration — duration filter + startRound write (Slice 1)', () => {
  let u1: TestUser;
  let casterId: string;
  let targetId: string;
  let worldId: string;
  let campaignId: string;
  let encounterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    u1 = await createTestUser();

    // Campaign + world
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { name: 'Duration Filter Test Campaign' },
      })
      .then((r) => r.json<{ id: string; worldId: string }>());
    worldId = campaign.worldId;
    campaignId = campaign.id;

    // Two characters (caster and target for Bless)
    const casterChar = await buildMinimalCharacter(app, worldId, u1.accessToken, 'Duration Caster');
    casterId = casterChar.id;
    await buildMinimalStats(app, casterId, u1.accessToken);
    await buildMinimalClass(app, casterId, u1.accessToken);

    const targetChar = await buildMinimalCharacter(app, worldId, u1.accessToken, 'Duration Target');
    targetId = targetChar.id;
    await buildMinimalStats(app, targetId, u1.accessToken);
    await buildMinimalClass(app, targetId, u1.accessToken);

    // Create an active encounter at round 1 (will be advanced in tests as needed)
    const encounterRes = await app.inject({
      method: 'POST',
      url: '/api/v1/encounters',
      headers: { authorization: `Bearer ${u1.accessToken}` },
      payload: {
        campaignId: campaign.id,
        name: 'Duration Test Encounter',
        combatants: [{ name: 'Caster', kind: 'pc', initiative: 18, hpCurrent: 20, hpMax: 20 }],
      },
    });
    if (encounterRes.statusCode !== 201) throw new Error(`encounter create: ${encounterRes.statusCode} ${encounterRes.body}`);
    encounterId = encounterRes.json<{ id: string }>().id;
  });

  afterAll(async () => {
    if (u1) await deleteTestUser(u1.id);
    await closeTestApp();
  });

  // ── 3F.3: startRound write ────────────────────────────────────────────────
  // POST active-effects?encounterId=E (E.round=1 at creation) → start_round=1
  // POST without encounterId → start_round IS NULL
  // REQ-DUR-STORE-01, Scenarios 6.1/6.2.
  describe('3F.3 — startRound write (REQ-DUR-STORE-01)', () => {
    it('Scenario 6.1 — POST active-effects?encounterId persists start_round = encounter.round', async () => {
      const app = await getTestApp();
      const { db } = await import('../../src/infra/db/client.js');
      const { modifierInstances } = await import('../../src/infra/db/schema.js');

      const token6a = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${casterId}/active-effects?encounterId=${encounterId}`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { effectSlug: 'bless', targetIds: [targetId], concentrationToken: token6a },
      });
      expect(res.statusCode, `POST active-effects: ${res.body}`).toBe(201);

      // The encounter was created at round=1, so start_round should be 1.
      const rows = await db
        .select({ startRound: modifierInstances.startRound })
        .from(modifierInstances)
        .where(
          and(
            eq(modifierInstances.concentrationToken, token6a),
            eq(modifierInstances.targetCharacterId, targetId),
          ),
        );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.startRound, 'start_round should equal encounter.round at cast time').toBe(1);
      }
    });

    it('Scenario 6.2 — POST active-effects without encounterId → start_round IS NULL', async () => {
      const app = await getTestApp();
      const { db } = await import('../../src/infra/db/client.js');
      const { modifierInstances } = await import('../../src/infra/db/schema.js');

      const token6b = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${casterId}/active-effects`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { effectSlug: 'bless', targetIds: [targetId], concentrationToken: token6b },
      });
      expect(res.statusCode, `POST active-effects no encounter: ${res.body}`).toBe(201);

      const rows = await db
        .select({ startRound: modifierInstances.startRound })
        .from(modifierInstances)
        .where(
          and(
            eq(modifierInstances.concentrationToken, token6b),
            eq(modifierInstances.targetCharacterId, targetId),
          ),
        );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.startRound, 'start_round should be null without encounterId').toBeNull();
      }
    });
  });

  // ── 3F.2: fallback-active when no encounterId ─────────────────────────────
  // GET /sheet (no encounterId) → modifier present (conservative fallback).
  // REQ-DUR-EVAL-03, Scenario 2.4 / Scenario 9.1.
  describe('3F.2 — fallback active without encounterId (REQ-DUR-EVAL-03, REQ-DUR-CONTRACT-01)', () => {
    let token3f2: string;

    it('Scenario 9.1 — GET /sheet without encounterId → same response shape + modifiers active', async () => {
      const app = await getTestApp();
      const { db } = await import('../../src/infra/db/client.js');
      const { modifierInstances } = await import('../../src/infra/db/schema.js');

      token3f2 = randomUUID();

      // Cast Bless with a known start_round (encounter round=1)
      const castRes = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${casterId}/active-effects?encounterId=${encounterId}`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
        payload: { effectSlug: 'bless', targetIds: [targetId], concentrationToken: token3f2 },
      });
      expect(castRes.statusCode).toBe(201);

      // GET /sheet without encounterId → Bless should be present (conservative fallback)
      const sheetRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${targetId}/sheet`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
      });
      expect(sheetRes.statusCode, `GET sheet: ${sheetRes.body}`).toBe(200);

      const body = sheetRes.json();
      // Sheet loads successfully (contract)
      expect(body.sheet).toBeDefined();
      expect(body.engineStats).toBeDefined();
      // The actual Bless instances from the POST active-effects call should appear.
      // Their label is set by buildBlessModifiers → compileRule → build() which generates
      // a label of the form "Bless (casterId)" — we just check any Bless is present.
      const attackBreakdown: Array<{ label?: string }> = body.engineStats.attackRoll?.breakdown ?? [];
      const blessEntry = attackBreakdown.find((s) => s.label?.startsWith('Bless'));
      expect(blessEntry, 'Bless should be present in breakdown when no encounterId (fallback active)').toBeDefined();

      // Cleanup
      await db.delete(modifierInstances).where(eq(modifierInstances.concentrationToken, token3f2));
    });
  });

  // ── 3F.1: load-filter integration ────────────────────────────────────────
  // Bless with startRound=0, encounter round=9 → present; round=10 → absent.
  // PHB p.181 (1 minute = 10 rounds), PHB p.203 (Bless duration).
  // REQ-DUR-LOAD-01, Scenarios 5.1/5.2.
  describe('3F.1 — load filter: active at R+9, expired at R+10 (REQ-DUR-LOAD-01, REQ-DUR-EVAL-02)', () => {
    it('Scenario 5.1/5.2 — Bless active at encounterRound=9, expired at encounterRound=10', async () => {
      // PHB p.181: 1 minute = 10 rounds. Start_round=0.
      // Active while (encounterRound - startRound) < 10, i.e. rounds 0..9.
      // Expired when (encounterRound - startRound) >= 10, i.e. round 10+.
      const app = await getTestApp();
      const { db } = await import('../../src/infra/db/client.js');
      const { modifierInstances, encounters: encountersTable } = await import('../../src/infra/db/schema.js');

      // Seed a Bless modifier_instances row directly with start_round=0
      // and a duration of 1 minute (10 rounds, PHB p.181).
      const blessToken = randomUUID();
      const instanceId = randomUUID();

      // NOTE: the instance MUST NOT have 'concentration-ends' in endsOn,
      // because evaluateDuration defers concentration-ends to the DELETE path
      // (REQ-DUR-EVAL-04) and would always return true.
      // This instance simulates a round-based effect without concentration
      // (e.g. a non-concentration buff that expires after 1 minute = 10 rounds).
      // PHB p.181: 1 minute = 10 rounds.
      await db.insert(modifierInstances).values({
        id: instanceId,
        ownerCharacterId: casterId,
        targetCharacterId: targetId,
        def: {
          kind: 'num',
          op: 'add',
          value: '1d4',
          stat: 'attack-roll',
          category: 'untyped',
        } as object,
        scope: {
          owner: casterId,
          target: { axis: 'entities', ids: [targetId] },
          trigger: 'always',
        } as object,
        duration: {
          unit: 'minute',
          amount: 1,
          // No 'concentration-ends' — pure round-based expiry path (REQ-DUR-EVAL-02)
        } as object,
        label: 'Bless (Duration Filter Test)',
        startRound: 0, // cast at round 0
      });

      try {
        // Create a separate encounter for round-manipulation
        const encounterRes = await app.inject({
          method: 'POST',
          url: '/api/v1/encounters',
          headers: { authorization: `Bearer ${u1.accessToken}` },
          payload: {
            campaignId,
            name: 'Expiry Gate Encounter',
            combatants: [{ name: 'Combatant', kind: 'pc', initiative: 18, hpCurrent: 10, hpMax: 10 }],
          },
        });

        // We need to test at encounterRound=9 (active) and encounterRound=10 (expired).
        // Rather than advancing turns (complex setup), we directly manipulate encounter.round
        // in the DB for the test encounter. This is the cleanest integration test approach.
        const gateEncId = encounterRes.json<{ id: string }>().id;

        // Set round=9: elapsed = 9 - 0 = 9 < 10 → active
        await db.update(encountersTable).set({ round: 9 }).where(eq(encountersTable.id, gateEncId));

        const sheetR9 = await app.inject({
          method: 'GET',
          url: `/api/v1/characters/${targetId}/sheet?encounterId=${gateEncId}`,
          headers: { authorization: `Bearer ${u1.accessToken}` },
        });
        expect(sheetR9.statusCode, `GET sheet R9: ${sheetR9.body}`).toBe(200);
        const bodyR9 = sheetR9.json();
        const breakdownR9: Array<{ label?: string }> = bodyR9.engineStats.attackRoll?.breakdown ?? [];
        // Search for the EXACT label of our seeded instance (not just 'Bless' which other tests may leak)
        const blessR9 = breakdownR9.find((s) => s.label === 'Bless (Duration Filter Test)');
        expect(
          blessR9,
          'Bless (Duration Filter Test) should be ACTIVE at R+9 (elapsed=9 < 10, PHB p.181 1 min=10 rounds)',
        ).toBeDefined();

        // Set round=10: elapsed = 10 - 0 = 10 >= 10 → expired
        await db.update(encountersTable).set({ round: 10 }).where(eq(encountersTable.id, gateEncId));

        const sheetR10 = await app.inject({
          method: 'GET',
          url: `/api/v1/characters/${targetId}/sheet?encounterId=${gateEncId}`,
          headers: { authorization: `Bearer ${u1.accessToken}` },
        });
        expect(sheetR10.statusCode, `GET sheet R10: ${sheetR10.body}`).toBe(200);
        const bodyR10 = sheetR10.json();
        const breakdownR10: Array<{ label?: string }> = bodyR10.engineStats.attackRoll?.breakdown ?? [];
        // Search for the EXACT label of our seeded instance (not just 'Bless' which other tests may leak)
        const blessR10 = breakdownR10.find((s) => s.label === 'Bless (Duration Filter Test)');
        expect(
          blessR10,
          'Bless (Duration Filter Test) should be EXPIRED at R+10 (elapsed=10 >= 10, PHB p.181 1 min=10 rounds)',
        ).toBeUndefined();
      } finally {
        // Always clean up the seeded row
        await db.delete(modifierInstances).where(eq(modifierInstances.id, instanceId));
      }
    });
  });

  // ── 3F.6: tolerate-read legacy row ───────────────────────────────────────
  // start_round=NULL + duration present → 200, no runtime error, modifier active.
  // REQ-DUR-TOLERATE-01, Scenario 8.1.
  describe('3F.6 — tolerate legacy row with NULL start_round (REQ-DUR-TOLERATE-01)', () => {
    it('Scenario 8.1 — NULL start_round with duration → loads 200, modifier active (conservative fallback)', async () => {
      const app = await getTestApp();
      const { db } = await import('../../src/infra/db/client.js');
      const { modifierInstances } = await import('../../src/infra/db/schema.js');

      const legacyToken = randomUUID();
      const legacyId = randomUUID();

      // Seed a "legacy" row: start_round is NOT set (NULL), duration present.
      // Use NumMod on attack-roll so it appears in engineStats.attackRoll.breakdown.
      await db.insert(modifierInstances).values({
        id: legacyId,
        ownerCharacterId: casterId,
        targetCharacterId: targetId,
        concentrationToken: legacyToken,
        def: {
          kind: 'num',
          op: 'add',
          value: '1d4',
          stat: 'attack-roll',
          category: 'untyped',
        } as object,
        scope: {
          owner: casterId,
          target: { axis: 'entities', ids: [targetId] },
          trigger: 'always',
        } as object,
        duration: {
          unit: 'minute',
          amount: 1,
          concentrationToken: legacyToken,
          endsOn: ['concentration-ends'],
        } as object,
        label: 'Legacy Bless (NULL start_round)',
        // startRound intentionally omitted → NULL column → evaluateDuration fallback active
      });

      try {
        // GET /sheet with encounterId present (so encounterRound IS set in ctx)
        // startRound=undefined (from NULL) → evaluateDuration fallback active → present in sheet
        const sheetRes = await app.inject({
          method: 'GET',
          url: `/api/v1/characters/${targetId}/sheet?encounterId=${encounterId}`,
          headers: { authorization: `Bearer ${u1.accessToken}` },
        });
        expect(sheetRes.statusCode, `GET sheet legacy: ${sheetRes.body}`).toBe(200);
        // No runtime error = core requirement met (REQ-DUR-TOLERATE-01)
        const body = sheetRes.json();
        expect(body.sheet).toBeDefined();

        // The modifier should be ACTIVE (conservative fallback: startRound absent → true)
        const breakdown: Array<{ label?: string }> = body.engineStats.attackRoll?.breakdown ?? [];
        const legacyBless = breakdown.find((s) => s.label === 'Legacy Bless (NULL start_round)');
        expect(legacyBless, 'Legacy modifier (NULL start_round) should be active via conservative fallback').toBeDefined();
      } finally {
        await db.delete(modifierInstances).where(eq(modifierInstances.id, legacyId));
      }
    });
  });

  // ── 3F.7: encounterId absent — existing client contract ──────────────────
  // GET /sheet with no param → same response shape as before, all modifiers included.
  // REQ-DUR-CONTRACT-01, Scenario 9.1.
  describe('3F.7 — no encounterId param → same response shape (REQ-DUR-CONTRACT-01)', () => {
    it('Scenario 9.1 — GET /sheet without encounterId → 200, sheet intact, no 400/500', async () => {
      const app = await getTestApp();

      const sheetRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${targetId}/sheet`,
        headers: { authorization: `Bearer ${u1.accessToken}` },
      });
      expect(sheetRes.statusCode, `GET sheet no param: ${sheetRes.body}`).toBe(200);
      const body = sheetRes.json();
      expect(body.sheet).toBeDefined();
      expect(body.engineStats).toBeDefined();
      expect(body.character).toBeDefined();
      expect(body.inventory).toBeDefined();
    });
  });

  // ── 3F.4: rest DELETE — short-rest ───────────────────────────────────────
  // Seed short-rest + long-rest rows. POST rest/short → short-rest deleted, long-rest survives.
  // REQ-DUR-REST-01, Scenario 4.1.
  describe('3F.4 — short-rest DELETE removes short-rest row only (REQ-DUR-REST-01)', () => {
    it('Scenario 4.1 — POST rest/short removes short-rest endsOn row; long-rest row survives', async () => {
      const app = await getTestApp();
      const { db } = await import('../../src/infra/db/client.js');
      const { modifierInstances } = await import('../../src/infra/db/schema.js');

      const shortRestId = randomUUID();
      const longRestId = randomUUID();

      // Seed short-rest endsOn instance
      await db.insert(modifierInstances).values({
        id: shortRestId,
        ownerCharacterId: casterId,
        targetCharacterId: targetId,
        def: { kind: 'noop' } as object,
        scope: {
          owner: casterId,
          target: { axis: 'entities', ids: [targetId] },
          trigger: 'always',
        } as object,
        duration: { unit: 'minute', amount: 1, endsOn: ['short-rest'] } as object,
        label: 'Short-rest effect (test)',
      });

      // Seed long-rest endsOn instance
      await db.insert(modifierInstances).values({
        id: longRestId,
        ownerCharacterId: casterId,
        targetCharacterId: targetId,
        def: { kind: 'noop' } as object,
        scope: {
          owner: casterId,
          target: { axis: 'entities', ids: [targetId] },
          trigger: 'always',
        } as object,
        duration: { unit: 'hour', amount: 8, endsOn: ['long-rest'] } as object,
        label: 'Long-rest effect (test)',
      });

      try {
        // POST rest/short — should remove only the short-rest row
        const restRes = await app.inject({
          method: 'POST',
          url: `/api/v1/characters/${casterId}/rest/short`,
          headers: { authorization: `Bearer ${u1.accessToken}` },
          payload: { hitDiceToSpend: {} },
        });
        expect(restRes.statusCode, `POST rest/short: ${restRes.body}`).toBe(200);

        // short-rest row should be gone
        const shortRows = await db
          .select({ id: modifierInstances.id })
          .from(modifierInstances)
          .where(eq(modifierInstances.id, shortRestId));
        expect(shortRows, 'short-rest endsOn row should be deleted after short rest').toHaveLength(0);

        // long-rest row should survive
        const longRows = await db
          .select({ id: modifierInstances.id })
          .from(modifierInstances)
          .where(eq(modifierInstances.id, longRestId));
        expect(longRows, 'long-rest endsOn row should survive after short rest').toHaveLength(1);
      } finally {
        // Clean up any remaining rows
        await db.delete(modifierInstances).where(eq(modifierInstances.id, shortRestId));
        await db.delete(modifierInstances).where(eq(modifierInstances.id, longRestId));
      }
    });
  });

  // ── 3F.5: rest DELETE — long-rest ────────────────────────────────────────
  // Seed same two rows. POST rest/long → BOTH deleted.
  // PHB p.186: a long rest satisfies short-rest-scoped effects too.
  // REQ-DUR-REST-01, design ADR-5 detail.
  describe('3F.5 — long-rest DELETE removes both short and long-rest rows (REQ-DUR-REST-01)', () => {
    it('Scenario 4.1 (long) — POST rest/long removes BOTH short-rest AND long-rest endsOn rows', async () => {
      // PHB p.186: "A long rest satisfies the requirements for a short rest."
      const app = await getTestApp();
      const { db } = await import('../../src/infra/db/client.js');
      const { modifierInstances } = await import('../../src/infra/db/schema.js');

      const shortRestId2 = randomUUID();
      const longRestId2 = randomUUID();

      await db.insert(modifierInstances).values({
        id: shortRestId2,
        ownerCharacterId: casterId,
        targetCharacterId: targetId,
        def: { kind: 'noop' } as object,
        scope: {
          owner: casterId,
          target: { axis: 'entities', ids: [targetId] },
          trigger: 'always',
        } as object,
        duration: { unit: 'minute', amount: 1, endsOn: ['short-rest'] } as object,
        label: 'Short-rest effect (long-rest test)',
      });

      await db.insert(modifierInstances).values({
        id: longRestId2,
        ownerCharacterId: casterId,
        targetCharacterId: targetId,
        def: { kind: 'noop' } as object,
        scope: {
          owner: casterId,
          target: { axis: 'entities', ids: [targetId] },
          trigger: 'always',
        } as object,
        duration: { unit: 'hour', amount: 8, endsOn: ['long-rest'] } as object,
        label: 'Long-rest effect (long-rest test)',
      });

      try {
        // POST rest/long — should remove BOTH rows (PHB p.186)
        const restRes = await app.inject({
          method: 'POST',
          url: `/api/v1/characters/${casterId}/rest/long`,
          headers: { authorization: `Bearer ${u1.accessToken}` },
          payload: {},
        });
        expect(restRes.statusCode, `POST rest/long: ${restRes.body}`).toBe(200);

        // Both should be gone
        const shortRows2 = await db
          .select({ id: modifierInstances.id })
          .from(modifierInstances)
          .where(eq(modifierInstances.id, shortRestId2));
        expect(shortRows2, 'short-rest endsOn row should be deleted after long rest').toHaveLength(0);

        const longRows2 = await db
          .select({ id: modifierInstances.id })
          .from(modifierInstances)
          .where(eq(modifierInstances.id, longRestId2));
        expect(longRows2, 'long-rest endsOn row should be deleted after long rest').toHaveLength(0);
      } finally {
        await db.delete(modifierInstances).where(eq(modifierInstances.id, shortRestId2));
        await db.delete(modifierInstances).where(eq(modifierInstances.id, longRestId2));
      }
    });
  });
});

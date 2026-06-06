/**
 * Integration tests: character knowledge routes
 *
 * REQ-CK-API-01  — POST /characters/:id/knowledge (DM grant, idempotent, 403, 400)
 * REQ-CCB-API-01 — GET  /characters/:id/knowledge/:kind (monsters: DM full+flags, player filtered, 403, 400 invalid-kind)
 * REQ-CCB-API-02 — GET  /characters/:id/codex/counts ({ monsters:{known,total} })
 * REQ-CK-GATE-01 — Layered visibility gate
 *
 * Spec: character-codex #1626, character-codex-browser (CCB Slice 1')
 * Pattern: mirrors campaigns.test.ts (in-process Fastify + real Postgres, singleFork)
 *
 * NOTE: /knowledge/bestiary has been REMOVED (replaced by /knowledge/:kind).
 * Confirm: a request to /knowledge/bestiary returns 400 VALIDATION_FAILED (unknown kind).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

// ──────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────────────────────────

describe('character knowledge routes', () => {
  let gm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let characterId: string;

  // Slug/source we'll use for grant tests.
  // Does NOT need to exist in compendium_monsters — the grant endpoint only writes
  // to character_knowledge and does NOT validate against the compendium.
  const TEST_MONSTER = { refKey: 'goblin-test-ck', refSource: 'mm' };

  beforeAll(async () => {
    const app = await getTestApp();

    // Create users
    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    // Create world with GM
    ({ worldId } = await createWorldWithGm(gm.id));

    // Add player as world member
    await addWorldMember(worldId, player.id, 'player');

    // Create a character owned by the player, inside the GM's world
    const charRes = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { worldId, name: 'Codex Test Character' },
    });
    expect(charRes.statusCode).toBe(201);
    characterId = charRes.json<{ id: string }>().id;
  });

  afterAll(async () => {
    // Users + their worlds cascade-delete characters/knowledge rows
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ── POST /characters/:id/knowledge ─────────────────────────────────────────

  describe('POST /characters/:id/knowledge', () => {
    it('GM grants bestiary knowledge → 200 + row exists in DB', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/knowledge`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { kind: 'bestiary', ...TEST_MONSTER },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ ok: boolean; characterId: string; kind: string; refKey: string; refSource: string }>();
      expect(body.ok).toBe(true);
      expect(body.characterId).toBe(characterId);
      expect(body.kind).toBe('bestiary');
      expect(body.refKey).toBe(TEST_MONSTER.refKey);
      expect(body.refSource).toBe(TEST_MONSTER.refSource);

      // Verify row exists in character_knowledge
      const { db } = await import('../../src/infra/db/client.js');
      const { characterKnowledge } = await import('../../src/infra/db/schema.js');
      const rows = await db
        .select()
        .from(characterKnowledge)
        .where(
          and(
            eq(characterKnowledge.characterId, characterId),
            eq(characterKnowledge.kind, 'bestiary'),
            eq(characterKnowledge.refKey, TEST_MONSTER.refKey),
            eq(characterKnowledge.refSource, TEST_MONSTER.refSource),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.source).toBe('dm-grant');
      expect(rows[0]!.grantedByUserId).toBe(gm.id);
    });

    it('Idempotent: granting the same tuple twice → still 1 row + 200', async () => {
      const app = await getTestApp();

      // Grant again (already granted in previous test)
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/knowledge`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { kind: 'bestiary', ...TEST_MONSTER },
      });

      expect(res.statusCode).toBe(200);

      // Must still be exactly 1 row (ON CONFLICT DO NOTHING)
      const { db } = await import('../../src/infra/db/client.js');
      const { characterKnowledge } = await import('../../src/infra/db/schema.js');
      const rows = await db
        .select()
        .from(characterKnowledge)
        .where(
          and(
            eq(characterKnowledge.characterId, characterId),
            eq(characterKnowledge.kind, 'bestiary'),
            eq(characterKnowledge.refKey, TEST_MONSTER.refKey),
            eq(characterKnowledge.refSource, TEST_MONSTER.refSource),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it('Non-GM (player) → 403 FORBIDDEN', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/knowledge`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { kind: 'bestiary', refKey: 'orc', refSource: 'mm' },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('FORBIDDEN');
    });

    it('Outsider (no world membership) → 403 FORBIDDEN', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/knowledge`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { kind: 'bestiary', refKey: 'orc', refSource: 'mm' },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('FORBIDDEN');
    });

    it('Invalid body (missing refKey) → 400', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/knowledge`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { kind: 'bestiary', refSource: 'mm' }, // missing refKey
      });

      // Zod parse() throws on invalid body → Fastify returns 400
      expect(res.statusCode).toBe(400);
    });

    it('Missing kind → 400', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/knowledge`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { refKey: 'goblin', refSource: 'mm' }, // missing kind
      });

      expect(res.statusCode).toBe(400);
    });

    it('Non-existent character → 404', async () => {
      const app = await getTestApp();

      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${fakeId}/knowledge`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
        payload: { kind: 'bestiary', refKey: 'goblin', refSource: 'mm' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /characters/:id/knowledge/:kind — monsters ──────────────────────────

  describe('GET /characters/:id/knowledge/:kind (monsters)', () => {
    it('returns response structure: rows[], total, knownCount, effectiveView', async () => {
      const app = await getTestApp();

      // GM view
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: unknown[];
        total: number;
        knownCount: number;
        effectiveView: string;
      }>();
      expect(Array.isArray(body.rows)).toBe(true);
      expect(typeof body.total).toBe('number');
      expect(typeof body.knownCount).toBe('number');
      expect(body.effectiveView).toBe('dm');
      expect(body.total).toBeGreaterThanOrEqual(0);
      expect(body.knownCount).toBeGreaterThanOrEqual(0);
      // knownCount <= total always
      expect(body.knownCount).toBeLessThanOrEqual(body.total);
    });

    it('DM view: effectiveView=dm, all compendium monsters returned with known flag', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{ slug: string; source: string; name: string; cr: string | null; type: string | null; known: boolean }>;
        total: number;
        knownCount: number;
        effectiveView: string;
      }>();

      expect(body.effectiveView).toBe('dm');
      // DM sees ALL compendium monsters (total = rows.length)
      expect(body.rows).toHaveLength(body.total);

      // Every monster has the required fields
      for (const m of body.rows) {
        expect(m).toHaveProperty('slug');
        expect(m).toHaveProperty('source');
        expect(m).toHaveProperty('name');
        expect(m).toHaveProperty('cr');
        expect(m).toHaveProperty('type');
        expect(typeof m.known).toBe('boolean');
      }

      // knownCount matches the actual count of known: true entries
      const actualKnown = body.rows.filter((m) => m.known).length;
      expect(actualKnown).toBe(body.knownCount);
    });

    it('Player view: effectiveView=player, only known monsters returned (known-only — NOT silhouettes)', async () => {
      const app = await getTestApp();

      // At this point the character has 1 grant (TEST_MONSTER from POST tests above).
      // Player should see ONLY that monster, not the full compendium.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{ slug: string; source: string; known: boolean }>;
        total: number;
        knownCount: number;
        effectiveView: string;
      }>();

      expect(body.effectiveView).toBe('player');

      // Player sees FEWER (or equal) rows than total — only the known ones
      // REQ-CCB-API-01: player view returns known-only (no silhouette placeholders).
      expect(body.rows.length).toBeLessThanOrEqual(body.total);

      // All returned monsters are known
      for (const m of body.rows) {
        expect(m.known).toBe(true);
      }

      // knownCount matches the actual returned count (player view: rows = known only)
      expect(body.rows).toHaveLength(body.knownCount);
    });

    it('Player view: does NOT include unknown monsters (gate enforced)', async () => {
      const app = await getTestApp();

      const dmRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      const dmBody = dmRes.json<{
        rows: Array<{ slug: string; source: string; known: boolean }>;
        total: number;
        knownCount: number;
      }>();

      const playerRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      const playerBody = playerRes.json<{
        rows: Array<{ slug: string; source: string; known: boolean }>;
        total: number;
        knownCount: number;
      }>();

      // If there are unknown monsters in the compendium, the player must not see them
      const unknownInCompendium = dmBody.rows.filter((m) => !m.known);
      if (unknownInCompendium.length > 0) {
        const playerSlugs = new Set(
          playerBody.rows.map((m) => `${m.slug}|${m.source}`),
        );
        for (const unknown of unknownInCompendium) {
          expect(playerSlugs.has(`${unknown.slug}|${unknown.source}`)).toBe(false);
        }
      }
    });

    // ── codex-knowledge gap (#1953): ?view=player downgrade + ?q= filter ──────

    it('GM with ?view=player → effectiveView=player (preview-as-player downgrade)', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters?view=player`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{ known: boolean }>;
        effectiveView: string;
      }>();
      // GM downgraded to player view: gate enforced, every row is known.
      expect(body.effectiveView).toBe('player');
      for (const m of body.rows) expect(m.known).toBe(true);
    });

    it('Player cannot escalate: ?view=dm is clamped to player', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters?view=dm`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ effectiveView: string }>().effectiveView).toBe('player');
    });

    it('?q= filters monsters by name (case-insensitive)', async () => {
      const app = await getTestApp();

      // Get the DM (full) list to derive a real substring to search for.
      const dmRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      const dmRows = dmRes.json<{ rows: Array<{ name: string }> }>().rows;
      if (dmRows.length === 0) return; // empty catalog in this env — nothing to assert

      // First 3 chars of a real monster name, uppercased to prove case-insensitivity.
      const term = dmRows[0]!.name.slice(0, 3).toUpperCase();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters?q=${encodeURIComponent(term)}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Array<{ name: string }>; total: number }>();
      for (const m of body.rows) {
        expect(m.name.toLowerCase()).toContain(term.toLowerCase());
      }
      expect(body.total).toBeLessThanOrEqual(dmRows.length);
    });

    it('Outsider (no world membership) → 403 FORBIDDEN', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('FORBIDDEN');
    });

    it('Unauthenticated → 401', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/monsters`,
      });

      expect(res.statusCode).toBe(401);
    });

    it('Non-existent character → 404', async () => {
      const app = await getTestApp();

      const fakeId = '00000000-0000-0000-0000-000000000001';
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fakeId}/knowledge/monsters`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('Invalid kind (dragons) → 400 VALIDATION_FAILED', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/dragons`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      // REQ-CCB-API-01 invalid-kind scenario
      expect(res.statusCode).toBe(400);
      const body = res.json<{ error: string; issues: unknown[] }>();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it('Old /knowledge/bestiary route is gone → 400 (invalid kind, not 200)', async () => {
      const app = await getTestApp();

      // /knowledge/bestiary is no longer a valid route — 'bestiary' is NOT an allowed URL kind.
      // The new route is /knowledge/monsters (maps to DB kind 'bestiary' internally).
      // This test confirms the old path is not exposed as a live route.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/bestiary`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      // 'bestiary' is not in the allowlist for URL kind → 400 VALIDATION_FAILED
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /characters/:id/codex/counts ─────────────────────────────────────────

  describe('GET /characters/:id/codex/counts', () => {
    it('returns { monsters: { known, total } } structure', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/codex/counts`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ monsters: { known: number; total: number } }>();
      expect(typeof body.monsters).toBe('object');
      expect(typeof body.monsters.known).toBe('number');
      expect(typeof body.monsters.total).toBe('number');
      expect(body.monsters.known).toBeGreaterThanOrEqual(0);
      expect(body.monsters.total).toBeGreaterThanOrEqual(0);
      expect(body.monsters.known).toBeLessThanOrEqual(body.monsters.total);
    });

    it('known count reflects actual knowledge rows for this character', async () => {
      const app = await getTestApp();

      // GM view — both return the same counts (access check only)
      const gmCountsRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/codex/counts`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      const gmCounts = gmCountsRes.json<{ monsters: { known: number; total: number } }>();

      // Player can also read counts (owner of character)
      const playerCountsRes = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/codex/counts`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      const playerCounts = playerCountsRes.json<{ monsters: { known: number; total: number } }>();

      // Both return the same total (compendium size is global)
      expect(gmCounts.monsters.total).toBe(playerCounts.monsters.total);
      // known count matches (character-specific, same data)
      expect(gmCounts.monsters.known).toBe(playerCounts.monsters.known);
      // At this point the character has at least 1 grant (TEST_MONSTER from POST tests)
      expect(gmCounts.monsters.known).toBeGreaterThanOrEqual(1);
    });

    it('Outsider (no world membership) → 403 FORBIDDEN', async () => {
      const app = await getTestApp();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/codex/counts`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('FORBIDDEN');
    });

    it('Non-existent character → 404', async () => {
      const app = await getTestApp();

      const fakeId = '00000000-0000-0000-0000-000000000002';
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${fakeId}/codex/counts`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});

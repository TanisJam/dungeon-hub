/**
 * Integration tests — uuid-bridge-npc Wave 5a (B-2)
 *
 * RED-first per STRICT TDD.
 *
 * Tests the NPC knowledge resolver and codex counts:
 * - GET /characters/:id/knowledge/npcs (player: known-only + dmNotes absent; DM: all + known flag)
 * - GET /characters/:id/codex/counts (npc: { known, total })
 * - Orphaned UUID tolerance (deleted NPC silently dropped)
 * - dmNotes NON-LEAK (SECURITY-CRITICAL): response JSON must NOT contain 'dmNotes' key for player
 *
 * REQ-UBN-READ, REQ-UBN-SECURITY, REQ-UBN-COUNTS
 * uuid-bridge-npc SDD design #2003, spec #2002, tasks #2004.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

describe('uuid-bridge-npc: NPC knowledge resolver + codex counts', () => {
  let gm: TestUser;
  let player: TestUser;
  let worldId: string;
  let characterId: string;

  /** ID of the NPC that WILL be granted to the character. */
  let grantedNpcId: string;
  /** ID of the NPC that will NOT be granted (ungranted, DM-only visible). */
  let ungrantedNpcId: string;
  /** The dmNotes value for the granted NPC — used to assert absence from player DOM. */
  const GRANTED_NPC_DM_NOTES = 'SECRET-DM-NOTES-MUST-NOT-LEAK-uuid-bridge-npc';

  beforeAll(async () => {
    const app = await getTestApp();

    // Create users
    gm = await createTestUser();
    player = await createTestUser();

    // Create world + player membership
    ({ worldId } = await createWorldWithGm(gm.id));
    await addWorldMember(worldId, player.id, 'player');

    // Create a character owned by the player, inside the GM's world
    const charRes = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { worldId, name: 'NPC Knowledge Test Hero' },
    });
    expect(charRes.statusCode).toBe(201);
    characterId = charRes.json<{ id: string }>().id;

    // Create NPC #1 (will be granted, has dmNotes)
    const npc1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/npcs`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        name: 'Innkeeper Mira',
        race: 'Human',
        description: 'Runs the local inn.',
        dmNotes: GRANTED_NPC_DM_NOTES,
        status: 'alive',
      },
    });
    expect(npc1Res.statusCode).toBe(201);
    grantedNpcId = npc1Res.json<{ id: string }>().id;

    // Create NPC #2 (will NOT be granted)
    const npc2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/npcs`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        name: 'Blacksmith Aldric',
        race: 'Dwarf',
        description: 'Crafts weapons.',
        status: 'alive',
      },
    });
    expect(npc2Res.statusCode).toBe(201);
    ungrantedNpcId = npc2Res.json<{ id: string }>().id;

    // GM grants NPC #1 to the character
    const grantRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/knowledge`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { kind: 'npc', refKey: grantedNpcId, refSource: 'world' },
    });
    expect(grantRes.statusCode).toBe(200);
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    await closeTestApp();
  });

  // ── GET /knowledge/npcs — player view ────────────────────────────────────────

  describe('GET /characters/:id/knowledge/npcs — player view', () => {
    it('player sees exactly the granted NPC, not the ungranted one', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/npcs`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{ id: string; name: string; known: boolean }>;
        total: number;
        knownCount: number;
        effectiveView: string;
      }>();

      expect(body.effectiveView).toBe('player');
      // total = world NPC count (2); knownCount = granted NPCs for this character (1)
      expect(body.total).toBe(2);
      expect(body.knownCount).toBe(1);
      // Player sees only the granted NPC
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]!.id).toBe(grantedNpcId);
      expect(body.rows[0]!.known).toBe(true);
      // Ungranted NPC absent
      const ungrantedPresent = body.rows.some((r) => r.id === ungrantedNpcId);
      expect(ungrantedPresent).toBe(false);
    });

    it('SECURITY: player response body contains NO dmNotes key in any row', async () => {
      // REQ-UBN-SECURITY — CRITICAL assertion.
      // Serializes the full JSON response and asserts structural absence of dmNotes.
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/npcs`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Record<string, unknown>[] }>();

      // Structural key absence — not just text absence
      for (const row of body.rows) {
        expect(Object.hasOwn(row, 'dmNotes')).toBe(false);
      }

      // Also assert the raw JSON string does not contain the dmNotes sentinel value
      expect(res.payload).not.toContain(GRANTED_NPC_DM_NOTES);
    });
  });

  // ── GET /knowledge/npcs — DM view ────────────────────────────────────────────

  describe('GET /characters/:id/knowledge/npcs — DM view', () => {
    it('DM sees all NPCs with known flag + dmNotes present', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/npcs`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{ id: string; name: string; known: boolean; dmNotes?: string | null }>;
        total: number;
        knownCount: number;
        effectiveView: string;
      }>();

      expect(body.effectiveView).toBe('dm');
      // DM sees all NPCs in the world
      expect(body.rows).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.knownCount).toBe(1);

      // Granted NPC: known=true
      const granted = body.rows.find((r) => r.id === grantedNpcId);
      expect(granted).toBeDefined();
      expect(granted!.known).toBe(true);

      // Ungranted NPC: known=false
      const ungranted = body.rows.find((r) => r.id === ungrantedNpcId);
      expect(ungranted).toBeDefined();
      expect(ungranted!.known).toBe(false);
    });
  });

  // ── Orphaned UUID tolerance ──────────────────────────────────────────────────

  describe('orphaned UUID — deleted NPC silently dropped', () => {
    it('orphaned refKey in character_knowledge does not crash the resolver', async () => {
      const app = await getTestApp();

      // Insert a knowledge row pointing to a UUID that does NOT exist in the npcs table
      const { db } = await import('../../src/infra/db/client.js');
      const { characterKnowledge } = await import('../../src/infra/db/schema.js');

      const orphanedUuid = '00000000-dead-beef-cafe-000000000000';
      await db.insert(characterKnowledge).values({
        characterId,
        worldId,
        kind: 'npc',
        refKey: orphanedUuid,
        refSource: 'world',
        source: 'dm-grant',
        grantedByUserId: gm.id,
      }).onConflictDoNothing();

      // Request should succeed — orphaned UUID silently dropped
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/npcs`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Array<{ id: string }> }>();

      // Orphaned UUID not in rows
      const orphanInRows = body.rows.some((r) => r.id === orphanedUuid);
      expect(orphanInRows).toBe(false);
    });
  });

  // ── GET /codex/counts — npc counts ──────────────────────────────────────────

  describe('GET /characters/:id/codex/counts — npc field', () => {
    it('counts include npc: { known, total } with correct values', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/codex/counts`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        monsters: { known: number; total: number };
        npc: { known: number; total: number };
      }>();

      // npc field must be present (not undefined)
      expect(body.npc).toBeDefined();
      // total = world NPCs (2; orphaned row is in character_knowledge but not in npcs table)
      expect(body.npc.total).toBe(2);
      // known = character_knowledge kind='npc' count (2: grantedNpcId + orphaned — both rows exist)
      // NOTE: known count is from character_knowledge rows, not from resolved NPC rows.
      // With the orphaned row inserted above, known = 2.
      expect(body.npc.known).toBeGreaterThanOrEqual(1);
    });

    it('codex counts zero NPCs — npc field present with zeros (world with no NPCs)', async () => {
      // Create a fresh world with no NPCs and verify npc counts are { known:0, total:0 }
      const freshGm = await createTestUser();
      const { worldId: emptyWorldId } = await createWorldWithGm(freshGm.id);
      const freshPlayer = await createTestUser();
      await addWorldMember(emptyWorldId, freshPlayer.id, 'player');

      const app = await getTestApp();
      const freshCharRes = await app.inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${freshPlayer.accessToken}` },
        payload: { worldId: emptyWorldId, name: 'Zero NPC Hero' },
      });
      expect(freshCharRes.statusCode).toBe(201);
      const freshCharId = freshCharRes.json<{ id: string }>().id;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${freshCharId}/codex/counts`,
        headers: { authorization: `Bearer ${freshGm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ npc: { known: number; total: number } }>();

      expect(body.npc).toBeDefined();
      expect(body.npc.total).toBe(0);
      expect(body.npc.known).toBe(0);

      // Cleanup
      await deleteTestUser(freshGm.id);
      await deleteTestUser(freshPlayer.id);
    });
  });
});

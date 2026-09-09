/**
 * Integration tests — uuid-bridge-factions-pois Wave 5b (B-2)
 *
 * RED-first per STRICT TDD.
 *
 * Tests the faction + POI knowledge resolver and related behaviors:
 * - faction grant writes a knowledge row (MUST-FIX: faction_discovered event mapping)
 * - player faction read: dmNotes key structurally absent
 * - player POI read: dmNotes AND parentHexStatus keys structurally absent
 * - granted POI on unexplored hex appears in player codex (known-overrides-cascade, ADR-1b)
 * - DM POI read: parentHexStatus absent (never on wire for anyone)
 * - location grant regression guard (already works, confirm no regression)
 *
 * REQ-UBFP-GRANT-EVENT-FIX, REQ-UBFP-SECURITY, REQ-UBFP-READ-FACTION,
 * REQ-UBFP-READ-LOCATION, REQ-UBFP-HEX-CASCADE
 * uuid-bridge-factions-pois SDD design #2012, spec #2011, tasks #2013.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

describe('uuid-bridge-factions-pois: faction + POI knowledge resolver', () => {
  let gm: TestUser;
  let player: TestUser;
  let worldId: string;
  let characterId: string;

  /** ID of the faction that WILL be granted to the character. */
  let grantedFactionId: string;
  /** The dmNotes value for the granted faction — used to assert absence from player response. */
  const GRANTED_FACTION_DM_NOTES = 'SECRET-FACTION-DM-NOTES-MUST-NOT-LEAK-uuid-bridge-factions-pois';

  /** ID of the POI that WILL be granted to the character. */
  let grantedPoiId: string;
  /** ID of a second POI on an UNEXPLORED hex — to test cascade-override. */
  let poiOnUnexploredHexId: string;
  /** The dmNotes value for the granted POI. */
  const GRANTED_POI_DM_NOTES = 'SECRET-POI-DM-NOTES-MUST-NOT-LEAK-uuid-bridge-factions-pois';

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
      payload: { worldId, name: 'Faction POI Knowledge Test Hero' },
    });
    expect(charRes.statusCode).toBe(201);
    characterId = charRes.json<{ id: string }>().id;

    // Create Faction #1 (will be granted, has dmNotes)
    const faction1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/factions`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        name: 'The Shadow Council',
        description: 'A mysterious organization operating in the shadows.',
        dmNotes: GRANTED_FACTION_DM_NOTES,
        state: 'active',
      },
    });
    expect(faction1Res.statusCode).toBe(201);
    grantedFactionId = faction1Res.json<{ id: string }>().id;

    // Create Faction #2 (will NOT be granted)
    const faction2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/factions`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        name: 'The Merchant League',
        description: 'A powerful trading consortium.',
        state: 'active',
      },
    });
    expect(faction2Res.statusCode).toBe(201);
    // ungrantedFactionId stored but not used directly — exists for total count
    faction2Res.json<{ id: string }>().id;

    // GM grants Faction #1 to the character
    const factionGrantRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/knowledge`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { kind: 'faction', refKey: grantedFactionId, refSource: 'world' },
    });
    // Test A — faction grant writes knowledge row (MUST-FIX: faction_discovered mapping)
    // This assertion is the RED gate for T-03 Test A; turns GREEN after T-05.
    expect(factionGrantRes.statusCode).toBe(200);

    // Create POI #1 (will be granted, has dmNotes, free-floating = no hex)
    const poi1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/pois`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        name: 'The Hidden Vault',
        description: 'A vault hidden beneath the city.',
        dmNotes: GRANTED_POI_DM_NOTES,
        status: 'discovered',
      },
    });
    expect(poi1Res.statusCode).toBe(201);
    grantedPoiId = poi1Res.json<{ id: string }>().id;

    // Create POI #2 — will be granted but its parent hex is 'unexplored' (cascade-override test).
    // Since hexId is null (free-floating), parentHexStatus = null — this POI is freely visible.
    // For the cascade test we need a hex-associated POI on an unexplored hex.
    // We'll use a hex with status='unexplored' (default for new hexes).
    // For simplicity, create hex first:
    const hexRes = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/hexes`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { q: 0, r: 0, s: 0, terrain: 'plains' },
    });
    expect(hexRes.statusCode).toBe(201);
    const hexId = hexRes.json<{ id: string }>().id;

    // Verify hex is unexplored (default)
    const hexGet = await app.inject({
      method: 'GET',
      url: `/api/v1/hexes/${hexId}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(hexGet.statusCode).toBe(200);
    // hex status defaults to 'unexplored' — cascade test depends on this

    // Create POI on that hex
    const poi2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/hexes/${hexId}/pois`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: {
        name: 'Ancient Tower on Unexplored Hex',
        description: 'An old watchtower.',
        status: 'discovered',
      },
    });
    expect(poi2Res.statusCode).toBe(201);
    poiOnUnexploredHexId = poi2Res.json<{ id: string }>().id;

    // GM grants POI #1 to the character
    const poiGrantRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/knowledge`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { kind: 'location', refKey: grantedPoiId, refSource: 'world' },
    });
    expect(poiGrantRes.statusCode).toBe(200);

    // GM grants POI #2 (on unexplored hex) to the character — cascade-override test
    const poiCascadeGrantRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/knowledge`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { kind: 'location', refKey: poiOnUnexploredHexId, refSource: 'world' },
    });
    expect(poiCascadeGrantRes.statusCode).toBe(200);
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    await closeTestApp();
  });

  // ── Test A — faction grant writes knowledge row (MUST-FIX: faction_discovered) ──

  describe('Test A — faction grant: knowledge row written (faction_discovered fix)', () => {
    it('character_knowledge has a row with kind=faction after grant', async () => {
      // REQ-UBFP-GRANT-EVENT-FIX — CRITICAL assertion.
      // The grant route emits type='faction_discovered'. Without the resolveKind mapping,
      // NO knowledge row is written (silent dead feature). This test gates T-05.
      const { db } = await import('../../src/infra/db/client.js');
      const { characterKnowledge } = await import('../../src/infra/db/schema.js');
      const { eq, and } = await import('drizzle-orm');

      const rows = await db
        .select()
        .from(characterKnowledge)
        .where(
          and(
            eq(characterKnowledge.characterId, characterId),
            eq(characterKnowledge.kind, 'faction'),
            eq(characterKnowledge.refKey, grantedFactionId),
          ),
        );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.refSource).toBe('world');
    });
  });

  // ── Test B — player faction codex read: dmNotes structurally absent ───────────

  describe('Test B — GET /knowledge/factions — player view: dmNotes absent', () => {
    it('SECURITY: player response body contains NO dmNotes key in any faction row', async () => {
      // REQ-UBFP-SECURITY — CRITICAL assertion.
      // Serializes the full JSON response and asserts structural key absence of dmNotes.
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/factions`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Record<string, unknown>[]; knownCount: number; total: number }>();

      // Must have at least the granted faction (knownCount >= 1)
      expect(body.knownCount).toBeGreaterThanOrEqual(1);

      // Structural key absence — not just falsy value
      for (const row of body.rows) {
        expect(Object.hasOwn(row, 'dmNotes')).toBe(false);
      }

      // Also assert the raw JSON string does not contain the sentinel value
      expect(res.payload).not.toContain(GRANTED_FACTION_DM_NOTES);
    });
  });

  // ── Test C — player POI codex read: dmNotes AND parentHexStatus absent ───────

  describe('Test C — GET /knowledge/locations — player view: dmNotes + parentHexStatus absent', () => {
    it('SECURITY: player response body contains NO dmNotes key AND no parentHexStatus key', async () => {
      // REQ-UBFP-SECURITY — CRITICAL assertion ×2 fields.
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/locations`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Record<string, unknown>[]; knownCount: number }>();

      expect(body.knownCount).toBeGreaterThanOrEqual(1);

      for (const row of body.rows) {
        expect(Object.hasOwn(row, 'dmNotes')).toBe(false);
        expect(Object.hasOwn(row, 'parentHexStatus')).toBe(false);
      }

      // Assert sentinel dmNotes value absent from raw response
      expect(res.payload).not.toContain(GRANTED_POI_DM_NOTES);
    });
  });

  // ── Test D — granted POI on unexplored hex appears in player codex ────────────

  describe('Test D — granted POI on unexplored hex: cascade-override (ADR-1b)', () => {
    it('POI granted on unexplored hex appears in player /knowledge/locations response', async () => {
      // REQ-UBFP-HEX-CASCADE — known overrides cascade.
      // The DM explicitly granted the POI; it must appear regardless of hex exploration status.
      // This test fails if readLocationsKind uses filterWorldPoisForPlayer (which hides
      // POIs on unexplored hexes) instead of the known-UUID-set-only gate.
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/locations`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Array<{ id: string; known: boolean }>; knownCount: number }>();

      // Both granted POIs must appear (including the one on the unexplored hex)
      const cascadePoiInRows = body.rows.some((r) => r.id === poiOnUnexploredHexId);
      expect(cascadePoiInRows).toBe(true);
      expect(body.knownCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Test E — DM POI codex read: parentHexStatus absent ───────────────────────

  describe('Test E — GET /knowledge/locations — DM view: parentHexStatus absent', () => {
    it('DM response body contains no parentHexStatus key in any POI row', async () => {
      // REQ-UBFP-READ-LOCATION, C10 — parentHexStatus MUST never reach the wire,
      // for both player and DM views.
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/characters/${characterId}/knowledge/locations`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Record<string, unknown>[];
        total: number;
        knownCount: number;
        effectiveView: string;
      }>();

      expect(body.effectiveView).toBe('dm');
      // DM sees all POIs in the world
      expect(body.rows.length).toBeGreaterThanOrEqual(2);

      for (const row of body.rows) {
        expect(Object.hasOwn(row, 'parentHexStatus')).toBe(false);
      }
    });
  });

  // ── Location grant regression guard ──────────────────────────────────────────

  describe('location grant regression guard (should already work)', () => {
    it('character_knowledge has a row with kind=location after grant', async () => {
      const { db } = await import('../../src/infra/db/client.js');
      const { characterKnowledge } = await import('../../src/infra/db/schema.js');
      const { eq, and } = await import('drizzle-orm');

      const rows = await db
        .select()
        .from(characterKnowledge)
        .where(
          and(
            eq(characterKnowledge.characterId, characterId),
            eq(characterKnowledge.kind, 'location'),
            eq(characterKnowledge.refKey, grantedPoiId),
          ),
        );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.refSource).toBe('world');
    });
  });
});

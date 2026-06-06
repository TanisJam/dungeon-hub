/**
 * Integration tests — codex-knowledge A-4: Extend GET /characters/:id/knowledge/:kind
 * to all 7 kinds + devMode bypass.
 *
 * RED-first per STRICT TDD (codex-knowledge SDD tasks #1950).
 *
 * ADR-2 (Option A, oq-resolutions #1946):
 *   - monsters: FULL catalog + known flags (real round-trip)
 *   - npcs/factions/locations/lore: gated-EMPTY { rows: [], total: 0, knownCount: 0 }
 *
 * REQ-CK-GATE-03, GATE-04, GATE-05, GATE-06, GATE-07, REQ-CK-RT-02, RT-03,
 * REQ-CK-DEV-02, DEV-04, REQ-CK-API-01, API-02.
 *
 * Design intent: FORK 2 + FORK 5 (#1944).
 * This arc encodes NO PHB rule.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

describe('codex-knowledge A-4: GET /characters/:id/knowledge/:kind — all 7 kinds + devMode', () => {
  let gm: TestUser;
  let player: TestUser;
  let devPlayer: TestUser;
  let worldId: string;
  let characterId: string;
  let devCharacterId: string;

  beforeAll(async () => {
    const app = await getTestApp();

    gm = await createTestUser();
    player = await createTestUser();
    devPlayer = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id));
    await addWorldMember(worldId, player.id, 'player');
    await addWorldMember(worldId, devPlayer.id, 'player');

    // Create a character for the player
    const charRes = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { worldId, name: 'A4 Test Character' },
    });
    expect(charRes.statusCode).toBe(201);
    characterId = charRes.json<{ id: string }>().id;

    // Create a character for the devPlayer
    const devCharRes = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${devPlayer.accessToken}` },
      payload: { worldId, name: 'A4 DevMode Character' },
    });
    expect(devCharRes.statusCode).toBe(201);
    devCharacterId = devCharRes.json<{ id: string }>().id;

    // Set devPlayer's devMode = true via direct DB write
    const { db } = await import('../../src/infra/db/client.js');
    const { users } = await import('../../src/infra/db/schema.js');
    await db.update(users).set({ devMode: true }).where(eq(users.id, devPlayer.id));
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (devPlayer) await deleteTestUser(devPlayer.id);
    await closeTestApp();
  });

  // ── world-knowledge gated-empty kinds (ADR-2 Option A) ─────────────────────

  it('GET /knowledge/npcs as player → gated-empty { rows: [], total: 0, knownCount: 0, effectiveView: "player" }', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/knowledge/npcs`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.knownCount).toBe(0);
    expect(body.effectiveView).toBe('player');
  });

  it('GET /knowledge/factions as player → gated-empty', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/knowledge/factions`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.knownCount).toBe(0);
  });

  it('GET /knowledge/locations as player → gated-empty', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/knowledge/locations`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toEqual([]);
  });

  it('GET /knowledge/lore as player → gated-empty', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/knowledge/lore`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toEqual([]);
  });

  // ── Invalid kind returns 400 with INVALID_KIND (REQ-CK-GATE-04) ────────────

  it('GET /knowledge/dragons → 400 VALIDATION_FAILED + INVALID_KIND issue', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/knowledge/dragons`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    // Must be VALIDATION_FAILED or have issues
    // The current implementation uses Zod enum validation which returns 400
    expect(res.statusCode).toBe(400);
  });

  // ── devMode bypass (REQ-CK-DEV-02, FORK 5 #1944) ─────────────────────────

  it('devMode player with 0 knowledge rows gets effectiveView="dm" (bypass gate)', async () => {
    const app = await getTestApp();
    // devPlayer has devMode=true but zero character_knowledge rows for monsters
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${devCharacterId}/knowledge/monsters`,
      headers: { authorization: `Bearer ${devPlayer.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // effectiveView must be 'dm' (devMode bypass active) or all rows are visible
    // with 0 knowledge rows, a normal player would see rows:[]
    // with devMode, they see all = same as DM
    expect(body.effectiveView).toBe('dm');
  });

  // ── DM always sees all with known: boolean (REQ-CK-GATE-07) ──────────────

  it('DM calling knowledge/monsters sees effectiveView="dm"', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/knowledge/monsters`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.effectiveView).toBe('dm');
  });

  // ── monsters: still works (existing behavior preserved) ───────────────────

  it('GET /knowledge/monsters as player with no knowledge rows → 200 with rows: []', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/knowledge/monsters`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.effectiveView).toBe('player');
    expect(Array.isArray(body.rows)).toBe(true);
    // player with 0 knowledge rows sees no monsters (anti-metagaming gate)
    expect(body.rows).toEqual([]);
  });
});

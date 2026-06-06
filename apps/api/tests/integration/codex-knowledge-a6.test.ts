/**
 * Integration tests — codex-knowledge A-6: contributions endpoints.
 *
 * RED-first per STRICT TDD (codex-knowledge SDD tasks #1950).
 *
 * Endpoints under test:
 *   POST   /worlds/:worldId/contributions        — create (any world member)
 *   GET    /worlds/:worldId/contributions        — list (visibility-filtered)
 *   POST   /contributions/:id/seal              — GM only
 *   POST   /contributions/:id/hide              — GM only
 *   POST   /contributions/:id/visibility        — author or GM (promote only)
 *
 * APPEND-ONLY INVARIANT:
 *   PATCH /contributions/:id must NOT exist (405 or 404).
 *   DELETE /contributions/:id must NOT exist.
 *
 * Design: FORK 4 (#1944). ADR-1 (#1948): guild_contributions is a new table.
 * This arc encodes NO PHB rule.
 *
 * REQ-CK-NOTE-01, NOTE-04, NOTE-05, NOTE-09, REQ-CK-GC-03, GC-04, GC-05,
 * REQ-CK-API-01, API-02, API-03, API-04, API-05, API-06.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

describe('codex-knowledge A-6: contributions endpoints', () => {
  let gm: TestUser;
  let player1: TestUser;
  let player2: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    await getTestApp();

    gm = await createTestUser();
    player1 = await createTestUser();
    player2 = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id));
    await addWorldMember(worldId, player1.id, 'player');
    await addWorldMember(worldId, player2.id, 'player');
    // outsider is NOT a world member
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player1) await deleteTestUser(player1.id);
    if (player2) await deleteTestUser(player2.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ── POST /worlds/:worldId/contributions (SCENARIO GC-B, NOTE-A) ───────────

  it('SCENARIO GC-B: world member creates contribution → 200 + visibility=personal default', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: {
        contributionType: 'sighting',
        body: 'Spotted 3 goblins near the river',
        refEntityKind: 'bestiary',
        refEntityId: 'goblin',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.visibility).toBe('personal');
    expect(body.body).toBe('Spotted 3 goblins near the river');
  });

  it('empty body → 400 CONTRIBUTION_BODY_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'sighting', body: '', visibility: 'personal' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues).toContainEqual(expect.objectContaining({ code: 'CONTRIBUTION_BODY_REQUIRED' }));
  });

  it('invalid contributionType → 400 CONTRIBUTION_TYPE_INVALID', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'invalid-type', body: 'Some note', visibility: 'personal' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues).toContainEqual(expect.objectContaining({ code: 'CONTRIBUTION_TYPE_INVALID' }));
  });

  it('non-member creating contribution → 403 FORBIDDEN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { contributionType: 'nota', body: 'Outsider note' },
    });

    expect(res.statusCode).toBe(403);
  });

  // ── SCENARIO GC-A: append-only invariant enforced ─────────────────────────

  it('SCENARIO GC-A: PATCH /contributions/:id does NOT exist → 404 or 405', async () => {
    const app = await getTestApp();
    // Create a contribution first
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'nota', body: 'Note to try patching' },
    }).then((r) => r.json());

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contributions/${created.id}`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { body: 'Attempted patch' },
    });

    expect([404, 405]).toContain(res.statusCode);
  });

  // ── GET /worlds/:worldId/contributions (SCENARIO NOTE-B) ─────────────────

  it("SCENARIO NOTE-B: player sees own personal note, NOT another player's personal note", async () => {
    const app = await getTestApp();

    // P1 creates a personal note
    const p1Note = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'sighting', body: 'P1 private sighting' },
    }).then((r) => r.json() as { id: string });

    // P2 creates a personal note
    const p2Note = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player2.accessToken}` },
      payload: { contributionType: 'rumor', body: 'P2 private rumor' },
    }).then((r) => r.json() as { id: string });

    // P1 lists → sees own, NOT P2's
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = (body.rows as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(p1Note.id);
    expect(ids).not.toContain(p2Note.id);
  });

  // ── SCENARIO GC-D: dangling refEntityId returns without 500 ──────────────

  it('SCENARIO GC-D: contribution with dangling refEntityId still returns in GET without 500', async () => {
    const app = await getTestApp();

    // Create contribution referencing a non-existent entity
    await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: {
        contributionType: 'sighting',
        body: 'Note with dangling ref',
        refEntityKind: 'npc',
        refEntityId: 'non-existent-uuid-xyz',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Should have rows (the dangling one included) and no 500
    expect(Array.isArray(body.rows)).toBe(true);
  });

  // ── POST /contributions/:id/seal (SCENARIO GC-C, NOTE-D) ──────────────────

  it('SCENARIO GC-C: GM seals contribution as confirmed → sealedStatus=confirmed', async () => {
    const app = await getTestApp();

    // Create contribution
    const contrib = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'rumor', body: 'Rumor to confirm' },
    }).then((r) => r.json() as { id: string });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/contributions/${contrib.id}/seal`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { sealedStatus: 'confirmed' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sealedStatus).toBe('confirmed');
    expect(body.sealedBy).toBeDefined();
  });

  // ── SCENARIO NOTE-E: non-GM cannot seal ──────────────────────────────────

  it('SCENARIO NOTE-E: player calling seal → 403 FORBIDDEN', async () => {
    const app = await getTestApp();

    const contrib = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'nota', body: 'Note to attempt seal' },
    }).then((r) => r.json() as { id: string });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/contributions/${contrib.id}/seal`,
      headers: { authorization: `Bearer ${player2.accessToken}` },
      payload: { sealedStatus: 'confirmed' },
    });

    expect(res.statusCode).toBe(403);
  });

  // ── POST /contributions/:id/hide (SCENARIO NOTE-F) ───────────────────────

  it('SCENARIO NOTE-F: GM hides contribution → visibility=personal', async () => {
    const app = await getTestApp();

    // Create a guild contribution first
    const contrib = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'rumor', body: 'Guild rumor to hide', visibility: 'guild' },
    }).then((r) => r.json() as { id: string });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/contributions/${contrib.id}/hide`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.visibility).toBe('personal');
  });

  // ── POST /contributions/:id/visibility (SCENARIO NOTE-C) ─────────────────

  it('SCENARIO NOTE-C: author promotes contribution to guild → visible to other members', async () => {
    const app = await getTestApp();

    // P1 creates a personal note
    const contrib = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { contributionType: 'sighting', body: 'Sighting to promote to guild' },
    }).then((r) => r.json() as { id: string });

    // P1 promotes to guild
    const promoteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/contributions/${contrib.id}/visibility`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: { visibility: 'guild' },
    });

    expect(promoteRes.statusCode).toBe(200);
    expect(promoteRes.json().visibility).toBe('guild');

    // P2 can now see it
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player2.accessToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const ids = (listRes.json().rows as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(contrib.id);
  });
});

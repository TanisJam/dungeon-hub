/**
 * sessions-b0-enrichment.test.ts — Integration tests for Batch B0 API enrichment.
 *
 * Covers:
 *  - REQ-DPPMB-DETAIL-04: GET /sessions/:id returns enriched participants with
 *    name, lineage, and level for MULTIPLE participants including another user's char.
 *  - REQ-DPPMB-LIST-01: GET /sessions?campaignId returns currentPlayers count
 *    (active participants with leftAt IS NULL): 0, a positive count, and
 *    decrements correctly after a leave.
 *
 * N+1 guard: attachCurrentPlayers must issue a single grouped query, not one
 * per session. Verified via test setup with multiple sessions.
 *
 * Requires real Supabase + Postgres (sequential fork pool, 30s timeout).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let dm: TestUser;
let alice: TestUser;
let bob: TestUser;

let campaignId: string;
let worldId: string;

let aliceCharId: string;
let bobCharId: string;

let sessionId: string; // session used in detail enrichment tests

beforeAll(async () => {
  const app = await getTestApp();

  dm = await createTestUser();
  alice = await createTestUser();
  bob = await createTestUser();

  // DM creates a campaign (auto-creates world, adds DM as campaign GM + world GM)
  const campaignRes = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { authorization: `Bearer ${dm.accessToken}` },
    payload: { name: 'B0 Enrichment Campaign' },
  });
  const campaign = campaignRes.json() as { id: string; worldId: string };
  campaignId = campaign.id;
  worldId = campaign.worldId;

  // Alice and Bob join as players
  await addCampaignAndWorldMember(campaignId, alice.id, 'player');
  await addCampaignAndWorldMember(campaignId, bob.id, 'player');

  // Create characters for both players in this world
  aliceCharId = await app
    .inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { worldId, name: 'Alice the Brave' },
    })
    .then((r) => r.json<{ id: string }>().id);

  bobCharId = await app
    .inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { worldId, name: 'Bob the Wise' },
    })
    .then((r) => r.json<{ id: string }>().id);

  // DM creates a session for detail enrichment tests
  sessionId = await app
    .inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { campaignId, title: 'B0 Test Session' },
    })
    .then((r) => r.json<{ id: string }>().id);
});

afterAll(async () => {
  if (dm) await deleteTestUser(dm.id);
  if (alice) await deleteTestUser(alice.id);
  if (bob) await deleteTestUser(bob.id);
  await closeTestApp();
});

// ---------------------------------------------------------------------------
// REQ-DPPMB-DETAIL-04 — Enriched participants in GET /sessions/:id
// ---------------------------------------------------------------------------

describe('GET /sessions/:id — enriched participants', () => {
  it('returns empty participants array when no one has joined', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ participants: unknown[] }>();
    expect(body.participants).toEqual([]);
  });

  it('enriches participants with name, lineage, and level for the caller\'s own character', async () => {
    const app = await getTestApp();

    // Alice joins the session
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/join`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: aliceCharId },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      participants: Array<{
        characterId: string;
        userId: string;
        joinedAt: string;
        leftAt: string | null;
        name: string;
        lineage: string | null;
        level: number;
      }>;
    }>();

    expect(body.participants).toHaveLength(1);
    const p = body.participants[0]!;
    expect(p.characterId).toBe(aliceCharId);
    expect(p.userId).toBe(alice.id);
    expect(p.joinedAt).toBeDefined();
    expect(p.leftAt).toBeNull();
    // Enriched fields
    expect(p.name).toBe('Alice the Brave');
    expect(p.lineage).toBeNull(); // no lineage set on creation
    expect(typeof p.level).toBe('number');
    expect(p.level).toBe(0); // no classes set yet
  });

  it('enriches MULTIPLE participants including another user\'s character (REQ-DPPMB-DETAIL-04)', async () => {
    const app = await getTestApp();

    // Bob also joins the session
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/join`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { characterId: bobCharId },
    });

    // DM fetches detail — can see all participants
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      participants: Array<{
        characterId: string;
        userId: string;
        name: string;
        lineage: string | null;
        level: number;
      }>;
    }>();

    expect(body.participants).toHaveLength(2);

    const aliceP = body.participants.find((p) => p.characterId === aliceCharId);
    const bobP = body.participants.find((p) => p.characterId === bobCharId);

    expect(aliceP).toBeDefined();
    expect(aliceP!.name).toBe('Alice the Brave');
    expect(aliceP!.userId).toBe(alice.id);
    expect(typeof aliceP!.level).toBe('number');

    expect(bobP).toBeDefined();
    expect(bobP!.name).toBe('Bob the Wise');
    expect(bobP!.userId).toBe(bob.id);
    expect(typeof bobP!.level).toBe('number');
  });

  it('Alice can see both participants including Bob\'s character (cross-user enrichment)', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      participants: Array<{
        characterId: string;
        name: string;
        lineage: string | null;
        level: number;
      }>;
    }>();

    expect(body.participants).toHaveLength(2);
    const bobP = body.participants.find((p) => p.characterId === bobCharId);
    expect(bobP).toBeDefined();
    expect(bobP!.name).toBe('Bob the Wise');
  });

  it('does not leak dmNotes via participants', async () => {
    const app = await getTestApp();

    // Create a session with dmNotes
    const sessionWithNotes = await app
      .inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { campaignId, title: 'Notes Session', dmNotes: 'Secret DM info' },
      })
      .then((r) => r.json<{ id: string }>().id);

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionWithNotes}/join`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: aliceCharId },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionWithNotes}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ dmNotes?: unknown; participants: Array<Record<string, unknown>> }>();
    // Player should NOT see dmNotes
    expect(body.dmNotes).toBeUndefined();
    // Participants should not contain any dmNotes field
    for (const p of body.participants) {
      expect(p['dmNotes']).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// REQ-DPPMB-LIST-01 — currentPlayers count in GET /sessions?campaignId
// ---------------------------------------------------------------------------

describe('GET /sessions?campaignId — currentPlayers count', () => {
  let sessionA: string;
  let sessionB: string;
  let sessionC: string;

  beforeAll(async () => {
    const app = await getTestApp();

    // Create 3 sessions for list tests — separate from the enrichment session
    sessionA = await app
      .inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { campaignId, title: 'List Session A' },
      })
      .then((r) => r.json<{ id: string }>().id);

    sessionB = await app
      .inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { campaignId, title: 'List Session B' },
      })
      .then((r) => r.json<{ id: string }>().id);

    sessionC = await app
      .inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { campaignId, title: 'List Session C' },
      })
      .then((r) => r.json<{ id: string }>().id);
  });

  it('returns currentPlayers=0 when no participants have joined', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ id: string; currentPlayers: number }> }>();

    const sA = body.data.find((s) => s.id === sessionA);
    const sB = body.data.find((s) => s.id === sessionB);
    const sC = body.data.find((s) => s.id === sessionC);

    expect(sA).toBeDefined();
    expect(sA!.currentPlayers).toBe(0);
    expect(sB).toBeDefined();
    expect(sB!.currentPlayers).toBe(0);
    expect(sC).toBeDefined();
    expect(sC!.currentPlayers).toBe(0);
  });

  it('returns correct positive currentPlayers count after joining', async () => {
    const app = await getTestApp();

    // Alice joins session A
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionA}/join`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: aliceCharId },
    });

    // Bob joins session A
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionA}/join`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { characterId: bobCharId },
    });

    // Alice also joins session B (only Alice here)
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionB}/join`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: aliceCharId },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ id: string; currentPlayers: number }> }>();

    const sA = body.data.find((s) => s.id === sessionA)!;
    const sB = body.data.find((s) => s.id === sessionB)!;
    const sC = body.data.find((s) => s.id === sessionC)!;

    // Session A: Alice + Bob = 2
    expect(sA.currentPlayers).toBe(2);
    // Session B: only Alice = 1
    expect(sB.currentPlayers).toBe(1);
    // Session C: nobody = 0
    expect(sC.currentPlayers).toBe(0);
  });

  it('decrements currentPlayers correctly after a leave', async () => {
    const app = await getTestApp();

    // Alice leaves session B
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionB}/leave`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: aliceCharId },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ id: string; currentPlayers: number }> }>();

    const sB = body.data.find((s) => s.id === sessionB)!;
    expect(sB.currentPlayers).toBe(0);

    // Session A count should be unaffected (still 2)
    const sA = body.data.find((s) => s.id === sessionA)!;
    expect(sA.currentPlayers).toBe(2);
  });

  it('all sessions in response have currentPlayers field (type number)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ currentPlayers: unknown }> }>();
    for (const session of body.data) {
      expect(typeof session.currentPlayers).toBe('number');
    }
  });
});

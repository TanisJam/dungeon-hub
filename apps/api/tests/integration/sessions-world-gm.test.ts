/**
 * sessions-world-gm.test.ts — Integration tests for world-GM access to sessions.
 *
 * Covers IT-DPPM-A-01..10 (SDD dm-player-play-model, Slice A).
 *
 * Key safety test: IT-DPPM-A-02 + IT-DPPM-A-06 (cross-world denial).
 * A world-GM of world W2 MUST NOT access a campaign that belongs to world W.
 * The gate resolves worldId from THE CAMPAIGN, not from the caller.
 *
 * Requires real Supabase + Postgres (sequential fork pool, 30s timeout).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let worldGm: TestUser;     // world-GM of world W with NO campaign_members row
let crossWorldGm: TestUser; // world-GM of W2 (different world) — must be denied
let campaignGm: TestUser;  // has campaign_members(role='gm') — regression path
let worldPlayer: TestUser; // world_members(role='player') in W — must be denied
let noMember: TestUser;    // no world or campaign membership at all

let worldId: string;       // world W (owns the campaign)
let worldId2: string;      // world W2 (different world — cross-world isolation)
let campaignId: string;    // campaign in world W

beforeAll(async () => {
  const app = await getTestApp();

  worldGm = await createTestUser();
  crossWorldGm = await createTestUser();
  campaignGm = await createTestUser();
  worldPlayer = await createTestUser();
  noMember = await createTestUser();

  // World W: campaignGm creates a campaign (auto-creates world, adds campaignGm as world-GM)
  const campaignRes = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { authorization: `Bearer ${campaignGm.accessToken}` },
    payload: { name: 'World-GM Test Campaign' },
  });
  const campaign = campaignRes.json() as { id: string; worldId: string };
  campaignId = campaign.id;
  worldId = campaign.worldId;

  // worldGm: world_members(role='gm') in W but NO campaign_members row
  await addWorldMember(worldId, worldGm.id, 'gm');

  // worldPlayer: world_members(role='player') in W, no campaign_members gm row
  await addWorldMember(worldId, worldPlayer.id, 'player');

  // World W2: crossWorldGm is GM of a completely separate world
  ({ worldId: worldId2 } = await createWorldWithGm(crossWorldGm.id, { name: 'Other World W2' }));
  // CRITICAL: crossWorldGm has NO membership in world W or campaign
});

afterAll(async () => {
  if (worldGm) await deleteTestUser(worldGm.id);
  if (crossWorldGm) await deleteTestUser(crossWorldGm.id);
  if (campaignGm) await deleteTestUser(campaignGm.id);
  if (worldPlayer) await deleteTestUser(worldPlayer.id);
  if (noMember) await deleteTestUser(noMember.id);
  await closeTestApp();
});

// ---------------------------------------------------------------------------
// Helper: create a session as campaign-GM for use in list tests
// ---------------------------------------------------------------------------
async function createSessionAsCampaignGm(): Promise<string> {
  const app = await getTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    headers: { authorization: `Bearer ${campaignGm.accessToken}` },
    payload: {
      campaignId,
      title: 'Test Session',
      dmNotes: 'Secret DM notes',
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createSessionAsCampaignGm failed: ${res.statusCode} ${res.body}`);
  }
  return (res.json() as { id: string }).id;
}

// ---------------------------------------------------------------------------
// IT-DPPM-A-01: World-GM (no campaign_members row) CAN create a session
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-01: world-GM creates session (no campaign_members row)', () => {
  it('POST /sessions → 201', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${worldGm.accessToken}` },
      payload: { campaignId, title: 'GM World Session' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { campaignId: string; gmUserId: string };
    expect(body.campaignId).toBe(campaignId);
    expect(body.gmUserId).toBe(worldGm.id);
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-02 (SAFETY-CRITICAL): Cross-world GM is DENIED on create
// World-GM of W2 must NOT create a session in a campaign that belongs to W.
// Gate resolves worldId from THE CAMPAIGN (not from the caller).
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-02: SAFETY — cross-world GM denied on create', () => {
  it('POST /sessions for W campaign by W2 GM → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${crossWorldGm.accessToken}` },
      payload: { campaignId, title: 'Cross World Attack' },
    });
    // crossWorldGm is GM of W2 but has NO membership in W at all → 'No sos miembro'
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-03: Campaign-GM regression — existing campaign_members.role='gm' still works
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-03: regression — campaign_members GM can still create', () => {
  it('POST /sessions → 201', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${campaignGm.accessToken}` },
      payload: { campaignId, title: 'Campaign GM Session' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-04: World-player (not gm) is DENIED on create
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-04: world-player is denied on create', () => {
  it('POST /sessions → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${worldPlayer.accessToken}` },
      payload: { campaignId, title: 'Player Session Attempt' },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-05: World-GM (no campaign_members row) CAN list sessions + sees dmNotes
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-05: world-GM lists sessions and sees dmNotes', () => {
  let preexistingSessionId: string;

  beforeAll(async () => {
    preexistingSessionId = await createSessionAsCampaignGm();
  });

  it('GET /sessions?campaignId → 200 with sessions including dmNotes', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${worldGm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string; dmNotes: string | null }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // World-GM sees dmNotes (not stripped)
    const session = body.data.find((s) => s.id === preexistingSessionId);
    expect(session).toBeDefined();
    expect(session?.dmNotes).toBe('Secret DM notes');
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-06 (SAFETY-CRITICAL): Cross-world GM is DENIED on list
// World-GM of W2 must NOT list sessions for a campaign that belongs to W.
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-06: SAFETY — cross-world GM denied on list', () => {
  it('GET /sessions?campaignId for W campaign by W2 GM → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${crossWorldGm.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-07: Existing campaign member can still list sessions
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-07: regression — campaign member can list sessions', () => {
  it('GET /sessions?campaignId → 200', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${campaignGm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-08: World-player (not gm) is DENIED on list
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-08: world-player is denied on list', () => {
  it('GET /sessions?campaignId → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${worldPlayer.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-09: Read-path tolerance — pre-existing session loads without error
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-09: read-path tolerance — pre-existing sessions load fine', () => {
  let sessionId: string;

  beforeAll(async () => {
    sessionId = await createSessionAsCampaignGm();
  });

  it('GET /sessions?campaignId → 200, pre-existing session appears', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${campaignGm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.some((s) => s.id === sessionId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// IT-DPPM-A-10: No-member caller is denied on both gates
// ---------------------------------------------------------------------------
describe('IT-DPPM-A-10: no-member caller denied on create and list', () => {
  it('POST /sessions → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${noMember.accessToken}` },
      payload: { campaignId, title: 'No Member Attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /sessions?campaignId → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions?campaignId=${campaignId}`,
      headers: { authorization: `Bearer ${noMember.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

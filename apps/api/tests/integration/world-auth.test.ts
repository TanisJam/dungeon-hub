/**
 * world-auth.test.ts — C3 integration tests
 *
 * Validates that auth gates for PATCH /campaigns/:id, PATCH /sessions/:id,
 * POST /sessions/:id/start (transition), POST /sessions/:id/complete, and
 * POST /characters/:id/xp use world-level GM membership instead of
 * campaigns.gm_user_id equality.
 *
 * REQs covered: REQ-WF-API-CAMPAIGN-AUTH, REQ-WF-API-SESSION-AUTH, REQ-WF-API-CHARACTER-XP-AUTH
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { DEFAULT_RULES_PROFILE } from '@dungeon-hub/domain/rules-profile';

// ---------------------------------------------------------------------------
// Local helpers — createWorldWithGm will be a proper helper in C7. For now,
// we inline the DB inserts directly here.
// ---------------------------------------------------------------------------

async function createWorldWithGm(
  userId: string,
  opts?: { name?: string },
): Promise<{ worldId: string }> {
  const { db } = await import('../../src/infra/db/client.js');
  const { worlds, worldMembers } = await import('../../src/infra/db/schema.js');
  const name = opts?.name ?? `Test World ${randomUUID().slice(0, 8)}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomUUID().slice(0, 8);
  const [world] = await db
    .insert(worlds)
    .values({
      name,
      slug,
      ownerUserId: userId,
      rulesProfile: DEFAULT_RULES_PROFILE,
    })
    .returning({ id: worlds.id });
  if (!world) throw new Error('Failed to create world');
  await db.insert(worldMembers).values({ worldId: world.id, userId, role: 'gm' });
  return { worldId: world.id };
}

async function addWorldMember(worldId: string, userId: string, role: 'gm' | 'player') {
  const { db } = await import('../../src/infra/db/client.js');
  const { worldMembers } = await import('../../src/infra/db/schema.js');
  await db.insert(worldMembers).values({ worldId, userId, role });
}

async function deleteWorldsForUser(userId: string) {
  const { db } = await import('../../src/infra/db/client.js');
  const { worlds } = await import('../../src/infra/db/schema.js');
  const { eq } = await import('drizzle-orm');
  await db.delete(worlds).where(eq(worlds.ownerUserId, userId));
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

/**
 * World W has three members:
 *   - dm (gmA): world owner + gm (created the world and campaign)
 *   - gm2 (gmB): second gm — NOT the campaign creator
 *   - player: world member with role='player'
 *   - outsider: has NO world membership
 */
describe('world-auth — world-level GM gates', () => {
  let dmA: TestUser;      // World owner, campaign creator
  let gmB: TestUser;      // Second GM (not campaign owner)
  let player: TestUser;   // player-role world member
  let outsider: TestUser; // no world membership

  let worldId: string;
  let campaignId: string;
  let sessionId: string;
  let characterId: string; // owned by player, lives in world W

  beforeAll(async () => {
    const app = await getTestApp();
    dmA = await createTestUser();
    gmB = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    // 1. Create world with dmA as GM owner
    ({ worldId } = await createWorldWithGm(dmA.id, { name: 'Auth Test World' }));

    // 2. Add gmB as additional gm, player as player
    await addWorldMember(worldId, gmB.id, 'gm');
    await addWorldMember(worldId, player.id, 'player');

    // 3. Create campaign under the world (using direct DB insert since POST /campaigns auto-creates world)
    const { db } = await import('../../src/infra/db/client.js');
    const { campaigns, campaignMembers } = await import('../../src/infra/db/schema.js');
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: 'Auth Test Campaign', gmUserId: dmA.id, worldId })
      .returning({ id: campaigns.id });
    if (!campaign) throw new Error('Failed to create campaign');
    campaignId = campaign.id;

    // Add dmA + gmB + player as campaign members
    await db.insert(campaignMembers).values([
      { campaignId, userId: dmA.id, role: 'gm' },
      { campaignId, userId: gmB.id, role: 'gm' },
      { campaignId, userId: player.id, role: 'player' },
    ]);

    // 4. Create a session (owned by dmA)
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${dmA.accessToken}` },
      payload: { campaignId, title: 'Auth Test Session' },
    });
    if (sessionRes.statusCode !== 201) {
      throw new Error(`Failed to create session: ${sessionRes.statusCode} ${sessionRes.body}`);
    }
    sessionId = sessionRes.json().id;

    // 5. Create a character for player in the world (direct DB insert to bypass C5 territory)
    const { characters } = await import('../../src/infra/db/schema.js');
    const [char] = await db
      .insert(characters)
      .values({ userId: player.id, worldId, name: 'Auth Test Char', data: {} })
      .returning({ id: characters.id });
    if (!char) throw new Error('Failed to create character');
    characterId = char.id;
  });

  afterAll(async () => {
    await deleteWorldsForUser(dmA.id);
    if (dmA) await deleteTestUser(dmA.id);
    if (gmB) await deleteTestUser(gmB.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ---- Gate 1: PATCH /campaigns/:id ----------------------------------------

  describe('PATCH /campaigns/:id — world GM auth gate', () => {
    it('non-owner GM (gmB) succeeds — 200', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${gmB.accessToken}` },
        payload: { name: 'Auth Test Campaign (edited by gmB)' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('player (role=player) gets 403 WORLD_GM_REQUIRED', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { name: 'Should not work' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues?.[0]?.code).toBe('WORLD_GM_REQUIRED');
    });

    it('non-member (outsider) gets 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { name: 'Should not work' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- Gate 2: PATCH /sessions/:id -----------------------------------------

  describe('PATCH /sessions/:id — world GM auth gate', () => {
    it('non-owner GM (gmB) succeeds — 200', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${gmB.accessToken}` },
        payload: { title: 'Edited by gmB' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('player (role=player) gets 403 WORLD_GM_REQUIRED', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { title: 'Should fail' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues?.[0]?.code).toBe('WORLD_GM_REQUIRED');
    });

    it('non-member (outsider) gets 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { title: 'Should fail' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- Gate 3: POST /sessions/:id/start (transition) -----------------------

  describe('POST /sessions/:id/start — world GM auth gate', () => {
    it('player (role=player) gets 403 WORLD_GM_REQUIRED', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/start`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues?.[0]?.code).toBe('WORLD_GM_REQUIRED');
    });

    it('non-member (outsider) gets 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/start`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('non-owner GM (gmB) can start session — 200', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/start`,
        headers: { authorization: `Bearer ${gmB.accessToken}` },
      });
      // Session transitions from scheduled → active. If it was already active, 400 is ok.
      expect([200, 400]).toContain(res.statusCode);
      if (res.statusCode === 400) {
        // Must be a state machine error, not a FORBIDDEN
        expect(res.json().error).not.toBe('FORBIDDEN');
      }
    });
  });

  // ---- Gate 4: POST /sessions/:id/complete ---------------------------------

  describe('POST /sessions/:id/complete — world GM auth gate', () => {
    it('player (role=player) gets 403 WORLD_GM_REQUIRED', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/complete`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues?.[0]?.code).toBe('WORLD_GM_REQUIRED');
    });

    it('non-member (outsider) gets 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/complete`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- Gate 5: POST /characters/:id/xp -------------------------------------

  describe('POST /characters/:id/xp — world GM auth gate', () => {
    it('non-owner GM (gmB) can award XP — 200', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/xp`,
        headers: { authorization: `Bearer ${gmB.accessToken}` },
        payload: { award: 100 },
      });
      expect(res.statusCode).toBe(200);
    });

    it('player (owner of character) cannot award own XP — 403 WORLD_GM_REQUIRED', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/xp`,
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { award: 100 },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues?.[0]?.code).toBe('WORLD_GM_REQUIRED');
    });

    it('non-member (outsider) gets 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/xp`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { award: 100 },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});

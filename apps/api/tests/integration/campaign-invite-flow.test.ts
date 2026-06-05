/**
 * campaign-invite-flow.test.ts — Integration tests for the campaign invite flow.
 *
 * Covers:
 *   5.1 POST /campaigns/:id/invite
 *   5.2 GET  /invites/status/:token
 *   5.3 POST /invites/confirm (atomic dual-write paths)
 *   5.4 GET  /campaigns/:id callerRole
 *
 * SDD spec: REQ-INV-CREATE-01, REQ-INV-STATUS-01, REQ-INV-CONFIRM-01,
 *           REQ-CAL-ROLE-01 (#1872).
 *
 * Requires real Supabase + Postgres (sequential fork pool, 30s timeout).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function createCampaignForGm(
  gmAccessToken: string,
  worldId: string,
  name = 'Invite Test Campaign',
) {
  const app = await getTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { authorization: `Bearer ${gmAccessToken}` },
    payload: { name, worldId },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createCampaignForGm failed: ${res.statusCode} ${res.body}`);
  }
  return res.json() as { id: string; worldId: string };
}

async function createInvite(
  gmAccessToken: string,
  campaignId: string,
  payload: { ttlHours?: number; multiUse?: boolean } = {},
) {
  const app = await getTestApp();
  return app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/invite`,
    headers: { authorization: `Bearer ${gmAccessToken}` },
    payload,
  });
}

function extractToken(url: string): string {
  return url.split('/').pop()!;
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let gm: TestUser;
let player: TestUser;
let outsider: TestUser;
let worldId: string;
let campaignId: string;

describe('campaign-invite-flow', () => {
  beforeAll(async () => {
    await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id, { name: 'Invite World' }));
    const campaign = await createCampaignForGm(gm.accessToken, worldId);
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // =========================================================================
  // 5.1 POST /campaigns/:id/invite
  // =========================================================================
  describe('POST /campaigns/:id/invite', () => {
    it('(a) GM happy path → 201 + url + expiresAt', async () => {
      const res = await createInvite(gm.accessToken, campaignId);
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.url).toMatch(/\/invite\/[0-9a-f]{48}$/);
      expect(typeof body.expiresAt).toBe('string');
      // expiresAt should be approximately 7 days from now (within 10 seconds)
      const diff = new Date(body.expiresAt).getTime() - Date.now();
      expect(diff).toBeGreaterThan(6.9 * 24 * 3_600_000);
      expect(diff).toBeLessThan(7.1 * 24 * 3_600_000);
    });

    it('(b) non-GM → 403 WORLD_GM_REQUIRED', async () => {
      const res = await createInvite(player.accessToken, campaignId);
      // player is not a world GM, so 403
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.issues[0].code).toBe('WORLD_GM_REQUIRED');
    });

    it('(c) ttlHours=0 → 400 (out of bounds)', async () => {
      const res = await createInvite(gm.accessToken, campaignId, { ttlHours: 0 });
      expect(res.statusCode).toBe(400);
    });

    it('(c) ttlHours=721 → 400 (out of bounds)', async () => {
      const res = await createInvite(gm.accessToken, campaignId, { ttlHours: 721 });
      expect(res.statusCode).toBe(400);
    });

    it('(d) unknown campaign → 404', async () => {
      const res = await createInvite(gm.accessToken, randomUUID());
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('NOT_FOUND');
    });

    it('(e) no JWT → 401', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/invite`,
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 5.2 GET /invites/status/:token
  // =========================================================================
  describe('GET /invites/status/:token', () => {
    let validToken: string;

    beforeAll(async () => {
      const res = await createInvite(gm.accessToken, campaignId);
      validToken = extractToken(res.json().url);
    });

    it('(a) valid token, not member → 200 + fields + alreadyMember:false', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invites/status/${validToken}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.campaignName).toBe('string');
      expect(typeof body.worldName).toBe('string');
      expect(typeof body.campaignId).toBe('string');
      expect(body.alreadyMember).toBe(false);
      // raw token must NOT appear in the response
      expect(JSON.stringify(body)).not.toContain(validToken);
    });

    it('(b) expired token → 410 EXPIRED', async () => {
      // Insert an already-expired token directly
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignInviteTokens } = await import('../../src/infra/db/schema.js');
      const { generateToken } = await import('../../src/infra/tokens.js');
      const expiredToken = generateToken();
      await db.insert(campaignInviteTokens).values({
        token: expiredToken,
        campaignId,
        worldId,
        createdByUserId: gm.id,
        role: 'player',
        maxUses: 1,
        useCount: 0,
        expiresAt: new Date(Date.now() - 1000), // already expired
      });

      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invites/status/${expiredToken}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(410);
      expect(res.json().error).toBe('EXPIRED');
    });

    it('(c) useCount=maxUses (consumed single-use) → 410 CONSUMED', async () => {
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignInviteTokens } = await import('../../src/infra/db/schema.js');
      const { generateToken } = await import('../../src/infra/tokens.js');
      const consumedToken = generateToken();
      await db.insert(campaignInviteTokens).values({
        token: consumedToken,
        campaignId,
        worldId,
        createdByUserId: gm.id,
        role: 'player',
        maxUses: 1,
        useCount: 1, // already used
        expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
      });

      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invites/status/${consumedToken}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(410);
      expect(res.json().error).toBe('CONSUMED');
    });

    it('(d) revokedAt set → 410 CONSUMED', async () => {
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignInviteTokens } = await import('../../src/infra/db/schema.js');
      const { generateToken } = await import('../../src/infra/tokens.js');
      const revokedToken = generateToken();
      await db.insert(campaignInviteTokens).values({
        token: revokedToken,
        campaignId,
        worldId,
        createdByUserId: gm.id,
        role: 'player',
        maxUses: 1,
        useCount: 0,
        expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
        revokedAt: new Date(), // explicitly revoked
      });

      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invites/status/${revokedToken}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(410);
      expect(res.json().error).toBe('CONSUMED');
    });

    it('(e) alreadyMember:true for caller who is already a campaign member', async () => {
      // GM is already a campaign member (joined at creation time)
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invites/status/${validToken}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().alreadyMember).toBe(true);
    });

    it('(f) no JWT → 401', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invites/status/${validToken}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 5.3 POST /invites/confirm — atomic dual-write
  // =========================================================================
  describe('POST /invites/confirm', () => {
    it('(a) first-time join → 200 + campaignId; worldMembers + campaignMembers written + useCount=1', async () => {
      // Create a fresh single-use token for the outsider (who has no memberships)
      const inviteRes = await createInvite(gm.accessToken, campaignId);
      const token = extractToken(inviteRes.json().url);

      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invites/confirm',
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { token },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().campaignId).toBe(campaignId);

      // Verify DB state
      const { db } = await import('../../src/infra/db/client.js');
      const { worldMembers, campaignMembers, campaignInviteTokens } = await import(
        '../../src/infra/db/schema.js'
      );
      const { and, eq } = await import('drizzle-orm');

      const wm = await db
        .select()
        .from(worldMembers)
        .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, outsider.id)))
        .limit(1);
      expect(wm.length).toBe(1);
      expect(wm[0]!.role).toBe('player');

      const cm = await db
        .select()
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, outsider.id)))
        .limit(1);
      expect(cm.length).toBe(1);
      expect(cm[0]!.role).toBe('player');

      const tk = await db
        .select({ useCount: campaignInviteTokens.useCount })
        .from(campaignInviteTokens)
        .where(eq(campaignInviteTokens.token, token))
        .limit(1);
      expect(tk[0]!.useCount).toBe(1);
    });

    it('(b) already a campaign member (idempotent) → 200, no duplicate row', async () => {
      // outsider is now a member from test (a). Confirm again with a new token.
      const inviteRes = await createInvite(gm.accessToken, campaignId);
      const token = extractToken(inviteRes.json().url);

      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invites/confirm',
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { token },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().campaignId).toBe(campaignId);

      // Verify no duplicate campaignMembers row
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignMembers } = await import('../../src/infra/db/schema.js');
      const { and, eq } = await import('drizzle-orm');
      const rows = await db
        .select()
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, outsider.id)));
      expect(rows.length).toBe(1); // still just 1 row
    });

    it('(c) already a worldMember GM → worldMembers DO NOTHING (role preserved), campaignMembers lands', async () => {
      // Create a second campaign in the same world for a fresh player with no campaign membership
      const secondCampaign = await createCampaignForGm(gm.accessToken, worldId, 'Second Campaign');

      // player has no worldMembers or campaignMembers row yet
      const inviteRes = await app_inject_invite(gm.accessToken, secondCampaign.id);
      const token = extractToken(inviteRes.url);

      // First, manually add player as worldMember with role='player'
      const { db } = await import('../../src/infra/db/client.js');
      const { worldMembers } = await import('../../src/infra/db/schema.js');
      await db
        .insert(worldMembers)
        .values({ worldId, userId: player.id, role: 'player' })
        .onConflictDoNothing();

      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invites/confirm',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { token },
      });
      expect(res.statusCode).toBe(200);

      // worldMembers row still has role='player' (DO NOTHING preserved it)
      const { eq, and } = await import('drizzle-orm');
      const wmRows = await db
        .select()
        .from(worldMembers)
        .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, player.id)));
      expect(wmRows.length).toBe(1);
      expect(wmRows[0]!.role).toBe('player');
    });

    it('(d) multi-campaign same world: worldMembers DO NOTHING, campaignMembers lands', async () => {
      // Create a third campaign so outsider (already a worldMember from test a) can join
      const thirdCampaign = await createCampaignForGm(gm.accessToken, worldId, 'Third Campaign');
      const inviteRes = await app_inject_invite(gm.accessToken, thirdCampaign.id);
      const token = extractToken(inviteRes.url);

      // outsider already has a worldMembers row from test (a)
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invites/confirm',
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { token },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().campaignId).toBe(thirdCampaign.id);

      // Exactly 1 worldMembers row for outsider (DO NOTHING on duplicate)
      const { db } = await import('../../src/infra/db/client.js');
      const { worldMembers, campaignMembers } = await import('../../src/infra/db/schema.js');
      const { and, eq } = await import('drizzle-orm');

      const wm = await db
        .select()
        .from(worldMembers)
        .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, outsider.id)));
      expect(wm.length).toBe(1);

      const cm = await db
        .select()
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, thirdCampaign.id), eq(campaignMembers.userId, outsider.id)))
        .limit(1);
      expect(cm.length).toBe(1);
    });

    it('(e) expired token at confirm → 410 EXPIRED, no rows written', async () => {
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignInviteTokens } = await import('../../src/infra/db/schema.js');
      const { generateToken } = await import('../../src/infra/tokens.js');
      const expiredToken = generateToken();
      await db.insert(campaignInviteTokens).values({
        token: expiredToken,
        campaignId,
        worldId,
        createdByUserId: gm.id,
        role: 'player',
        maxUses: 1,
        useCount: 0,
        expiresAt: new Date(Date.now() - 1000),
      });

      // Use a brand new user who has never joined anything
      const newUser = await createTestUser();
      try {
        const app = await getTestApp();
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/invites/confirm',
          headers: { authorization: `Bearer ${newUser.accessToken}` },
          payload: { token: expiredToken },
        });
        expect(res.statusCode).toBe(410);
        expect(res.json().error).toBe('EXPIRED');
      } finally {
        await deleteTestUser(newUser.id);
      }
    });

    it('(f) consumed single-use token → 410 CONSUMED, no rows', async () => {
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignInviteTokens } = await import('../../src/infra/db/schema.js');
      const { generateToken } = await import('../../src/infra/tokens.js');
      const consumedToken = generateToken();
      await db.insert(campaignInviteTokens).values({
        token: consumedToken,
        campaignId,
        worldId,
        createdByUserId: gm.id,
        role: 'player',
        maxUses: 1,
        useCount: 1, // already consumed
        expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
      });

      const newUser = await createTestUser();
      try {
        const app = await getTestApp();
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/invites/confirm',
          headers: { authorization: `Bearer ${newUser.accessToken}` },
          payload: { token: consumedToken },
        });
        expect(res.statusCode).toBe(410);
        expect(res.json().error).toBe('CONSUMED');
      } finally {
        await deleteTestUser(newUser.id);
      }
    });

    it('(g) no JWT → 401', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invites/confirm',
        payload: { token: 'any-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 5.4 GET /campaigns/:id — callerRole
  // =========================================================================
  describe('GET /campaigns/:id callerRole', () => {
    it('(a) GM caller → callerRole: gm', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().callerRole).toBe('gm');
    });

    it('(b) player caller (outsider joined in test 5.3a) → callerRole: player', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().callerRole).toBe('player');
    });
  });
});

// ---------------------------------------------------------------------------
// Local helper to avoid duplication in test body
// ---------------------------------------------------------------------------
async function app_inject_invite(gmAccessToken: string, cId: string) {
  const app = await getTestApp();
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${cId}/invite`,
    headers: { authorization: `Bearer ${gmAccessToken}` },
    payload: {},
  });
  if (res.statusCode !== 201) {
    throw new Error(`app_inject_invite: ${res.statusCode} ${res.body}`);
  }
  return res.json() as { url: string; expiresAt: string };
}

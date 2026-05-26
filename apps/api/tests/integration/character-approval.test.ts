/**
 * Integration tests for POST /characters/:id/approve and /reject.
 *
 * Covers REQ-CAF-APPROVE-ENDPOINT, REQ-CAF-REJECT-ENDPOINT from
 * sdd/character-approval-flow/spec (#833).
 *
 * State machine matrix exercised end-to-end with a 3-user fixture:
 *   - dm:      gm worldMember of the test world (can approve / reject / revert).
 *   - player:  owner of the test character; player worldMember (can self-cancel pending).
 *   - outsider: no relation; should always get 403.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('POST /characters/:id/{approve,reject}', () => {
  let dm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let charId: string;

  /** Resets the character to a known status + clears audit fields. */
  async function setStatus(status: 'draft' | 'pending_approval' | 'active'): Promise<void> {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const [row] = await db.select().from(characters).where(eq(characters.id, charId)).limit(1);
    const data = (row?.data as Record<string, unknown>) ?? {};
    await db
      .update(characters)
      .set({
        status,
        data: { ...data, approvedBy: null, approvedAt: null },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, charId));
  }

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Approval Test Campaign' },
      })
      .then((r) => r.json());
    const worldId = campaign.worldId;

    // Add player as a player-role worldMember of dm's world.
    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaign.id, player.id, 'player');

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: 'Approval Test Char' },
      })
      .then((r) => r.json());
    charId = c.id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  describe('approve endpoint', () => {
    it('gm approves pending → 200 + status active + audit fields set', async () => {
      const app = await getTestApp();
      await setStatus('pending_approval');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/approve`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('active');
      expect(body.data.approvedBy).toBe(dm.id);
      expect(typeof body.data.approvedAt).toBe('string');
    });

    it('non-gm non-owner (outsider) → 403 FORBIDDEN', async () => {
      const app = await getTestApp();
      await setStatus('pending_approval');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/approve`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('gm approves already-active char → 409 ILLEGAL_TRANSITION', async () => {
      const app = await getTestApp();
      await setStatus('active');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/approve`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().issues[0].code).toBe('ILLEGAL_TRANSITION');
    });

    it('owner approves own pending → 403 FORBIDDEN_FOR_ACTOR', async () => {
      const app = await getTestApp();
      await setStatus('pending_approval');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/approve`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues[0].code).toBe('FORBIDDEN_FOR_ACTOR');
    });
  });

  describe('reject endpoint', () => {
    it('gm rejects pending → 200 + status draft + audit cleared', async () => {
      const app = await getTestApp();
      // Seed pending with audit fields set (from a prior approve).
      const { db } = await import('../../src/infra/db/client.js');
      const { characters } = await import('../../src/infra/db/schema.js');
      await db
        .update(characters)
        .set({
          status: 'pending_approval',
          data: { approvedBy: dm.id, approvedAt: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq(characters.id, charId));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/reject`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('draft');
      expect(body.data.approvedBy).toBeNull();
      expect(body.data.approvedAt).toBeNull();
    });

    it('owner self-cancels pending → 200', async () => {
      const app = await getTestApp();
      await setStatus('pending_approval');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/reject`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('draft');
    });

    it('gm reverts active → draft (re-edit workflow)', async () => {
      const app = await getTestApp();
      await setStatus('active');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/reject`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('draft');
    });

    it('owner cannot revert active → 403 FORBIDDEN_FOR_ACTOR', async () => {
      const app = await getTestApp();
      await setStatus('active');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${charId}/reject`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues[0].code).toBe('FORBIDDEN_FOR_ACTOR');
    });
  });
});

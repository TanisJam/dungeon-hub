/**
 * Integration tests for GET /worlds/:id/characters.
 *
 * Covers REQ-WDCL-LIST-ENDPOINT + REQ-WDCL-STATUS-FILTER from
 * SDD `dm-session-panel/spec` (#857).
 *
 * Fixture topology:
 *   - dm:        gm worldMember of the test world (created via createWorldWithGm)
 *   - player:    player worldMember
 *   - outsider:  no membership row
 *
 * The DM creates 4 characters in this world with distinct statuses so we can
 * exercise single-status and multi-status filter combos without leaking into
 * other tests' worlds.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

describe('GET /worlds/:id/characters', () => {
  let dm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;

  /** All characters created in beforeAll, keyed by status for assertions. */
  const charIds: Record<string, string> = {};

  async function seedCharacter(name: string, status: string): Promise<string> {
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    const [row] = await db
      .insert(characters)
      .values({
        userId: player.id,
        worldId,
        name,
        status: status as 'draft' | 'pending_approval' | 'active' | 'retired' | 'dead',
        // Minimal data shape: classes array so the projection covers the happy path.
        data: { classes: [{ classSlug: 'fighter', level: 3 }] },
      })
      .returning({ id: characters.id });
    if (!row) throw new Error(`seedCharacter: failed to insert ${name}`);
    return row.id;
  }

  beforeAll(async () => {
    await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(dm.id, { name: 'DM Panel World' }));
    await addWorldMember(worldId, player.id, 'player');

    charIds.draft = await seedCharacter('Drafty', 'draft');
    charIds.pending = await seedCharacter('Pendings', 'pending_approval');
    charIds.active = await seedCharacter('Activia', 'active');
    charIds.retired = await seedCharacter('Retiree', 'retired');
  });

  afterAll(async () => {
    // Characters cascade-delete via worldMembers/world cleanup in deleteTestUser.
    // Explicit delete to keep the table tidy and avoid cross-test interference.
    const { db } = await import('../../src/infra/db/client.js');
    const { characters } = await import('../../src/infra/db/schema.js');
    for (const id of Object.values(charIds)) {
      await db.delete(characters).where(eq(characters.id, id));
    }
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  describe('auth / membership matrix', () => {
    it('gm caller → 200 with full list and ownerUsername populated', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.characters)).toBe(true);
      expect(body.characters).toHaveLength(4);
      const firstByName = body.characters.find((c: { name: string }) => c.name === 'Activia');
      expect(firstByName).toBeDefined();
      expect(firstByName.ownerUserId).toBe(player.id);
      // ownerUsername sourced from public.users — non-empty string.
      expect(typeof firstByName.ownerUsername).toBe('string');
      expect(firstByName.ownerUsername.length).toBeGreaterThan(0);
      // Class projection lands as { classSlug, level } + summed level.
      expect(firstByName.classes).toEqual([{ classSlug: 'fighter', level: 3 }]);
      expect(firstByName.level).toBe(3);
    });

    it('player caller → 200 with same full list (read-symmetric)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters`,
        headers: { authorization: `Bearer ${player.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.characters).toHaveLength(4);
    });

    it('non-member (outsider) → 403 FORBIDDEN, no body leak', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.characters).toBeUndefined();
    });

    it('unauthenticated → 401', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('status filter', () => {
    it('?status=pending_approval → only the pending char', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters?status=pending_approval`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.characters).toHaveLength(1);
      expect(body.characters[0].status).toBe('pending_approval');
      expect(body.characters[0].id).toBe(charIds.pending);
    });

    it('?status=pending_approval,active → both rows', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters?status=pending_approval,active`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.characters).toHaveLength(2);
      const ids = body.characters.map((c: { id: string }) => c.id).sort();
      expect(ids).toEqual([charIds.pending, charIds.active].sort());
    });

    it('?status=banished → 400 VALIDATION_FAILED INVALID_STATUS', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters?status=banished`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0].code).toBe('INVALID_STATUS');
    });

    it('missing ?status= → all statuses', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const statuses = new Set(body.characters.map((c: { status: string }) => c.status));
      expect(statuses).toEqual(new Set(['draft', 'pending_approval', 'active', 'retired']));
    });
  });
});

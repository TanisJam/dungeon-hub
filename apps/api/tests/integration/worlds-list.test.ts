/**
 * worlds-list.test.ts — C6 integration tests
 *
 * Validates GET /worlds?mine=1 returns the worlds where the authenticated user
 * has a worldMembers row (any role).
 *
 * REQ covered: GET /worlds?mine=1 from C6.T2.a
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { DEFAULT_RULES_PROFILE } from '@dungeon-hub/domain/rules-profile';

// ---------------------------------------------------------------------------
// Local helper — create a world and insert the userId as a member (any role)
// ---------------------------------------------------------------------------

async function createWorldWithMember(
  ownerUserId: string,
  memberUserId: string,
  role: 'gm' | 'player',
  opts?: { name?: string },
): Promise<{ worldId: string; name: string }> {
  const { db } = await import('../../src/infra/db/client.js');
  const { worlds, worldMembers } = await import('../../src/infra/db/schema.js');
  const name = opts?.name ?? `Test World ${randomUUID().slice(0, 8)}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomUUID().slice(0, 8);
  const [world] = await db
    .insert(worlds)
    .values({ name, slug, ownerUserId, rulesProfile: DEFAULT_RULES_PROFILE })
    .returning({ id: worlds.id, name: worlds.name });
  if (!world) throw new Error('Failed to create world');
  await db.insert(worldMembers).values({ worldId: world.id, userId: memberUserId, role });
  return { worldId: world.id, name: world.name };
}

async function deleteWorldsOwnedBy(userId: string) {
  const { db } = await import('../../src/infra/db/client.js');
  const { worlds } = await import('../../src/infra/db/schema.js');
  const { eq } = await import('drizzle-orm');
  await db.delete(worlds).where(eq(worlds.ownerUserId, userId));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /worlds?mine=1', () => {
  let owner: TestUser;
  let member: TestUser;

  beforeAll(async () => {
    await getTestApp();
    owner = await createTestUser();
    member = await createTestUser();
  });

  afterAll(async () => {
    await deleteWorldsOwnedBy(owner.id);
    await deleteTestUser(owner.id);
    await deleteTestUser(member.id);
    await closeTestApp();
  });

  // T-1: user in 2 worlds → returns both
  it('T-1: user in 2 worlds returns both', async () => {
    const app = await getTestApp();

    // Create 2 worlds where `member` is a member (with different roles)
    await createWorldWithMember(owner.id, member.id, 'gm', { name: `List World A ${randomUUID().slice(0, 6)}` });
    await createWorldWithMember(owner.id, member.id, 'player', { name: `List World B ${randomUUID().slice(0, 6)}` });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/worlds?mine=1',
      headers: { Authorization: `Bearer ${member.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ worlds: Array<{ id: string; name: string; slug: string }> }>();
    expect(Array.isArray(body.worlds)).toBe(true);
    expect(body.worlds.length).toBeGreaterThanOrEqual(2);
    // All returned worlds should have the minimal shape
    for (const w of body.worlds) {
      expect(typeof w.id).toBe('string');
      expect(typeof w.name).toBe('string');
      expect(typeof w.slug).toBe('string');
    }
  });

  // T-2: user in 0 worlds → 200 with empty array
  it('T-2: user in 0 worlds returns empty array (200, not 404)', async () => {
    const app = await getTestApp();
    const noWorldUser = await createTestUser();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/worlds?mine=1',
      headers: { Authorization: `Bearer ${noWorldUser.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ worlds: unknown[] }>();
    expect(Array.isArray(body.worlds)).toBe(true);
    expect(body.worlds.length).toBe(0);

    await deleteTestUser(noWorldUser.id);
  });

  // T-3: unauthenticated → 401
  it('T-3: unauthenticated request returns 401', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/worlds?mine=1',
    });

    expect(res.statusCode).toBe(401);
  });
});

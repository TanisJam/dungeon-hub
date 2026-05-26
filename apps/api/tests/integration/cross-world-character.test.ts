/**
 * cross-world-character.test.ts — C4 integration tests
 *
 * Validates REQ-WF-API-CROSS-WORLD-SESSION:
 * loadCharacterForSession rejects characters whose worldId ≠ session's campaign's worldId,
 * emitting issue code CHARACTER_NOT_IN_WORLD.
 *
 * Setup:
 *   - dm: owner of World W1, Campaign K1.
 *   - alice: player in both W1 (char C1) and W2 (char C2).
 *   - Session S1 lives under K1 (world W1).
 *   - Joining S1 with C1 (same world) → 200.
 *   - Joining S1 with C2 (different world) → 400 CHARACTER_NOT_IN_WORLD.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { DEFAULT_RULES_PROFILE } from '@dungeon-hub/domain/rules-profile';

// ---------------------------------------------------------------------------
// Local helpers (inline until C7 extracts createWorldWithGm)
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
    .values({ name, slug, ownerUserId: userId, rulesProfile: DEFAULT_RULES_PROFILE })
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
// Tests
// ---------------------------------------------------------------------------

describe('cross-world character rejection — REQ-WF-API-CROSS-WORLD-SESSION', () => {
  let dm: TestUser;
  let alice: TestUser;

  /** World W1 — dm owns it, alice is a player */
  let w1Id: string;
  /** World W2 — separate world, alice owns it (so she can create a char there) */
  let w2Id: string;

  /** Campaign K1 lives in W1 */
  let k1Id: string;

  /** Session S1 lives under K1 (world W1) */
  let s1Id: string;

  /** Alice's character in W1 */
  let c1Id: string;
  /** Alice's character in W2 */
  let c2Id: string;

  beforeAll(async () => {
    const app = await getTestApp();

    dm = await createTestUser();
    alice = await createTestUser();

    // 1. Create W1 with dm as GM; alice is a player
    ({ worldId: w1Id } = await createWorldWithGm(dm.id, { name: 'Cross-World W1' }));
    await addWorldMember(w1Id, alice.id, 'player');

    // 2. Create W2 with alice as GM (separate world)
    ({ worldId: w2Id } = await createWorldWithGm(alice.id, { name: 'Cross-World W2' }));

    // 3. Create campaign K1 directly in W1
    const { db } = await import('../../src/infra/db/client.js');
    const { campaigns, characters } = await import('../../src/infra/db/schema.js');
    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');

    const [campaign] = await db
      .insert(campaigns)
      .values({ name: 'K1 Campaign', gmUserId: dm.id, worldId: w1Id })
      .returning({ id: campaigns.id });
    if (!campaign) throw new Error('Failed to create campaign K1');
    k1Id = campaign.id;

    // Add dm as campaign GM and alice as player in K1
    await addCampaignAndWorldMember(k1Id, dm.id, 'gm');
    await addCampaignAndWorldMember(k1Id, alice.id, 'player');

    // 4. Create session S1 under K1 (owned by dm)
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { campaignId: k1Id, title: 'Cross-World Session S1' },
    });
    if (sessionRes.statusCode !== 201) {
      throw new Error(`Failed to create session: ${sessionRes.statusCode} ${sessionRes.body}`);
    }
    s1Id = sessionRes.json().id;

    // 5. Create C1 for alice in W1 (direct DB insert — C5 handles API endpoint)
    const [char1] = await db
      .insert(characters)
      .values({ userId: alice.id, worldId: w1Id, name: 'Alice-W1 Char', data: {} })
      .returning({ id: characters.id });
    if (!char1) throw new Error('Failed to create character C1');
    c1Id = char1.id;

    // 6. Create C2 for alice in W2 (different world)
    const [char2] = await db
      .insert(characters)
      .values({ userId: alice.id, worldId: w2Id, name: 'Alice-W2 Char', data: {} })
      .returning({ id: characters.id });
    if (!char2) throw new Error('Failed to create character C2');
    c2Id = char2.id;
  });

  afterAll(async () => {
    await deleteWorldsForUser(dm.id);
    await deleteWorldsForUser(alice.id);
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    await closeTestApp();
  });

  it('positive: alice joins S1 with C1 (same world W1) → 200', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${s1Id}/join`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: c1Id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.participants.some((p: { characterId: string }) => p.characterId === c1Id)).toBe(
      true,
    );
  });

  it('cross-world: alice joins S1 with C2 (world W2) → 400 CHARACTER_NOT_IN_WORLD', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${s1Id}/join`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { characterId: c2Id },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues[0].code).toBe('CHARACTER_NOT_IN_WORLD');
    expect(body.issues[0].characterId).toBe(c2Id);
    expect(body.issues[0].sessionId).toBe(s1Id);
    expect(body.issues[0].expected).toBe(w1Id);
    expect(body.issues[0].got).toBe(w2Id);
  });
});

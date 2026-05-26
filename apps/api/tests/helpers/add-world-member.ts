/**
 * Inserts a worldMembers row. Use in integration tests when a user must be
 * recognized as a world-level member (player or gm) for write-path gates that
 * check `worldMembers` directly (e.g. POST /characters).
 *
 * Idempotent: silently no-ops if the (worldId, userId) pair already exists.
 */
export async function addWorldMember(
  worldId: string,
  userId: string,
  role: 'gm' | 'player',
): Promise<void> {
  const { db } = await import('../../src/infra/db/client.js');
  const { worldMembers } = await import('../../src/infra/db/schema.js');
  await db.insert(worldMembers).values({ worldId, userId, role }).onConflictDoNothing();
}

/**
 * Convenience for tests that join a user to a campaign as a player/gm: inserts
 * both `campaignMembers` (so campaign-scoped read-paths see them) and
 * `worldMembers` (so world-scoped write-paths see them).
 *
 * Resolves `worldId` from the campaign internally. Use this in place of
 * `db.insert(campaignMembers).values(...)` in integration setups.
 */
export async function addCampaignAndWorldMember(
  campaignId: string,
  userId: string,
  role: 'gm' | 'player',
): Promise<void> {
  const { db } = await import('../../src/infra/db/client.js');
  const { campaigns, campaignMembers } = await import('../../src/infra/db/schema.js');
  const { eq } = await import('drizzle-orm');

  const rows = await db
    .select({ worldId: campaigns.worldId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  const worldId = rows[0]?.worldId;
  if (!worldId) {
    throw new Error(`addCampaignAndWorldMember: campaign ${campaignId} not found`);
  }

  await db
    .insert(campaignMembers)
    .values({ campaignId, userId, role })
    .onConflictDoNothing();
  await addWorldMember(worldId, userId, role);
}

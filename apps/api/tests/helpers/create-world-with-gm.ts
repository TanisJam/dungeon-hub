import { randomUUID } from 'node:crypto';
import { DEFAULT_RULES_PROFILE } from '@dungeon-hub/domain/rules-profile';

/**
 * Creates a world with the given userId as GM owner + inserts the gm worldMember row.
 *
 * Use this in integration test beforeAll/beforeEach setups wherever a world context
 * is required. deleteTestUser handles world cleanup via ON DELETE CASCADE on worldMembers
 * and explicit DELETE on worlds (owner FK is ON DELETE RESTRICT — see deleteTestUser).
 *
 * @param userId - The user ID to assign as world owner + gm worldMember.
 * @param opts.name - World name (default: "Test World <random>").
 * @param opts.slug - World slug (default: derived from name + random suffix).
 */
export async function createWorldWithGm(
  userId: string,
  opts?: { name?: string; slug?: string },
): Promise<{ worldId: string; gmUserId: string }> {
  const { db } = await import('../../src/infra/db/client.js');
  const { worlds, worldMembers } = await import('../../src/infra/db/schema.js');

  const name = opts?.name ?? `Test World ${randomUUID().slice(0, 8)}`;
  const slug =
    opts?.slug ??
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomUUID().slice(0, 8);

  const [world] = await db
    .insert(worlds)
    .values({
      name,
      slug,
      ownerUserId: userId,
      rulesProfile: DEFAULT_RULES_PROFILE,
    })
    .returning({ id: worlds.id });

  if (!world) throw new Error(`createWorldWithGm: failed to insert world for userId=${userId}`);

  await db.insert(worldMembers).values({ worldId: world.id, userId, role: 'gm' });

  return { worldId: world.id, gmUserId: userId };
}

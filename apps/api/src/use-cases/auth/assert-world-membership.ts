import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { worldMembers } from '../../infra/db/schema.js';

export type WorldMembershipCheck = { ok: true; role: 'gm' | 'player' } | { ok: false };

/**
 * Checks whether `userId` is ANY member (gm or player) of `worldId`.
 *
 * Used by POST /characters to gate character creation — any world member
 * (regardless of role) can create a character in the world.
 *
 * Returns { ok: true, role } if the user has any membership, { ok: false } otherwise.
 */
export async function assertWorldMembership(
  worldId: string,
  userId: string,
): Promise<WorldMembershipCheck> {
  const rows = await db
    .select({ role: worldMembers.role })
    .from(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)))
    .limit(1);

  if (rows.length === 0) return { ok: false };
  return { ok: true, role: rows[0]!.role };
}

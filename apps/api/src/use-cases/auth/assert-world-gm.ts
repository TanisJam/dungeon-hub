import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { worldMembers } from '../../infra/db/schema.js';
import { assertWorldGm as assertWorldGmDomain } from '@dungeon-hub/domain/world';

export type WorldGmCheck = { ok: true } | { ok: false };

/**
 * Checks whether `userId` is a GM-role worldMember of `worldId`.
 *
 * Strategy: query only the user's row for that world (single-row filtered query),
 * then pass a single-element array to the domain primitive. This is more efficient
 * than loading all members when we only care about one user's membership.
 *
 * Returns { ok: true } if the user is a GM, { ok: false } otherwise.
 */
export async function assertWorldGm(worldId: string, userId: string): Promise<WorldGmCheck> {
  const rows = await db
    .select({ worldId: worldMembers.worldId, userId: worldMembers.userId, role: worldMembers.role })
    .from(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)))
    .limit(1);

  const result = assertWorldGmDomain(rows, worldId, userId);
  if (result.ok) return { ok: true };
  return { ok: false };
}

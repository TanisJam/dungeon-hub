import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { worldMembers } from '../../infra/db/schema.js';

export type WorldAccess = 'gm' | 'player' | 'none';

/**
 * Returns the access level of `userId` in `worldId` by querying `worldMembers`.
 *
 * Strategy: single-row filtered query (same pattern as assertWorldGm) — only
 * loads the requesting user's membership row, not the full member list.
 *
 *  - 'gm'    = member with role='gm'    → full access (unexplored hexes + dmNotes).
 *  - 'player' = member with role='player' → limited access (no unexplored, no dmNotes).
 *  - 'none'  = not a member             → 403.
 *
 * Replaces getMapAccess (campaign-scoped) for world-entity routes (hexes, pois,
 * factions, npcs, lore). getMapAccess stays in load-hex.ts for encounter routes
 * which remain campaign-scoped (out of scope — world-first-model).
 */
export async function getWorldAccess(worldId: string, userId: string): Promise<WorldAccess> {
  const rows = await db
    .select({ role: worldMembers.role })
    .from(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)))
    .limit(1);

  if (rows.length === 0) return 'none';
  return rows[0]!.role === 'gm' ? 'gm' : 'player';
}

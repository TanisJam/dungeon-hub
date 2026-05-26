import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters, worldMembers } from '../../infra/db/schema.js';

export interface LoadedCharacter {
  id: string;
  userId: string;
  worldId: string;
  name: string;
  status: 'draft' | 'active' | 'retired' | 'dead' | 'pending_approval';
  data: unknown;
  inventory: unknown;
  xp: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadCharacter(id: string): Promise<LoadedCharacter | null> {
  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
  return (rows[0] as LoadedCharacter | undefined) ?? null;
}

export type CharacterAccess = 'owner' | 'world-member' | 'none';

/**
 * Devuelve el nivel de acceso del user sobre el personaje:
 * - 'owner':        el user dueño → full access (read/write/delete).
 * - 'world-member': el user pertenece al world del personaje → read-only.
 * - 'none':         sin acceso → 403.
 *
 * Post-C2: access is scoped to world membership, not campaign membership.
 * Characters belong to worlds (campaign_id dropped in migration 0015).
 */
export async function getCharacterAccess(
  character: LoadedCharacter,
  userId: string,
): Promise<CharacterAccess> {
  if (character.userId === userId) return 'owner';

  const member = await db
    .select({ role: worldMembers.role })
    .from(worldMembers)
    .where(
      and(
        eq(worldMembers.worldId, character.worldId),
        eq(worldMembers.userId, userId),
      ),
    )
    .limit(1);

  return member.length > 0 ? 'world-member' : 'none';
}

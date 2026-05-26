import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters, campaignMembers, campaigns, worldMembers } from '../../infra/db/schema.js';

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

/**
 * Verifica que el user sea miembro de la campaña (precondición para crear personaje ahí).
 * Devuelve la campaign si es miembro, null si no.
 *
 * NOTE: This function checks campaign-level membership (campaign_members table).
 * Character creation is a C5 concern (switching from campaignId → worldId).
 * Kept as-is for C5 migration.
 */
export async function assertCampaignMembership(
  campaignId: string,
  userId: string,
): Promise<{ id: string; name: string; gmUserId: string } | null> {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      gmUserId: campaigns.gmUserId,
    })
    .from(campaigns)
    .innerJoin(campaignMembers, eq(campaignMembers.campaignId, campaigns.id))
    .where(and(eq(campaigns.id, campaignId), eq(campaignMembers.userId, userId)))
    .limit(1);

  return rows[0] ?? null;
}

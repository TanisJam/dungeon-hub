import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters, campaignMembers, campaigns } from '../../infra/db/schema.js';

export interface LoadedCharacter {
  id: string;
  userId: string;
  campaignId: string;
  name: string;
  status: 'draft' | 'active' | 'retired' | 'dead';
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

export type CharacterAccess = 'owner' | 'campaign-member' | 'none';

/**
 * Devuelve el nivel de acceso del user sobre el personaje:
 * - 'owner':           el user dueño → full access (read/write/delete).
 * - 'campaign-member': el user pertenece a la campaña del personaje → read-only.
 * - 'none':            sin acceso → 403.
 */
export async function getCharacterAccess(
  character: LoadedCharacter,
  userId: string,
): Promise<CharacterAccess> {
  if (character.userId === userId) return 'owner';

  const member = await db
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, character.campaignId),
        eq(campaignMembers.userId, userId),
      ),
    )
    .limit(1);

  return member.length > 0 ? 'campaign-member' : 'none';
}

/**
 * Verifica que el user sea miembro de la campaña (precondición para crear personaje ahí).
 * Devuelve la campaign si es miembro, null si no.
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

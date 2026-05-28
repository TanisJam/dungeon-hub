/**
 * load-campaign-members.ts — Returns the member list for a campaign with
 * username resolved from `public.users.username` (NOT `auth.users.email`,
 * which requires service role and is cross-schema — see SDD #858 D6).
 *
 * Used by GET /campaigns/:id to power the v3 detail page member section.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { campaignMembers, users } from '../../infra/db/schema.js';

export interface CampaignMember {
  userId: string;
  username: string;
  role: 'gm' | 'player';
  joinedAt: Date;
}

export async function loadCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  const rows = await db
    .select({
      userId: campaignMembers.userId,
      username: users.username,
      role: campaignMembers.role,
      joinedAt: campaignMembers.joinedAt,
    })
    .from(campaignMembers)
    .innerJoin(users, eq(users.id, campaignMembers.userId))
    .where(eq(campaignMembers.campaignId, campaignId))
    .orderBy(campaignMembers.joinedAt);

  return rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    role: r.role as 'gm' | 'player',
    joinedAt: r.joinedAt,
  }));
}

/**
 * list-user-campaigns.ts — Powers GET /campaigns for the v3 `/campanas` screen.
 *
 * Single SQL with correlated subselects:
 *   - playersCount   — COUNT(campaign_members WHERE role='player')
 *   - sessionsCount  — COUNT(sessions WHERE status='completed')
 *   - nextSession    — MIN(sessions.scheduled_at WHERE status='scheduled' AND scheduled_at > NOW())
 *   - pendingFichas  — COUNT(characters WHERE world_id=c.world_id AND status='pending_approval')
 *                      GATED to NULL for non-GM callers (SQL CASE WHEN).
 *
 * One-shot aware: zero sessions, null nextSession both render as valid steady states.
 * See sdd/campanas-v3/design (engram #1035) and memory #1031.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { campaigns, campaignMembers } from '../../infra/db/schema.js';

export interface UserCampaignRow {
  id: string;
  name: string;
  gmUserId: string;
  worldId: string;
  createdAt: Date;
  memberRole: 'gm' | 'player';
  playersCount: number;
  sessionsCount: number;
  nextSession: Date | null;
  pendingFichas: number | null;
}

export async function listUserCampaigns(userId: string): Promise<UserCampaignRow[]> {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      gmUserId: campaigns.gmUserId,
      worldId: campaigns.worldId,
      createdAt: campaigns.createdAt,
      memberRole: campaignMembers.role,
      playersCount: sql<string>`(
        SELECT COUNT(*) FROM campaign_members
        WHERE campaign_id = ${campaigns.id} AND role = 'player'
      )`,
      sessionsCount: sql<string>`(
        SELECT COUNT(*) FROM sessions
        WHERE campaign_id = ${campaigns.id} AND status = 'completed'
      )`,
      nextSession: sql<Date | null>`(
        SELECT MIN(scheduled_at) FROM sessions
        WHERE campaign_id = ${campaigns.id}
          AND status = 'scheduled'
          AND scheduled_at > NOW()
      )`,
      pendingFichas: sql<string | null>`(
        CASE WHEN ${campaignMembers.role} = 'gm' THEN (
          SELECT COUNT(*) FROM characters
          WHERE world_id = ${campaigns.worldId} AND status = 'pending_approval'
        ) ELSE NULL END
      )`,
    })
    .from(campaigns)
    .innerJoin(campaignMembers, eq(campaignMembers.campaignId, campaigns.id))
    .where(eq(campaignMembers.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    gmUserId: r.gmUserId,
    worldId: r.worldId,
    createdAt: r.createdAt,
    memberRole: r.memberRole as 'gm' | 'player',
    playersCount: Number(r.playersCount),
    sessionsCount: Number(r.sessionsCount),
    nextSession: r.nextSession,
    pendingFichas: r.pendingFichas === null ? null : Number(r.pendingFichas),
  }));
}

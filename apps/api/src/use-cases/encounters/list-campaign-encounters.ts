/**
 * list-campaign-encounters.ts — Returns encounters for a campaign ordered
 * by createdAt DESC (newest first). Does NOT load combatants — use
 * `loadEncounter(id)` for the detail endpoint.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters } from '../../infra/db/schema.js';

export interface EncounterSummaryRow {
  id: string;
  campaignId: string;
  name: string;
  round: number;
  status: 'active' | 'completed';
  currentCombatantId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listCampaignEncounters(campaignId: string): Promise<EncounterSummaryRow[]> {
  const rows = await db
    .select({
      id: encounters.id,
      campaignId: encounters.campaignId,
      name: encounters.name,
      round: encounters.round,
      status: encounters.status,
      currentCombatantId: encounters.currentCombatantId,
      version: encounters.version,
      createdAt: encounters.createdAt,
      updatedAt: encounters.updatedAt,
    })
    .from(encounters)
    .where(eq(encounters.campaignId, campaignId))
    .orderBy(desc(encounters.createdAt));

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaignId,
    name: r.name,
    round: r.round,
    status: r.status as 'active' | 'completed',
    currentCombatantId: r.currentCombatantId,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

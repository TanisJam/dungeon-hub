import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { npcs } from '../../infra/db/schema.js';
import type { MapAccess } from '../map/load-hex.js';

export type NpcStatus = 'alive' | 'dead' | 'missing' | 'unknown';

export interface LoadedNpc {
  id: string;
  campaignId: string;
  name: string;
  race: string | null;
  description: string | null;
  dmNotes: string | null;
  factionId: string | null;
  hexId: string | null;
  status: NpcStatus;
  worldX: number | null;
  worldY: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadNpc(id: string): Promise<LoadedNpc | null> {
  const rows = await db.select().from(npcs).where(eq(npcs.id, id)).limit(1);
  return (rows[0] as LoadedNpc | undefined) ?? null;
}

export async function listNpcsInCampaign(campaignId: string): Promise<LoadedNpc[]> {
  const rows = await db.select().from(npcs).where(eq(npcs.campaignId, campaignId));
  return rows as LoadedNpc[];
}

export function sanitizeNpcForRole(
  npc: LoadedNpc,
  access: MapAccess,
): Omit<LoadedNpc, 'dmNotes'> & { dmNotes?: string | null } {
  if (access === 'gm') return npc;
  const { dmNotes: _omit, ...rest } = npc;
  return rest;
}
